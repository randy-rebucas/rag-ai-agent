import { graphqlJson, type AdminGraphqlClient } from "../../shopify-data/client.server";

export type UpdateInventoryArgs = {
  inventoryItemId: string; // Shopify GID
  locationId: string; // Shopify GID
  quantity: number;
};

export function validateUpdateInventoryArgs(args: unknown): args is UpdateInventoryArgs {
  if (typeof args !== "object" || args === null) return false;
  const a = args as Record<string, unknown>;
  return (
    typeof a.inventoryItemId === "string" &&
    typeof a.locationId === "string" &&
    typeof a.quantity === "number" &&
    Number.isInteger(a.quantity) &&
    a.quantity >= 0
  );
}

export async function executeUpdateInventory(admin: AdminGraphqlClient, args: UpdateInventoryArgs) {
  const data = await graphqlJson(
    admin,
    `#graphql
    mutation AgentSetInventoryQuantity($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        inventoryAdjustmentGroup {
          createdAt
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      input: {
        name: "available",
        reason: "correction",
        ignoreCompareQuantity: true,
        quantities: [
          {
            inventoryItemId: args.inventoryItemId,
            locationId: args.locationId,
            quantity: args.quantity,
          },
        ],
      },
    },
  );

  const userErrors = data?.inventorySetQuantities?.userErrors;
  if (userErrors?.length) {
    throw new Error(`updateInventory failed: ${JSON.stringify(userErrors)}`);
  }

  return data.inventorySetQuantities.inventoryAdjustmentGroup;
}
