import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

type ActionStatusResult = { action?: { id: string; status: string }; error?: string };

export function PendingActionControls({ actionId, onResolved }: { actionId: string; onResolved: () => void }) {
  const actionFetcher = useFetcher<ActionStatusResult>();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const isBusy = actionFetcher.state !== "idle";

  useEffect(() => {
    if (!actionFetcher.data) return;
    if (actionFetcher.data.error) {
      setStatusMessage(`Failed: ${actionFetcher.data.error}`);
      return;
    }
    const status = actionFetcher.data.action?.status;
    if (status === "REJECTED") {
      setStatusMessage("Action rejected.");
      onResolved();
    } else if (status === "APPROVED") {
      // Approve succeeded — immediately request execution, closing the
      // spec §21 loop (PREPARE -> APPROVAL -> EXECUTE) in one click.
      actionFetcher.submit(null, { method: "POST", action: `/api/ai/actions/${actionId}/execute` });
    } else if (status === "EXECUTED") {
      setStatusMessage("Action executed successfully.");
      onResolved();
    } else if (status === "FAILED") {
      setStatusMessage("Action approved but execution failed. See server logs.");
      onResolved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFetcher.data]);

  if (statusMessage) {
    return (
      <s-box padding="base" borderWidth="base" borderRadius="base">
        <s-text tone="neutral">{statusMessage}</s-text>
      </s-box>
    );
  }

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
      <s-stack direction="inline" gap="base" alignItems="center">
        <s-text>This action needs your approval before it runs.</s-text>
        <s-button
          onClick={() => actionFetcher.submit(null, { method: "POST", action: `/api/ai/actions/${actionId}/approve` })}
          {...(isBusy ? { loading: true } : {})}
        >
          Approve
        </s-button>
        <s-button
          variant="tertiary"
          onClick={() => actionFetcher.submit(null, { method: "POST", action: `/api/ai/actions/${actionId}/reject` })}
          {...(isBusy ? { loading: true } : {})}
        >
          Reject
        </s-button>
      </s-stack>
    </s-box>
  );
}
