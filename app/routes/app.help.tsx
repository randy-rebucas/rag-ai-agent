export default function HelpPage() {
  return (
    <s-page heading="Help">
      <s-section heading="Getting started">
        <s-paragraph>
          The <s-text type="strong">Home</s-text> page walks you through four steps: syncing your
          store data, scanning for insights, asking your first question, and (optionally)
          uploading a document. You can revisit "Sync store" or "Scan store" any time — neither
          is a one-time setup step.
        </s-paragraph>
      </s-section>

      <s-section heading="Sync store vs. Scan store">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text type="strong">Sync store</s-text> pulls your products, orders, customers,
            collections, and discounts from Shopify into the app. Run it again any time your
            catalog or order history has changed significantly.
          </s-paragraph>
          <s-paragraph>
            <s-text type="strong">Scan store</s-text> rebuilds the AI's semantic memory from
            that synced data and re-runs its insight checks (inventory risk, pricing issues,
            etc.). Run it after a sync, or whenever the Knowledge level card feels out of date.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Chatting with your AI store analyst">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Ask questions in plain language — sales trends, inventory risk, customer history,
            pricing, marketing ideas. Each reply shows a confidence score and how many store
            sources it drew on, so you can judge how much to trust it.
          </s-paragraph>
          <s-paragraph>
            Ask it to <s-text type="strong">"export"</s-text> or <s-text type="strong">"download"</s-text> data
            (e.g. "export my best sellers as csv") and it'll attach a CSV you can download or,
            once Google Drive is connected, save directly to your Drive.
          </s-paragraph>
          <s-paragraph>
            Use <s-text type="strong">New chat</s-text> to start a fresh conversation — your
            previous conversations stay available under Conversation history.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Approving AI actions">
        <s-paragraph>
          When you ask the assistant to change something in your store (e.g. update a price or
          tag orders), it never applies the change itself. It prepares the action and asks for
          your approval right in the chat, or later from the <s-link href="/app/activity">Activity</s-link> page
          under "Needs your approval." Approve to run it immediately, or reject to discard it.
        </s-paragraph>
      </s-section>

      <s-section heading="Documents">
        <s-paragraph>
          Upload reference material (.txt, .md, .csv, .pdf, .docx) on the{" "}
          <s-link href="/app/documents">Documents</s-link> page. Uploaded files are chunked and
          embedded the same way store data is, so the assistant can draw on them when answering
          questions.
        </s-paragraph>
      </s-section>

      <s-section heading="Google Drive exports">
        <s-paragraph>
          Connect Google Drive from <s-link href="/app/settings">Settings</s-link> to save chat
          CSV exports straight to your Drive instead of only downloading them. You can disconnect
          at any time.
        </s-paragraph>
      </s-section>

      <s-section heading="Activity and usage">
        <s-paragraph>
          The <s-link href="/app/activity">Activity</s-link> page tracks the AI's real impact
          (actions executed, insights generated, estimated time saved) alongside app usage
          (total sessions, total messages, and how many staff members have used it) and a full
          event log.
        </s-paragraph>
      </s-section>

      <s-section heading="Bringing your own AI keys">
        <s-paragraph>
          By default the app uses its own Anthropic and OpenAI keys. In{" "}
          <s-link href="/app/settings">Settings</s-link> you can supply your own keys to use your
          own billing/rate limits, and choose which chat, classifier, and embedding models to
          use.
        </s-paragraph>
      </s-section>

      <s-section heading="Frequently asked questions">
        <s-stack direction="block" gap="base">
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">Is my store data shared with anyone?</s-text>
            <s-text tone="neutral">
              No — data is scoped to your store and only used to answer your questions and power
              the features in this app. See the{" "}
              <s-link href="/privacy" target="_blank">
                Privacy Policy
              </s-link>{" "}
              for details.
            </s-text>
          </s-stack>
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">Why is my Knowledge level low?</s-text>
            <s-text tone="neutral">
              Run "Sync store" followed by "Scan store" from the Home page. The score reflects
              how much of your catalog has been embedded into semantic memory.
            </s-text>
          </s-stack>
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">Can the AI act on my store without me approving it?</s-text>
            <s-text tone="neutral">
              No — every store-changing action requires your explicit approval first.
            </s-text>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Still stuck?">
        <s-paragraph>
          Reach us on{" "}
          <s-link href="https://www.facebook.com/DevComDMS/" target="_blank">
            Facebook
          </s-link>
          .
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
