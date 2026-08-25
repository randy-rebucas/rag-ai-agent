import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate, MONTHLY_PLAN } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import { getShopAiSettings, saveShopAiSettings } from "../lib/ai/settings.server";

const isTestCharge = process.env.NODE_ENV !== "production";

const CHAT_MODEL_OPTIONS = [
  { value: "claude-sonnet-5", label: "Claude Sonnet 5 (recommended)" },
  { value: "claude-opus-5", label: "Claude Opus 5 (most capable, slower)" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fastest, cheapest)" },
];

const CLASSIFIER_MODEL_OPTIONS = [
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (recommended)" },
  { value: "claude-sonnet-5", label: "Claude Sonnet 5" },
];

const EMBEDDING_MODEL_OPTIONS = [
  { value: "text-embedding-3-small", label: "OpenAI text-embedding-3-small (recommended)" },
  { value: "text-embedding-3-large", label: "OpenAI text-embedding-3-large (higher quality, slower)" },
];

// Masked placeholder shown for a key that's already saved, so the merchant
// never sees their own secret rendered back to them.
const MASKED = "••••••••••••••••";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const settings = await getShopAiSettings(shop.id);
  const { appSubscriptions } = await billing.check({ plans: [MONTHLY_PLAN], isTest: isTestCharge });
  const subscription = appSubscriptions[0] ?? null;

  return {
    hasAnthropicKey: Boolean(settings.anthropicApiKey),
    hasOpenAiKey: Boolean(settings.openaiApiKey),
    chatModel: settings.chatModel ?? "",
    classifierModel: settings.classifierModel ?? "",
    embeddingModel: settings.embeddingModel ?? "",
    subscription: subscription
      ? {
          name: subscription.name,
          status: subscription.status,
          test: subscription.test,
          currentPeriodEnd: subscription.currentPeriodEnd,
        }
      : null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const formData = await request.formData();

  const readKey = (field: string) => {
    const value = formData.get(field);
    if (typeof value !== "string") return undefined;
    if (value === "") return undefined; // untouched — keep existing value
    if (value === "__CLEAR__") return null; // explicit clear
    return value;
  };

  await saveShopAiSettings(shop.id, {
    anthropicApiKey: readKey("anthropicApiKey"),
    openaiApiKey: readKey("openaiApiKey"),
    chatModel: (formData.get("chatModel") as string) || null,
    classifierModel: (formData.get("classifierModel") as string) || null,
    embeddingModel: (formData.get("embeddingModel") as string) || null,
  });

  return { ok: true };
};

type CancelResult = { ok?: boolean; error?: string };

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const cancelFetcher = useFetcher<CancelResult>();
  const shopify = useAppBridge();
  const isSaving = fetcher.state !== "idle";
  const isCancelling = cancelFetcher.state !== "idle";

  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [chatModel, setChatModel] = useState(data.chatModel);
  const [classifierModel, setClassifierModel] = useState(data.classifierModel);
  const [embeddingModel, setEmbeddingModel] = useState(data.embeddingModel);

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("AI settings saved");
      setAnthropicApiKey("");
      setOpenaiApiKey("");
    }
  }, [fetcher.data, shopify]);

  useEffect(() => {
    if (cancelFetcher.data?.ok) {
      shopify.toast.show("Subscription cancelled");
    } else if (cancelFetcher.data?.error) {
      shopify.toast.show(cancelFetcher.data.error, { isError: true });
    }
  }, [cancelFetcher.data, shopify]);

  const cancelSubscription = () => {
    cancelFetcher.submit(null, { method: "POST", action: "/api/billing/cancel" });
  };

  const save = () => {
    const formData = new FormData();
    formData.set("anthropicApiKey", anthropicApiKey);
    formData.set("openaiApiKey", openaiApiKey);
    formData.set("chatModel", chatModel);
    formData.set("classifierModel", classifierModel);
    formData.set("embeddingModel", embeddingModel);
    fetcher.submit(formData, { method: "POST" });
  };

  return (
    <s-page heading="AI settings">
      <s-section heading="Claude (chat &amp; reasoning)">
        <s-paragraph>
          Bring your own Anthropic API key to use your own billing and rate limits for chat
          responses and intent classification. Leave blank to use the app&apos;s default key. Get a
          key from the{" "}
          <s-link href="https://console.anthropic.com/settings/keys" target="_blank">
            Anthropic Console
          </s-link>
          .
        </s-paragraph>
        <s-stack direction="block" gap="base">
          <s-password-field
            label="Anthropic API key"
            placeholder={data.hasAnthropicKey ? MASKED : "sk-ant-..."}
            value={anthropicApiKey}
            onInput={(e) => setAnthropicApiKey(e.currentTarget.value ?? "")}
            details={data.hasAnthropicKey ? "A key is currently saved. Leave blank to keep it." : undefined}
          />
          {data.hasAnthropicKey && (
            <s-button variant="tertiary" onClick={() => setAnthropicApiKey("__CLEAR__")}>
              Remove saved key
            </s-button>
          )}
          <s-select
            label="Chat model"
            value={chatModel}
            placeholder="Use app default"
            onChange={(e) => setChatModel(e.currentTarget.value ?? "")}
          >
            <s-option value="">Use app default</s-option>
            {CHAT_MODEL_OPTIONS.map((opt) => (
              <s-option key={opt.value} value={opt.value}>
                {opt.label}
              </s-option>
            ))}
          </s-select>
          <s-select
            label="Classifier model"
            value={classifierModel}
            placeholder="Use app default"
            onChange={(e) => setClassifierModel(e.currentTarget.value ?? "")}
          >
            <s-option value="">Use app default</s-option>
            {CLASSIFIER_MODEL_OPTIONS.map((opt) => (
              <s-option key={opt.value} value={opt.value}>
                {opt.label}
              </s-option>
            ))}
          </s-select>
        </s-stack>
      </s-section>

      <s-section heading="OpenAI (embeddings)">
        <s-paragraph>
          Used only to generate embeddings for semantic memory search (Anthropic has no
          embeddings API). Leave blank to use the app&apos;s default key. Get a key from the{" "}
          <s-link href="https://platform.openai.com/api-keys" target="_blank">
            OpenAI API keys page
          </s-link>
          .
        </s-paragraph>
        <s-stack direction="block" gap="base">
          <s-password-field
            label="OpenAI API key"
            placeholder={data.hasOpenAiKey ? MASKED : "sk-..."}
            value={openaiApiKey}
            onInput={(e) => setOpenaiApiKey(e.currentTarget.value ?? "")}
            details={data.hasOpenAiKey ? "A key is currently saved. Leave blank to keep it." : undefined}
          />
          {data.hasOpenAiKey && (
            <s-button variant="tertiary" onClick={() => setOpenaiApiKey("__CLEAR__")}>
              Remove saved key
            </s-button>
          )}
          <s-select
            label="Embedding model"
            value={embeddingModel}
            placeholder="Use app default"
            onChange={(e) => setEmbeddingModel(e.currentTarget.value ?? "")}
          >
            <s-option value="">Use app default</s-option>
            {EMBEDDING_MODEL_OPTIONS.map((opt) => (
              <s-option key={opt.value} value={opt.value}>
                {opt.label}
              </s-option>
            ))}
          </s-select>
        </s-stack>
      </s-section>

      <s-button slot="primary-action" onClick={save} {...(isSaving ? { loading: true } : {})}>
        Save
      </s-button>

      <s-section heading="Plan">
        {data.subscription ? (
          <s-stack direction="block" gap="small-300">
            <s-paragraph>
              {data.subscription.name} — {data.subscription.status}
              {data.subscription.test ? " (test charge)" : ""}. Renews{" "}
              {new Date(data.subscription.currentPeriodEnd).toLocaleDateString()}.
            </s-paragraph>
            <s-button
              variant="tertiary"
              tone="critical"
              onClick={cancelSubscription}
              {...(isCancelling ? { loading: true } : {})}
            >
              Cancel subscription
            </s-button>
          </s-stack>
        ) : (
          <s-text tone="neutral">No active subscription.</s-text>
        )}
      </s-section>

      <s-section slot="aside" heading="About">
        <s-paragraph>
          These settings are stored per store and apply only to your account. API keys are
          never shown back to you once saved.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Legal">
        <s-stack direction="block" gap="small-100">
          <s-link href="/privacy" target="_blank">
            Privacy Policy
          </s-link>
          <s-link href="/terms" target="_blank">
            Terms of Service
          </s-link>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Support">
        <s-paragraph>
          This app is built and supported by{" "}
          <s-text tone="neutral">Devcom Digital Marketing Services</s-text>.
          Questions or feedback? Reach us on{" "}
          <s-link href="https://www.facebook.com/DevComDMS/" target="_blank">
            Facebook
          </s-link>
          .
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
