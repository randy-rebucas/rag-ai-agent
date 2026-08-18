import type { ActionTool } from "@prisma/client";
import type { AdminGraphqlClient } from "../../shopify-data/client.server";
import { executeUpdatePrice, validateUpdatePriceArgs } from "./update-price.server";
import { executeUpdateInventory, validateUpdateInventoryArgs } from "./update-inventory.server";

// Both tools here are the spec's own examples of operations that must always
// require approval (§21) — there is no low-risk/auto-execute path in this registry.

export function validateToolArgs(tool: ActionTool, args: unknown): boolean {
  switch (tool) {
    case "UPDATE_PRICE":
      return validateUpdatePriceArgs(args);
    case "UPDATE_INVENTORY":
      return validateUpdateInventoryArgs(args);
  }
}

export async function runTool(tool: ActionTool, admin: AdminGraphqlClient, args: unknown): Promise<unknown> {
  switch (tool) {
    case "UPDATE_PRICE":
      if (!validateUpdatePriceArgs(args)) throw new Error(`Invalid arguments for ${tool}: ${JSON.stringify(args)}`);
      return executeUpdatePrice(admin, args);
    case "UPDATE_INVENTORY":
      if (!validateUpdateInventoryArgs(args)) throw new Error(`Invalid arguments for ${tool}: ${JSON.stringify(args)}`);
      return executeUpdateInventory(admin, args);
  }
}
