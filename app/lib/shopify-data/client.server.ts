/* eslint-disable @typescript-eslint/no-explicit-any -- boundary layer mapping untyped Shopify GraphQL JSON */
// Thin helpers around the authenticated Shopify admin GraphQL client
// (from `authenticate.admin` / `unauthenticated.admin`). No new HTTP/auth
// library is introduced here — everything routes through the existing
// @shopify/shopify-app-react-router client.

export type AdminGraphqlClient = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

function isThrottled(status: number, json: any): boolean {
  if (status === 429) return true;
  const codes = json?.errors?.map((e: any) => e?.extensions?.code) ?? [];
  return codes.includes("THROTTLED");
}

/**
 * Retries with exponential backoff on rate limiting (HTTP 429 or GraphQL
 * THROTTLED cost errors) — spec §37/§41 call for handling Shopify API rate
 * limits explicitly. Every Shopify write/read tool routes through this
 * instead of calling admin.graphql directly.
 */
export async function graphqlJson(admin: AdminGraphqlClient, query: string, variables?: Record<string, unknown>) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await admin.graphql(query, variables ? { variables } : undefined);
    const json = await response.json();

    if (json.errors) {
      if (attempt < MAX_RETRIES && isThrottled(response.status, json)) {
        await new Promise((resolve) => setTimeout(resolve, BASE_BACKOFF_MS * 2 ** attempt));
        lastError = new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
        continue;
      }
      throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
    }

    return json.data;
  }

  throw lastError ?? new Error("Shopify GraphQL request failed after retries");
}

export async function runBulkQuery(
  admin: AdminGraphqlClient,
  bulkQuery: string,
): Promise<any[]> {
  const startData = await graphqlJson(
    admin,
    `#graphql
    mutation StartBulkOperation($query: String!) {
      bulkOperationRunQuery(query: $query) {
        bulkOperation { id status }
        userErrors { field message }
      }
    }`,
    { query: bulkQuery },
  );

  const userErrors = startData?.bulkOperationRunQuery?.userErrors;
  if (userErrors?.length) {
    throw new Error(`Bulk operation start failed: ${JSON.stringify(userErrors)}`);
  }

  const operationId = startData?.bulkOperationRunQuery?.bulkOperation?.id;
  if (!operationId) {
    throw new Error("Bulk operation did not start");
  }

  const url = await pollBulkOperation(admin);
  if (!url) return [];

  return downloadJsonl(url);
}

async function pollBulkOperation(
  admin: AdminGraphqlClient,
  { intervalMs = 2000, maxAttempts = 150 }: { intervalMs?: number; maxAttempts?: number } = {},
): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const data = await graphqlJson(
      admin,
      `#graphql
      query CurrentBulkOperation {
        currentBulkOperation {
          id
          status
          errorCode
          url
        }
      }`,
    );

    const op = data?.currentBulkOperation;
    if (!op) return null;

    if (op.status === "COMPLETED") return op.url ?? null;
    if (op.status === "FAILED" || op.status === "CANCELED") {
      throw new Error(`Bulk operation ${op.status}: ${op.errorCode ?? "unknown error"}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Bulk operation polling timed out");
}

async function downloadJsonl(url: string): Promise<any[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download bulk operation result: ${response.status}`);
  }
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}
