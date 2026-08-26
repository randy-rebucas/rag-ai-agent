import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRevalidator, useSearchParams, useRouteError, Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import { getActivityHistory, getImpactSummary, getUsageSummary } from "../lib/shopify-data/activity.server";
import { PendingActionControls } from "../components/PendingActionControls";
import db from "../db.server";

const PAGE_SIZE = 20;
const PENDING_ACTIONS_LIMIT = 100;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);

  const url = new URL(request.url);
  const actionsPage = Math.max(1, Number(url.searchParams.get("actionsPage") ?? "1") || 1);
  const eventsPage = Math.max(1, Number(url.searchParams.get("eventsPage") ?? "1") || 1);

  const [pendingActions, recentActions, recentActionsTotal, insights, events, eventsTotal, impact, usage] =
    await Promise.all([
      db.action.findMany({
        where: { shopId: shop.id, status: "PENDING_APPROVAL" },
        orderBy: { createdAt: "desc" },
        take: PENDING_ACTIONS_LIMIT,
      }),
      db.action.findMany({
        where: { shopId: shop.id, status: { not: "PENDING_APPROVAL" } },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        skip: (actionsPage - 1) * PAGE_SIZE,
      }),
      db.action.count({
        where: { shopId: shop.id, status: { not: "PENDING_APPROVAL" } },
      }),
      db.memory.findMany({
        where: { shopId: shop.id, memoryType: "INSIGHT" },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      getActivityHistory(shop.id, { limit: PAGE_SIZE, skip: (eventsPage - 1) * PAGE_SIZE }),
      db.event.count({ where: { shopId: shop.id } }),
      getImpactSummary(shop.id),
      getUsageSummary(shop.id),
    ]);

  return {
    pendingActions,
    recentActions,
    recentActionsTotal,
    actionsPage,
    insights,
    events,
    eventsTotal,
    eventsPage,
    impact,
    usage,
  };
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

const EVENT_LABELS: Record<string, string> = {
  AI_ACTION_PREPARED: "AI action prepared",
  AI_ACTION_APPROVED: "AI action approved",
  AI_ACTION_EXECUTED: "AI action executed",
  AI_OUTCOME_MEASURED: "AI outcome measured",
};

function formatEventType(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType.replaceAll("_", " ").toLowerCase();
}

export default function Activity() {
  const {
    pendingActions,
    recentActions,
    recentActionsTotal,
    actionsPage,
    insights,
    events,
    eventsTotal,
    eventsPage,
    impact,
    usage,
  } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [searchParams] = useSearchParams();

  const actionsHasNext = actionsPage * PAGE_SIZE < recentActionsTotal;
  const actionsHasPrev = actionsPage > 1;
  const eventsHasNext = eventsPage * PAGE_SIZE < eventsTotal;
  const eventsHasPrev = eventsPage > 1;

  function pageHref(param: string, page: number) {
    const next = new URLSearchParams(searchParams);
    next.set(param, String(page));
    return `?${next.toString()}`;
  }

  const statTiles: { label: string; value: string }[] = [
    { label: "Actions executed", value: String(impact.actionsExecuted) },
    {
      label: "Success rate",
      value: impact.successRate === null ? "—" : `${Math.round(impact.successRate * 100)}%`,
    },
    { label: "Insights generated", value: String(impact.insightsGenerated) },
    { label: "Conversations handled", value: String(impact.conversationsHandled) },
    { label: "Est. time saved", value: `${impact.estimatedMinutesSaved} min` },
  ];

  const usageTiles: { label: string; value: string }[] = [
    { label: "Total sessions", value: String(usage.totalSessions) },
    { label: "Total messages", value: String(usage.totalMessages) },
    { label: "Users interacted", value: String(usage.usersInteracted) },
  ];

  return (
    <s-page heading="Activity">
      <s-section heading="Impact">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
          {statTiles.map((tile) => (
            <s-box key={tile.label} padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="small-100">
                <s-text tone="neutral">{tile.label}</s-text>
                <s-heading>{tile.value}</s-heading>
              </s-stack>
            </s-box>
          ))}
        </div>
        {impact.actionsExecuted > 0 && (
          <s-text tone="neutral">
            Estimate based on {impact.actionsExecuted} executed action{impact.actionsExecuted === 1 ? "" : "s"} —
            not a measured figure.
          </s-text>
        )}
      </s-section>

      <s-section heading="App usage">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
          {usageTiles.map((tile) => (
            <s-box key={tile.label} padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="small-100">
                <s-text tone="neutral">{tile.label}</s-text>
                <s-heading>{tile.value}</s-heading>
              </s-stack>
            </s-box>
          ))}
        </div>
      </s-section>

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
        {(actionsHasPrev || actionsHasNext) && (
          <s-stack direction="inline" gap="base" justifyContent="end">
            {actionsHasPrev && <Link to={pageHref("actionsPage", actionsPage - 1)}>Newer</Link>}
            {actionsHasNext && <Link to={pageHref("actionsPage", actionsPage + 1)}>Older</Link>}
          </s-stack>
        )}
      </s-section>

      <s-section heading="Event log">
        {events.length === 0 ? (
          <s-text tone="neutral">No events recorded yet.</s-text>
        ) : (
          <s-stack direction="block" gap="small-300">
            {events.map((event) => (
              <s-box key={event.id} padding="small-300" borderWidth="base" borderRadius="base">
                <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                  <s-stack direction="block" gap="small-100">
                    <s-text>{formatEventType(event.eventType)}</s-text>
                    <s-text tone="neutral">
                      {event.entityType}
                      {event.entityId ? ` #${event.entityId}` : ""}
                    </s-text>
                  </s-stack>
                  <s-text tone="neutral">{new Date(event.occurredAt).toLocaleString()}</s-text>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
        {(eventsHasPrev || eventsHasNext) && (
          <s-stack direction="inline" gap="base" justifyContent="end">
            {eventsHasPrev && <Link to={pageHref("eventsPage", eventsPage - 1)}>Newer</Link>}
            {eventsHasNext && <Link to={pageHref("eventsPage", eventsPage + 1)}>Older</Link>}
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

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
