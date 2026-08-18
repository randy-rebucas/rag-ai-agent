import { graphqlJson, type AdminGraphqlClient } from "../../shopify-data/client.server";

export type UpdatePriceArgs = {
  productId: string; // Shopify GID
  variantId: string; // Shopify GID
  newPrice: string; // decimal string, e.g. "149.00"
};

export function validateUpdatePriceArgs(args: unknown): args is UpdatePriceArgs {
  if (typeof args !== "object" || args === null) return false;
  const a = args as Record<string, unknown>;
  return (
    typeof a.productId === "string" &&
    typeof a.variantId === "string" &&
    typeof a.newPrice === "string" &&
    Number.isFinite(Number(a.newPrice)) &&
    Number(a.newPrice) > 0
  );
}

/** Reuses the same productVariantsBulkUpdate mutation already demonstrated in app._index.tsx's template code. */
export async function executeUpdatePrice(admin: AdminGraphqlClient, args: UpdatePriceArgs) {
  const data = await graphqlJson(
    admin,
    `#graphql
    mutation AgentUpdateVariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      productId: args.productId,
      variants: [{ id: args.variantId, price: args.newPrice }],
    },
  );

  const userErrors = data?.productVariantsBulkUpdate?.userErrors;
  if (userErrors?.length) {
    throw new Error(`updatePrice failed: ${JSON.stringify(userErrors)}`);
  }

  return data.productVariantsBulkUpdate.productVariants;
}
