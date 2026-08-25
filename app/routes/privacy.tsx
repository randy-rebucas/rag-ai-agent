import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [{ title: "Privacy Policy — RAG AI Agent" }];

const SECTION_STYLE = { marginBottom: "1.5rem" };

/**
 * Public, unauthenticated page — linked from the Shopify App Store listing
 * and from Settings. Must not require admin auth: reviewers and merchants
 * open it outside the embedded iframe.
 */
export default function Privacy() {
  return (
    <main style={{ maxWidth: "720px", margin: "0 auto", padding: "3rem 1.5rem", lineHeight: 1.6, fontFamily: "sans-serif" }}>
      <h1>Privacy Policy</h1>
      <p style={{ color: "#666" }}>Last updated: August 26, 2026</p>

      <section style={SECTION_STYLE}>
        <h2>What we collect</h2>
        <p>
          RAG AI Agent (&quot;the app&quot;) reads store data you authorize during installation — products,
          orders, customers, inventory, collections, and discounts — to answer your questions and
          power its store-analysis features. We also store conversation history, documents you
          upload to its knowledge base, and any actions the AI prepares or executes on your
          behalf.
        </p>
      </section>

      <section style={SECTION_STYLE}>
        <h2>How we use it</h2>
        <p>
          Store data and conversation content are used only to generate responses and
          recommendations inside the app, and are sent to the AI provider (Anthropic or OpenAI,
          per your configuration) solely to process your requests. We do not sell store or
          customer data, and we do not use it to train third-party models.
        </p>
      </section>

      <section style={SECTION_STYLE}>
        <h2>Data retention and deletion</h2>
        <p>
          Data is retained for as long as the app is installed. When a customer submits a data
          request or erasure request through Shopify, we process it via Shopify&apos;s mandatory
          compliance webhooks. When the app is uninstalled, associated data is permanently deleted
          from our systems within the window Shopify requires.
        </p>
      </section>

      <section style={SECTION_STYLE}>
        <h2>Third parties</h2>
        <p>
          Chat and analysis features call the AI provider you configure in Settings (Anthropic or
          OpenAI) using your own API key. Requests sent to that provider are subject to its own
          privacy policy and data-handling terms.
        </p>
      </section>

      <section style={SECTION_STYLE}>
        <h2>Contact</h2>
        <p>
          Questions about this policy or a data request can be sent to the app developer via the
          contact details on the Shopify App Store listing.
        </p>
      </section>
    </main>
  );
}
