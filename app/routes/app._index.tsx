import { useEffect, useRef, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { HandleChatMessageResult } from "../lib/agent/chat.server";
import { ensureShop, computeFreshness } from "../lib/shopify-data/shop.server";
import { computeKnowledgeLevel, type KnowledgeLevel } from "../lib/intelligence/knowledge-level.server";
import { listDocuments } from "../lib/memory/document-memory.server";
import { PendingActionControls } from "../components/PendingActionControls";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const [level, documents, conversationCount, settings] = await Promise.all([
    computeKnowledgeLevel(shop.id),
    listDocuments(shop.id),
    db.conversationSession.count({ where: { shopId: shop.id } }),
    db.shopSettings.findUnique({ where: { shopId: shop.id } }),
  ]);

  return {
    level,
    hasDocuments: documents.length > 0,
    dataFreshness: computeFreshness(shop.lastSyncedAt),
    lastSyncedAt: shop.lastSyncedAt ? shop.lastSyncedAt.toISOString() : null,
    initialSyncDone: shop.initialSyncDone,
    hasConversations: conversationCount > 0,
    googleConnected: Boolean(settings?.googleRefreshToken),
  };
};

type ChatReport = { id: string; filename: string; rowCount: number };
type ChatTurn = { role: "user" | "assistant"; content: string; agent?: string; report?: ChatReport | null };
type ScanResult = { level: KnowledgeLevel };

type SessionSummary = {
  id: string;
  summary: string | null;
  preview: string;
  messageCount: number;
  updatedAt: string;
};
type SessionsResult = { sessions: SessionSummary[] };
type SessionMessagesResult = {
  sessionId: string;
  messages: { role: "user" | "assistant"; content: string }[];
  error?: string;
};

const CHAT_SESSION_STORAGE_KEY = "rag-ai-agent:chatSessionId";

const PROMPT_CARDS = [
  {
    icon: "chart-line",
    tone: "info",
    background: "var(--p-color-bg-fill-info-secondary, #EAF2FF)",
    title: "Analyze recent sales",
    description: "Trends, revenue changes, and AOV",
    prompt: "Why are my sales down this week?",
  },
  {
    icon: "inventory",
    tone: "success",
    background: "var(--p-color-bg-fill-success-secondary, #E6F7ED)",
    title: "Check inventory risk",
    description: "Products at risk of stocking out",
    prompt: "Which products are at risk of stocking out?",
  },
  {
    icon: "chart-donut",
    tone: "warning",
    background: "var(--p-color-bg-fill-warning-secondary, #FFF4E5)",
    title: "Store performance overview",
    description: "A snapshot of how the store is doing",
    prompt: "How is my store performing overall?",
  },
  {
    icon: "person",
    tone: "caution",
    background: "var(--p-color-bg-fill-magic-secondary, #F1EAFB)",
    title: "Look up a customer",
    description: "Order history and spend",
    prompt: "Tell me about my top customer this month",
  },
  {
    icon: "product",
    tone: "critical",
    background: "var(--p-color-bg-fill-critical-secondary, #FDEAF3)",
    title: "Product performance",
    description: "Best and worst sellers",
    prompt: "Which products are my best sellers this month?",
  },
  {
    icon: "megaphone",
    tone: "neutral",
    background: "var(--p-color-bg-fill-secondary, #F1F2F3)",
    title: "Marketing ideas",
    description: "Suggestions to boost sales",
    prompt: "Suggest a marketing idea to boost sales this week",
  },
] as const;

const MIN_ROWS = 1;
const MAX_ROWS = 6;
const CHARS_PER_ROW = 60;

function computeRows(text: string): number {
  const lineBreaks = text.split("\n").length;
  const wrapped = Math.ceil(text.length / CHARS_PER_ROW);
  return Math.min(Math.max(lineBreaks, wrapped, MIN_ROWS), MAX_ROWS);
}

const FRESHNESS_TONE = {
  REALTIME: "success",
  RECENT: "info",
  STALE: "warning",
  UNKNOWN: "neutral",
} as const;

function DataFreshnessBadge({ freshness, lastSyncedAt }: { freshness: string; lastSyncedAt: string | null }) {
  return (
    <s-stack direction="block" gap="small-100">
      <s-badge tone={FRESHNESS_TONE[freshness as keyof typeof FRESHNESS_TONE] ?? "neutral"}>{freshness}</s-badge>
      <s-text tone="neutral">
        {lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}` : "Never synced"}
      </s-text>
    </s-stack>
  );
}

function BrainLevel({ level }: { level: KnowledgeLevel }) {
  const scanFetcher = useFetcher<ScanResult>();
  const shopify = useAppBridge();
  const revalidator = useRevalidator();
  const isScanning = scanFetcher.state !== "idle";

  useEffect(() => {
    if (scanFetcher.data) {
      shopify.toast.show(`Knowledge updated — now "${scanFetcher.data.level.label}" (${scanFetcher.data.level.score}/100)`);
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanFetcher.data]);

  return (
    <s-stack direction="block" gap="small-300">
      <s-badge icon="gauge" tone={level.tone} size="large">
        {level.label} · {level.score}/100
      </s-badge>
      <s-text tone="neutral">
        {level.memoryCount} memories from {level.productCount} products
      </s-text>
      <s-button
        variant="primary"
        size="large"
        inlineSize="fill"
        icon="refresh"
        onClick={() => scanFetcher.submit(null, { method: "POST", action: "/api/ai/scan" })}
        {...(isScanning ? { loading: true } : {})}
      >
        Scan store
      </s-button>
    </s-stack>
  );
}

type OnboardingStep = { label: string; done: boolean; action?: { label: string; onClick: () => void; loading: boolean } };

function OnboardingChecklist({
  initialSyncDone,
  hasKnowledge,
  hasDocuments,
  hasConversations,
}: {
  initialSyncDone: boolean;
  hasKnowledge: boolean;
  hasDocuments: boolean;
  hasConversations: boolean;
}) {
  const scanFetcher = useFetcher<ScanResult>();
  const syncFetcher = useFetcher();
  const revalidator = useRevalidator();
  const isScanning = scanFetcher.state !== "idle";
  const isSyncing = syncFetcher.state !== "idle";

  useEffect(() => {
    if (scanFetcher.data) revalidator.revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanFetcher.data]);

  useEffect(() => {
    if (syncFetcher.data) revalidator.revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncFetcher.data]);

  const steps: OnboardingStep[] = [
    {
      label: "Sync your store data",
      done: initialSyncDone,
      action: initialSyncDone
        ? undefined
        : {
            label: "Sync store",
            loading: isSyncing,
            onClick: () => syncFetcher.submit(null, { method: "POST", action: "/api/store/sync" }),
          },
    },
    {
      label: "Scan your store for insights",
      done: hasKnowledge,
      action: hasKnowledge
        ? undefined
        : {
            label: "Scan store",
            loading: isScanning,
            onClick: () => scanFetcher.submit(null, { method: "POST", action: "/api/ai/scan" }),
          },
    },
    { label: "Ask your first question", done: hasConversations },
    { label: "Upload a document (optional)", done: hasDocuments },
  ];

  if (steps.every((step) => step.done)) return null;

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="block" gap="small-300">
        <s-text>Getting started</s-text>
        {steps.map((step) => (
          <s-stack key={step.label} direction="inline" justifyContent="space-between" alignItems="center">
            <s-stack direction="inline" gap="small-300" alignItems="center">
              <s-icon type={step.done ? "check-circle" : "circle"} tone={step.done ? "success" : "neutral"} size="small" />
              <s-text tone={step.done ? "neutral" : undefined}>{step.label}</s-text>
            </s-stack>
            {step.action && (
              <s-button
                variant="primary"
                size="large"
                onClick={step.action.onClick}
                {...(step.action.loading ? { loading: true } : {})}
              >
                {step.action.label}
              </s-button>
            )}
          </s-stack>
        ))}
      </s-stack>
    </s-box>
  );
}

function SessionHistory({
  activeSessionId,
  onResume,
}: {
  activeSessionId: string | undefined;
  onResume: (sessionId: string) => void;
}) {
  const sessionsFetcher = useFetcher<SessionsResult>();
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      sessionsFetcher.load("/api/ai/sessions");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sessions = sessionsFetcher.data?.sessions ?? [];

  if (sessionsFetcher.state === "loading" && sessions.length === 0) {
    return <s-text tone="neutral">Loading…</s-text>;
  }

  if (sessions.length === 0) {
    return <s-text tone="neutral">No saved conversations yet.</s-text>;
  }

  return (
    <s-stack direction="block" gap="small-300">
      {sessions.map((s) => (
        <s-box
          key={s.id}
          padding="small-300"
          borderWidth="base"
          borderRadius="base"
          background={s.id === activeSessionId ? "strong" : undefined}
        >
          <s-stack direction="block" gap="small-100">
            <s-text>{s.preview}</s-text>
            <s-stack direction="inline" justifyContent="space-between" alignItems="center">
              <s-text tone="neutral">{new Date(s.updatedAt).toLocaleString()}</s-text>
              {s.id !== activeSessionId && (
                <s-button variant="tertiary" onClick={() => onResume(s.id)}>
                  Resume
                </s-button>
              )}
            </s-stack>
          </s-stack>
        </s-box>
      ))}
    </s-stack>
  );
}

type DriveSaveResult = { ok?: boolean; webViewLink?: string | null; error?: string };

function ReportActions({ report, googleConnected }: { report: ChatReport; googleConnected: boolean }) {
  const saveFetcher = useFetcher<DriveSaveResult>();
  const shopify = useAppBridge();
  const isSaving = saveFetcher.state !== "idle";

  useEffect(() => {
    if (!saveFetcher.data) return;
    if (saveFetcher.data.error) {
      shopify.toast.show(saveFetcher.data.error, { isError: true });
    } else if (saveFetcher.data.ok) {
      shopify.toast.show("Saved to Google Drive");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveFetcher.data]);

  return (
    <s-stack direction="inline" gap="small-300">
      <s-button
        variant="tertiary"
        icon="download"
        href={`/api/ai/reports/${encodeURIComponent(report.id)}/download`}
        target="_blank"
      >
        Download CSV
      </s-button>
      {googleConnected ? (
        <s-button
          variant="tertiary"
          onClick={() =>
            saveFetcher.submit(null, { method: "POST", action: `/api/google/reports/${report.id}/save` })
          }
          {...(isSaving ? { loading: true } : {})}
        >
          Save to Drive
        </s-button>
      ) : (
        <s-text tone="neutral">
          <s-link href="/app/settings">Connect Google Drive</s-link> to save reports there.
        </s-text>
      )}
    </s-stack>
  );
}

export default function Index() {
  const { level, hasDocuments, dataFreshness, lastSyncedAt, initialSyncDone, hasConversations, googleConnected } =
    useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const chatFetcher = useFetcher<HandleChatMessageResult>();
  const resumeFetcher = useFetcher<SessionMessagesResult>();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const isSending = chatFetcher.state !== "idle";
  const bottomRef = useRef<HTMLDivElement>(null);
  const didRestoreRef = useRef(false);

  // Resume the last active session on load so a page refresh doesn't silently
  // drop the merchant into a brand-new conversation.
  useEffect(() => {
    if (didRestoreRef.current) return;
    didRestoreRef.current = true;
    const storedSessionId = window.localStorage.getItem(CHAT_SESSION_STORAGE_KEY);
    if (storedSessionId) {
      resumeFetcher.load(`/api/ai/sessions/${storedSessionId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (chatFetcher.data) {
      setSessionId(chatFetcher.data.sessionId);
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: chatFetcher.data!.reply,
          agent: chatFetcher.data!.agent,
          report: chatFetcher.data!.report,
        },
      ]);
      if (chatFetcher.data.preparedActionId) {
        setPendingActionId(chatFetcher.data.preparedActionId);
      }
      setHistoryKey((k) => k + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatFetcher.data]);

  useEffect(() => {
    if (!resumeFetcher.data) return;
    if (resumeFetcher.data.error) {
      // Stale/deleted session — drop it so we don't keep retrying on every load.
      window.localStorage.removeItem(CHAT_SESSION_STORAGE_KEY);
      shopify.toast.show("Couldn't restore your last conversation — starting a new one.", { isError: true });
      return;
    }
    setSessionId(resumeFetcher.data.sessionId);
    setTurns(resumeFetcher.data.messages.map((m) => ({ role: m.role, content: m.content })));
    setPendingActionId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeFetcher.data]);

  useEffect(() => {
    if (sessionId) {
      window.localStorage.setItem(CHAT_SESSION_STORAGE_KEY, sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, isSending]);

  const send = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || isSending) return;
    setTurns((prev) => [...prev, { role: "user", content: trimmed }]);
    setDraft("");
    const formData = new FormData();
    formData.set("message", trimmed);
    if (sessionId) formData.set("sessionId", sessionId);
    chatFetcher.submit(formData, { method: "POST", action: "/api/ai/chat" });
  };

  const resumeSession = (id: string) => {
    if (isSending) return;
    resumeFetcher.load(`/api/ai/sessions/${id}`);
  };

  return (
    <s-page heading="AI store analyst">
      {turns.length === 0 && (
        <s-section>
          <OnboardingChecklist
            initialSyncDone={initialSyncDone}
            hasKnowledge={level.score > 0}
            hasDocuments={hasDocuments}
            hasConversations={hasConversations}
          />
        </s-section>
      )}

      <s-section>
        <s-stack direction="block" gap="base">
          {turns.length === 0 ? (
            <s-stack direction="block" gap="small-300" alignItems="center">
              <s-heading>Welcome, how can I help?</s-heading>
              <s-text tone="neutral">I&apos;m your AI store analyst</s-text>
            </s-stack>
          ) : (
            turns.map((turn, i) => {
              const isMerchant = turn.role === "user";
              const bubble = (
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background={isMerchant ? "strong" : undefined}
                  maxInlineSize="80%"
                >
                  <s-stack direction="block" gap="small-300">
                    <s-text tone="neutral">
                      {isMerchant ? "You" : turn.agent ?? "AI"}
                    </s-text>
                    <s-text>{turn.content}</s-text>
                    {turn.report && <ReportActions report={turn.report} googleConnected={googleConnected} />}
                  </s-stack>
                </s-box>
              );
              const avatar = (
                <s-avatar size="small" initials={isMerchant ? "Y" : "AI"} alt={isMerchant ? "You" : "AI"} />
              );
              return (
                <s-stack key={i} direction="inline" gap="small-300" justifyContent={isMerchant ? "end" : "start"} alignItems="end">
                  {isMerchant ? (
                    <>
                      {bubble}
                      {avatar}
                    </>
                  ) : (
                    <>
                      {avatar}
                      {bubble}
                    </>
                  )}
                </s-stack>
              );
            })
          )}

          {isSending && (
            <s-stack direction="inline" gap="small-300" justifyContent="start" alignItems="end">
              <s-avatar size="small" initials="AI" alt="AI" />
              <s-box padding="base" borderWidth="base" borderRadius="base" maxInlineSize="80%">
                <s-text tone="neutral">Thinking…</s-text>
              </s-box>
            </s-stack>
          )}

          {chatFetcher.data && !isSending && (
            <s-stack direction="inline" gap="small-300" justifyContent="start">
              <s-box minInlineSize="28px" />
              <s-text tone="neutral">
                Confidence: {Math.round(chatFetcher.data.confidence * 100)}% — based on{" "}
                {chatFetcher.data.sources.length} store source
                {chatFetcher.data.sources.length === 1 ? "" : "s"}
              </s-text>
            </s-stack>
          )}

          {pendingActionId && (
            <PendingActionControls actionId={pendingActionId} onResolved={() => setPendingActionId(null)} />
          )}

          <div ref={bottomRef} />

          <s-box padding="small-300" borderWidth="base" borderRadius="large-200">
            <s-stack direction="inline" gap="small-300" alignItems="center">
              <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                <s-text-area
                  label="Message"
                  labelAccessibilityVisibility="exclusive"
                  placeholder="Message your AI store analyst…"
                  value={draft}
                  rows={computeRows(draft)}
                  onInput={(e) => setDraft(e.currentTarget.value ?? "")}
                />
              </div>
              <s-button
                icon="arrow-up"
                variant="tertiary"
                accessibilityLabel="Send message"
                onClick={() => send(draft)}
                disabled={!draft.trim()}
                {...(isSending ? { loading: true } : {})}
              />
            </s-stack>
          </s-box>

          {turns.length === 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "0.75rem",
                alignItems: "stretch",
              }}
            >
              {PROMPT_CARDS.map((card) => (
                <s-box key={card.title} borderWidth="base" borderRadius="base" overflow="hidden">
                  <button
                    type="button"
                    onClick={() => setDraft(card.prompt)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "0.75rem",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      font: "inherit",
                      color: "inherit",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: "28px",
                        height: "28px",
                        minWidth: "28px",
                        maxHeight: "28px",
                        flexShrink: 0,
                        borderRadius: "8px",
                        background: card.background,
                        lineHeight: 0,
                      }}
                    >
                      <s-icon type={card.icon} tone={card.tone} size="small" />
                    </div>
                    <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                      <s-stack direction="block" gap="small-100" alignItems="start">
                        <s-text type="strong">{card.title}</s-text>
                        <s-text tone="neutral">{card.description}</s-text>
                      </s-stack>
                    </div>
                  </button>
                </s-box>
              ))}
            </div>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Conversation history">
        <SessionHistory key={historyKey} activeSessionId={sessionId} onResume={resumeSession} />
      </s-section>

      <s-section slot="aside" heading="About">
        <s-paragraph>
          This assistant reads live data from your store — orders, products, inventory, and
          customers — to answer questions and, when you approve, take actions on your behalf.
          &quot;Scan store&quot; rebuilds its semantic memory of your products and re-runs its insight
          checks, and uploaded documents are chunked and embedded the same way, so the more you
          scan and upload, the more it understands.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Data freshness">
        <DataFreshnessBadge freshness={dataFreshness} lastSyncedAt={lastSyncedAt} />
      </s-section>

      <s-section slot="aside" heading="Knowledge level">
        <BrainLevel level={level} />
      </s-section>

      <s-section slot="aside" heading="Documents">
        <s-stack direction="block" gap="small-300">
          <s-text tone="neutral">
            {hasDocuments ? "Manage your uploaded documents." : "No documents uploaded yet."}
          </s-text>
          <s-link href="/app/documents">Go to Documents</s-link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
