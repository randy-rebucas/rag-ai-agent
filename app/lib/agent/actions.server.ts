import type { Action, ActionTool, Prisma } from "@prisma/client";
import db from "../../db.server";
import { recordEvent } from "../shopify-data/events.server";
import { validateToolArgs, runTool } from "./tools/registry";
import { saveMemory } from "../memory/memory.server";
import type { AdminGraphqlClient } from "../shopify-data/client.server";
import type { ContextSource } from "../context/types";

export type PrepareActionInput = {
  shopId: string;
  tool: ActionTool;
  arguments: Record<string, unknown>;
  reasoning?: string;
  sourceRefs?: ContextSource[];
  actor: string;
};

/** READ -> ANALYZE -> RECOMMEND -> PREPARE ACTION (spec §21). Validates args up front so a bad extraction never even reaches PENDING_APPROVAL. */
export async function prepareAction(input: PrepareActionInput): Promise<Action> {
  if (!validateToolArgs(input.tool, input.arguments)) {
    throw new Error(`Invalid arguments for tool ${input.tool}`);
  }

  const action = await db.action.create({
    data: {
      shopId: input.shopId,
      tool: input.tool,
      arguments: input.arguments as Prisma.InputJsonValue,
      reasoning: input.reasoning ?? null,
      sourceRefs: (input.sourceRefs ?? null) as Prisma.InputJsonValue,
      actor: input.actor,
    },
  });

  await recordEvent({
    shopId: input.shopId,
    eventType: "AI_ACTION_PREPARED",
    entityType: "action",
    entityId: action.id,
    payload: { tool: action.tool, arguments: input.arguments } as Prisma.InputJsonValue,
    occurredAt: new Date(),
  });

  // Makes past recommendations semantically searchable via searchMemory/buildContext,
  // not just queryable by id — a failure here (e.g. embeddings API down) must
  // never block the action itself from being prepared.
  try {
    await saveMemory({
      shopId: input.shopId,
      memoryType: "DECISION",
      entityType: "action",
      entityId: action.id,
      content: `Decision: ${input.tool} — ${JSON.stringify(input.arguments)}. ${input.reasoning ?? ""}`.trim(),
      source: input.actor,
      confidence: 0.8,
      importance: 0.7,
      metadata: { tool: input.tool, status: action.status },
    });
  } catch (error) {
    console.error(`Failed to save decision memory for action ${action.id}:`, error);
  }

  return action;
}

async function claimAction(
  shopId: string,
  actionId: string,
  fromStatus: "PENDING_APPROVAL" | "APPROVED",
  toStatus: "APPROVED" | "REJECTED" | "EXECUTED" | "FAILED",
  extraData: Prisma.ActionUpdateInput = {},
): Promise<Action | null> {
  // Atomic compare-and-swap via updateMany's guarded where clause — this IS
  // the idempotency mechanism (spec §22): a row can only be claimed once per
  // transition, so a concurrent double-call can't approve/execute twice.
  const { count } = await db.action.updateMany({
    where: { id: actionId, shopId, status: fromStatus },
    data: { status: toStatus, ...extraData } as Prisma.ActionUpdateManyMutationInput,
  });

  if (count === 0) return null;
  return db.action.findUnique({ where: { id: actionId } });
}

export async function approveAction(shopId: string, actionId: string): Promise<Action | null> {
  const action = await claimAction(shopId, actionId, "PENDING_APPROVAL", "APPROVED", {
    approvedAt: new Date(),
  });
  if (!action) return null;

  await recordEvent({
    shopId,
    eventType: "AI_ACTION_APPROVED",
    entityType: "action",
    entityId: action.id,
    payload: { tool: action.tool },
    occurredAt: new Date(),
  });

  return action;
}

export async function rejectAction(shopId: string, actionId: string): Promise<Action | null> {
  return claimAction(shopId, actionId, "PENDING_APPROVAL", "REJECTED");
}

export type ExecuteActionResult =
  | { outcome: "executed"; action: Action }
  | { outcome: "already_claimed" }
  | { outcome: "failed"; action: Action; error: string };

export async function executeAction(
  shopId: string,
  actionId: string,
  admin: AdminGraphqlClient,
): Promise<ExecuteActionResult> {
  // Claim the row before doing the write — see claimAction's comment.
  const claimed = await claimAction(shopId, actionId, "APPROVED", "EXECUTED", {
    executedAt: new Date(),
  });
  if (!claimed) return { outcome: "already_claimed" };

  try {
    const result = await runTool(claimed.tool, admin, claimed.arguments);
    const action = await db.action.update({
      where: { id: claimed.id },
      data: { result: result as Prisma.InputJsonValue },
    });

    await recordEvent({
      shopId,
      eventType: "AI_ACTION_EXECUTED",
      entityType: "action",
      entityId: action.id,
      payload: { tool: action.tool, success: true },
      occurredAt: new Date(),
    });

    return { outcome: "executed", action };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const action = await db.action.update({
      where: { id: claimed.id },
      data: { status: "FAILED", result: { error: message } as Prisma.InputJsonValue },
    });

    await recordEvent({
      shopId,
      eventType: "AI_ACTION_EXECUTED",
      entityType: "action",
      entityId: action.id,
      payload: { tool: action.tool, success: false, error: message },
      occurredAt: new Date(),
    });

    return { outcome: "failed", action, error: message };
  }
}
