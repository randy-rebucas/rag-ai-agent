import { graphqlJson, type AdminGraphqlClient } from "../../shopify-data/client.server";

export type AddOrderTagsArgs = {
  orderId: string; // Shopify GID
  tags: string[];
};

export function validateAddOrderTagsArgs(args: unknown): args is AddOrderTagsArgs {
  if (typeof args !== "object" || args === null) return false;
  const a = args as Record<string, unknown>;
  return (
    typeof a.orderId === "string" &&
    Array.isArray(a.tags) &&
    a.tags.length > 0 &&
    a.tags.every((t) => typeof t === "string" && t.trim().length > 0)
  );
}

export async function executeAddOrderTags(admin: AdminGraphqlClient, args: AddOrderTagsArgs) {
  const data = await graphqlJson(
    admin,
    `#graphql
    mutation AgentAddOrderTags($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        node {
          id
        }
        userErrors {
          field
          message
        }
      }
    }`,
    { id: args.orderId, tags: args.tags },
  );

  const userErrors = data?.tagsAdd?.userErrors;
  if (userErrors?.length) {
    throw new Error(`addOrderTags failed: ${JSON.stringify(userErrors)}`);
  }

  return data.tagsAdd.node;
}
