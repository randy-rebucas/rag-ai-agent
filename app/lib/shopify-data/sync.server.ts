/* eslint-disable @typescript-eslint/no-explicit-any -- boundary layer mapping untyped Shopify GraphQL JSON */
import type { AdminGraphqlClient } from "./client.server";
import { runBulkQuery } from "./client.server";
import { markSyncCompleted } from "./shop.server";
import {
  upsertProductFromGraphQLNode,
  upsertVariantFromGraphQLNode,
  upsertOrderFromGraphQLNode,
  upsertLineItemFromGraphQLNode,
  upsertCustomerFromGraphQLNode,
  upsertCollectionFromGraphQLNode,
  upsertDiscountFromGraphQLNode,
} from "./normalize.server";

/** Splits a bulk-operation JSONL result into top-level nodes and children keyed by __parentId. */
function partitionByParent(nodes: any[]) {
  const roots: any[] = [];
  const childrenByParent = new Map<string, any[]>();

  for (const node of nodes) {
    const parentId = node.__parentId;
    if (!parentId) {
      roots.push(node);
      continue;
    }
    const list = childrenByParent.get(parentId) ?? [];
    list.push(node);
    childrenByParent.set(parentId, list);
  }

  return { roots, childrenByParent };
}

async function syncProducts(shopId: string, admin: AdminGraphqlClient) {
  const nodes = await runBulkQuery(
    admin,
    `{
      products {
        edges {
          node {
            id
            title
            handle
            status
            productType
            vendor
            publishedAt
            variants {
              edges {
                node {
                  id
                  title
                  sku
                  price
                  compareAtPrice
                  inventoryQuantity
                }
              }
            }
          }
        }
      }
    }`,
  );

  const { roots, childrenByParent } = partitionByParent(nodes);
  for (const product of roots) {
    await upsertProductFromGraphQLNode(shopId, product);
    for (const variant of childrenByParent.get(product.id) ?? []) {
      await upsertVariantFromGraphQLNode(shopId, product.id, variant);
    }
  }
}

async function syncOrders(shopId: string, admin: AdminGraphqlClient) {
  const nodes = await runBulkQuery(
    admin,
    `{
      orders {
        edges {
          node {
            id
            name
            email
            displayFinancialStatus
            displayFulfillmentStatus
            currencyCode
            cancelledAt
            processedAt
            totalPriceSet { shopMoney { amount } }
            subtotalPriceSet { shopMoney { amount } }
            totalDiscountsSet { shopMoney { amount } }
            customer { id }
            lineItems {
              edges {
                node {
                  id
                  title
                  quantity
                  originalUnitPriceSet { shopMoney { amount } }
                }
              }
            }
          }
        }
      }
    }`,
  );

  const { roots, childrenByParent } = partitionByParent(nodes);
  for (const order of roots) {
    await upsertOrderFromGraphQLNode(shopId, order);
    for (const lineItem of childrenByParent.get(order.id) ?? []) {
      await upsertLineItemFromGraphQLNode(shopId, order.id, lineItem);
    }
  }
}

async function syncCustomers(shopId: string, admin: AdminGraphqlClient) {
  const nodes = await runBulkQuery(
    admin,
    `{
      customers {
        edges {
          node {
            id
            email
            firstName
            lastName
            numberOfOrders
            amountSpent { amount }
          }
        }
      }
    }`,
  );

  const { roots } = partitionByParent(nodes);
  for (const customer of roots) {
    await upsertCustomerFromGraphQLNode(shopId, customer);
  }
}

async function syncCollections(shopId: string, admin: AdminGraphqlClient) {
  const nodes = await runBulkQuery(
    admin,
    `{
      collections {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }`,
  );

  const { roots } = partitionByParent(nodes);
  for (const collection of roots) {
    await upsertCollectionFromGraphQLNode(shopId, collection);
  }
}

async function syncDiscounts(shopId: string, admin: AdminGraphqlClient) {
  const nodes = await runBulkQuery(
    admin,
    `{
      discountNodes {
        edges {
          node {
            id
            discount {
              ... on DiscountCodeBasic {
                title
                status
                startsAt
                endsAt
              }
              ... on DiscountAutomaticBasic {
                title
                status
                startsAt
                endsAt
              }
            }
          }
        }
      }
    }`,
  );

  const { roots } = partitionByParent(nodes);
  for (const node of roots) {
    await upsertDiscountFromGraphQLNode(shopId, { id: node.id, ...node.discount });
  }
}

/** Runs the full initial (or re-triggered) bulk sync for a shop, sequentially per entity. */
export async function runInitialSync(shopId: string, admin: AdminGraphqlClient) {
  await syncProducts(shopId, admin);
  await syncOrders(shopId, admin);
  await syncCustomers(shopId, admin);
  await syncCollections(shopId, admin);
  await syncDiscounts(shopId, admin);
  await markSyncCompleted(shopId);
}
