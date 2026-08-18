import { graphqlJson, type AdminGraphqlClient } from "../../shopify-data/client.server";

export type UpdateDiscountStatusArgs = {
  discountId: string; // Shopify GID (DiscountCodeNode)
  active: boolean;
};

export function validateUpdateDiscountStatusArgs(args: unknown): args is UpdateDiscountStatusArgs {
  if (typeof args !== "object" || args === null) return false;
  const a = args as Record<string, unknown>;
  return typeof a.discountId === "string" && typeof a.active === "boolean";
}

/** discountCodeActivate/discountCodeDeactivate are generic across all discount code types (basic, BXGY, free shipping). */
export async function executeUpdateDiscountStatus(admin: AdminGraphqlClient, args: UpdateDiscountStatusArgs) {
  const data = await graphqlJson(
    admin,
    `#graphql
    mutation AgentSetDiscountStatus($id: ID!) {
      ${args.active ? "discountCodeActivate" : "discountCodeDeactivate"}(id: $id) {
        codeDiscountNode {
          id
        }
        userErrors {
          field
          message
        }
      }
    }`,
    { id: args.discountId },
  );

  const result = args.active ? data?.discountCodeActivate : data?.discountCodeDeactivate;
  const userErrors = result?.userErrors;
  if (userErrors?.length) {
    throw new Error(`updateDiscountStatus failed: ${JSON.stringify(userErrors)}`);
  }

  return result.codeDiscountNode;
}
