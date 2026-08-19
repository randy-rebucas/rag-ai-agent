import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import { PendingActionControls } from "../components/PendingActionControls";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);

  const [pendingActions, recentActions, insights] = await Promise.all([
    db.action.findMany({
      where: { shopId: shop.id, status: "PENDING_APPROVAL" },
      orderBy: { createdAt: "desc" },
    }),
    db.action.findMany({
      where: { shopId: shop.id, status: { not: "PENDING_APPROVAL" } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.memory.findMany({
      where: { shopId: shop.id, memoryType: "INSIGHT" },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return { pendingActions, recentActions, insights };
};

const STATUS_TONE: Record<string, "success" | "warning" | "critical" | "neutral" | "info"> = {
  EXECUTED: "success",
  APPROVED: "info",
  REJECTED: "neutral",
  FAILED: "critical",
  PENDING_APPROVAL: "warning",
};

const SEVERITY_TONE: Record<string, "critical" | "warning" | "info"> = {
  HIGH: "critical",
  MEDIUM: "warning",
  LOW: "info",
};

function formatArguments(args: unknown): string {
  if (typeof args !== "object" || args === null) return "";
  return Object.entries(args as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}

export default function Activity() {
  const { pendingActions, recentActions, insights } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  return (
    <s-page heading="Activity">
      <s-section heading="Needs your approval">
        {pendingActions.length === 0 ? (
          <s-text tone="neutral">Nothing waiting on you right now.</s-text>
        ) : (
          <s-stack direction="block" gap="base">
            {pendingActions.map((action) => (
              <s-box key={action.id} padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="small-300">
                  <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                    <s-text>{action.tool}</s-text>
                    {action.confidence !== null && (
                      <s-text tone="neutral">Confidence: {Math.round(action.confidence * 100)}%</s-text>
                    )}
                  </s-stack>
                  <s-text tone="neutral">{formatArguments(action.arguments)}</s-text>
                  {action.reasoning && <s-text tone="neutral">{action.reasoning}</s-text>}
                  <PendingActionControls actionId={action.id} onResolved={() => revalidator.revalidate()} />
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section heading="Recent actions">
        {recentActions.length === 0 ? (
          <s-text tone="neutral">No actions recorded yet.</s-text>
        ) : (
          <s-stack direction="block" gap="small-300">
            {recentActions.map((action) => (
              <s-box key={action.id} padding="small-300" borderWidth="base" borderRadius="base">
                <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                  <s-stack direction="block" gap="small-100">
                    <s-text>{action.tool}</s-text>
                    <s-text tone="neutral">{formatArguments(action.arguments)}</s-text>
                  </s-stack>
                  <s-stack direction="inline" gap="small-300" alignItems="center">
                    {action.outcome && (
                      <s-badge tone={action.outcome === "positive" ? "success" : action.outcome === "negative" ? "critical" : "neutral"}>
                        {action.outcome}
                      </s-badge>
                    )}
                    <s-badge tone={STATUS_TONE[action.status] ?? "neutral"}>{action.status}</s-badge>
                  </s-stack>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="Insights">
        {insights.length === 0 ? (
          <s-text tone="neutral">No insights yet — scan your store from the Home page.</s-text>
        ) : (
          <s-stack direction="block" gap="small-300">
            {insights.map((insight) => {
              const severity = (insight.metadata as { severity?: string } | null)?.severity ?? "LOW";
              return (
                <s-box key={insight.id} padding="small-300" borderWidth="base" borderRadius="base">
                  <s-stack direction="block" gap="small-100">
                    <s-badge tone={SEVERITY_TONE[severity] ?? "info"}>{severity}</s-badge>
                    <s-text>{insight.content}</s-text>
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
