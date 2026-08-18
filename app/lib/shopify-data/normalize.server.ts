/* eslint-disable @typescript-eslint/no-explicit-any -- boundary layer mapping untyped Shopify GraphQL/webhook JSON */
import db from "../../db.server";
import { gidToLegacyId, legacyIdToGid } from "./types";
import { recordEvent } from "./events.server";
import { refreshProductSalesVelocity } from "../context/analytics.server";
import { upsertProductMemory } from "../memory/product-memory.server";

export const LOW_STOCK_THRESHOLD = 5;

function toDecimal(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

// ---------- Products ----------

export async function upsertProduct(
  shopId: string,
  data: {
    shopifyId: string;
    title: string;
    handle?: string | null;
    status?: string | null;
    productType?: string | null;
    vendor?: string | null;
    publishedAt?: Date | null;
    raw: unknown;
  },
) {
  const previous = await db.product.findUnique({
    where: { shopId_shopifyId: { shopId, shopifyId: data.shopifyId } },
  });

  const record = await db.product.upsert({
    where: { shopId_shopifyId: { shopId, shopifyId: data.shopifyId } },
    update: {
      title: data.title,
      handle: data.handle ?? undefined,
      status: data.status ?? undefined,
      productType: data.productType ?? undefined,
      vendor: data.vendor ?? undefined,
      publishedAt: data.publishedAt ?? undefined,
      raw: data.raw as object,
      syncedAt: new Date(),
    },
    create: {
      shopId,
      shopifyId: data.shopifyId,
      title: data.title,
      handle: data.handle ?? null,
      status: data.status ?? null,
      productType: data.productType ?? null,
      vendor: data.vendor ?? null,
      publishedAt: data.publishedAt ?? null,
      raw: data.raw as object,
    },
  });

  return { record, previous };
}

export async function deleteProduct(shopId: string, shopifyId: string) {
  await db.product
    .delete({ where: { shopId_shopifyId: { shopId, shopifyId } } })
    .catch(() => null);
}

export async function upsertVariant(
  shopId: string,
  productId: string,
  data: {
    shopifyId: string;
    title?: string | null;
    sku?: string | null;
    price?: number | null;
    compareAtPrice?: number | null;
    inventoryQty?: number | null;
    raw: unknown;
  },
) {
  const previous = await db.productVariant.findUnique({
    where: { shopId_shopifyId: { shopId, shopifyId: data.shopifyId } },
  });

  const record = await db.productVariant.upsert({
    where: { shopId_shopifyId: { shopId, shopifyId: data.shopifyId } },
    update: {
      title: data.title ?? undefined,
      sku: data.sku ?? undefined,
      price: data.price ?? undefined,
      compareAtPrice: data.compareAtPrice ?? undefined,
      inventoryQty: data.inventoryQty ?? undefined,
      raw: data.raw as object,
      syncedAt: new Date(),
    },
    create: {
      shopId,
      productId,
      shopifyId: data.shopifyId,
      title: data.title ?? null,
      sku: data.sku ?? null,
      price: data.price ?? null,
      compareAtPrice: data.compareAtPrice ?? null,
      inventoryQty: data.inventoryQty ?? null,
      raw: data.raw as object,
    },
  });

  return { record, previous };
}

/** Normalize a Shopify webhook (REST-shaped) product payload, upsert it with its variants, and record activity events. */
export async function upsertProductFromWebhook(
  shopId: string,
  payload: any,
) {
  const shopifyId = String(payload.admin_graphql_api_id ?? legacyIdToGid("Product", payload.id));
  const occurredAt = toDate(payload.updated_at) ?? new Date();
  const { record: product, previous } = await upsertProduct(shopId, {
    shopifyId,
    title: payload.title,
    handle: payload.handle,
    status: payload.status,
    productType: payload.product_type,
    vendor: payload.vendor,
    publishedAt: toDate(payload.published_at),
    raw: payload,
  });

  await recordEvent({
    shopId,
    eventType: previous ? "PRODUCT_UPDATED" : "PRODUCT_CREATED",
    entityType: "product",
    entityId: product.id,
    shopifyId,
    payload: { title: product.title, status: product.status },
    occurredAt,
  });

  for (const variant of payload.variants ?? []) {
    const variantGid = String(
      variant.admin_graphql_api_id ?? legacyIdToGid("ProductVariant", variant.id),
    );
    const newPrice = toDecimal(variant.price);
    const { record: variantRecord, previous: previousVariant } = await upsertVariant(
      shopId,
      product.id,
      {
        shopifyId: variantGid,
        title: variant.title,
        sku: variant.sku,
        price: newPrice,
        compareAtPrice: toDecimal(variant.compare_at_price),
        inventoryQty: variant.inventory_quantity ?? null,
        raw: variant,
      },
    );

    const previousPrice = decimalToNumber(previousVariant?.price);
    if (previousVariant && previousPrice !== null && newPrice !== null && previousPrice !== newPrice) {
      await recordEvent({
        shopId,
        eventType: "PRICE_CHANGED",
        entityType: "product_variant",
        entityId: variantRecord.id,
        shopifyId: variantGid,
        payload: { productId: product.id, from: previousPrice, to: newPrice },
        occurredAt,
      });
    }
  }

  await upsertProductMemory(shopId, product.id);

  return product;
}

/** Normalize a bulk-operation GraphQL product node (variants are upserted separately, keyed by __parentId). No events — bulk sync is a snapshot import, not activity. */
export async function upsertProductFromGraphQLNode(shopId: string, node: any) {
  const { record } = await upsertProduct(shopId, {
    shopifyId: node.id,
    title: node.title,
    handle: node.handle,
    status: node.status,
    productType: node.productType,
    vendor: node.vendor,
    publishedAt: toDate(node.publishedAt),
    raw: node,
  });
  return record;
}

export async function upsertVariantFromGraphQLNode(
  shopId: string,
  productShopifyId: string,
  node: any,
) {
  const product = await db.product.findUnique({
    where: { shopId_shopifyId: { shopId, shopifyId: productShopifyId } },
  });
  if (!product) return null;

  const { record } = await upsertVariant(shopId, product.id, {
    shopifyId: node.id,
    title: node.title,
    sku: node.sku,
    price: toDecimal(node.price),
    compareAtPrice: toDecimal(node.compareAtPrice),
    inventoryQty: node.inventoryQuantity ?? null,
    raw: node,
  });
  return record;
}

// ---------- Orders ----------

export async function upsertOrder(
  shopId: string,
  data: {
    shopifyId: string;
    name?: string | null;
    email?: string | null;
    financialStatus?: string | null;
    fulfillmentStatus?: string | null;
    currency?: string | null;
    totalPrice?: number | null;
    subtotalPrice?: number | null;
    totalDiscounts?: number | null;
    cancelledAt?: Date | null;
    processedAt?: Date | null;
    customerShopifyId?: string | null;
    raw: unknown;
  },
) {
  let customerId: string | undefined;
  if (data.customerShopifyId) {
    const customer = await db.customer.findUnique({
      where: {
        shopId_shopifyId: { shopId, shopifyId: data.customerShopifyId },
      },
    });
    customerId = customer?.id;
  }

  const previous = await db.order.findUnique({
    where: { shopId_shopifyId: { shopId, shopifyId: data.shopifyId } },
  });

  const record = await db.order.upsert({
    where: { shopId_shopifyId: { shopId, shopifyId: data.shopifyId } },
    update: {
      name: data.name ?? undefined,
      email: data.email ?? undefined,
      financialStatus: data.financialStatus ?? undefined,
      fulfillmentStatus: data.fulfillmentStatus ?? undefined,
      currency: data.currency ?? undefined,
      totalPrice: data.totalPrice ?? undefined,
      subtotalPrice: data.subtotalPrice ?? undefined,
      totalDiscounts: data.totalDiscounts ?? undefined,
      cancelledAt: data.cancelledAt ?? undefined,
      processedAt: data.processedAt ?? undefined,
      customerId: customerId ?? undefined,
      raw: data.raw as object,
      syncedAt: new Date(),
    },
    create: {
      shopId,
      shopifyId: data.shopifyId,
      name: data.name ?? null,
      email: data.email ?? null,
      financialStatus: data.financialStatus ?? null,
      fulfillmentStatus: data.fulfillmentStatus ?? null,
      currency: data.currency ?? null,
      totalPrice: data.totalPrice ?? null,
      subtotalPrice: data.subtotalPrice ?? null,
      totalDiscounts: data.totalDiscounts ?? null,
      cancelledAt: data.cancelledAt ?? null,
      processedAt: data.processedAt ?? null,
      customerId: customerId ?? null,
      raw: data.raw as object,
    },
  });

  return { record, previous };
}

export async function upsertLineItem(
  shopId: string,
  orderId: string,
  data: {
    shopifyId: string;
    productId?: string | null;
    title?: string | null;
    quantity?: number | null;
    price?: number | null;
    raw: unknown;
  },
) {
  return db.orderLineItem.upsert({
    where: { shopId_shopifyId: { shopId, shopifyId: data.shopifyId } },
    update: {
      productId: data.productId ?? undefined,
      title: data.title ?? undefined,
      quantity: data.quantity ?? undefined,
      price: data.price ?? undefined,
      raw: data.raw as object,
    },
    create: {
      shopId,
      orderId,
      shopifyId: data.shopifyId,
      productId: data.productId ?? null,
      title: data.title ?? null,
      quantity: data.quantity ?? null,
      price: data.price ?? null,
      raw: data.raw as object,
    },
  });
}

export async function upsertOrderFromWebhook(shopId: string, payload: any) {
  const shopifyId = String(payload.admin_graphql_api_id ?? legacyIdToGid("Order", payload.id));
  const customerShopifyId = payload.customer?.admin_graphql_api_id
    ? String(payload.customer.admin_graphql_api_id)
    : payload.customer?.id
      ? legacyIdToGid("Customer", payload.customer.id)
      : null;
  const occurredAt = toDate(payload.updated_at) ?? new Date();

  const { record: order, previous } = await upsertOrder(shopId, {
    shopifyId,
    name: payload.name,
    email: payload.email,
    financialStatus: payload.financial_status,
    fulfillmentStatus: payload.fulfillment_status,
    currency: payload.currency,
    totalPrice: toDecimal(payload.total_price),
    subtotalPrice: toDecimal(payload.subtotal_price),
    totalDiscounts: toDecimal(payload.total_discounts),
    cancelledAt: toDate(payload.cancelled_at),
    processedAt: toDate(payload.processed_at),
    customerShopifyId,
    raw: payload,
  });

  const wasJustCancelled = !previous?.cancelledAt && order.cancelledAt;
  await recordEvent({
    shopId,
    eventType: !previous ? "ORDER_CREATED" : wasJustCancelled ? "ORDER_CANCELLED" : "ORDER_UPDATED",
    entityType: "order",
    entityId: order.id,
    shopifyId,
    payload: {
      name: order.name,
      financialStatus: order.financialStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      totalPrice: decimalToNumber(order.totalPrice),
    },
    occurredAt,
  });

  for (const item of payload.line_items ?? []) {
    const lineGid = String(
      item.admin_graphql_api_id ?? legacyIdToGid("LineItem", item.id),
    );
    let productId: string | null = null;
    const productGid = legacyIdToGid("Product", item.product_id);
    if (productGid) {
      const product = await db.product.findUnique({
        where: { shopId_shopifyId: { shopId, shopifyId: productGid } },
      });
      productId = product?.id ?? null;
    }
    await upsertLineItem(shopId, order.id, {
      shopifyId: lineGid,
      productId,
      title: item.title,
      quantity: item.quantity ?? null,
      price: toDecimal(item.price),
      raw: item,
    });

    if (productId) {
      // Best-effort snapshot refresh — never block order ingestion on it.
      refreshProductSalesVelocity(shopId, productId).catch((err) =>
        console.error(`Failed to refresh salesVelocity for product ${productId}:`, err),
      );
    }
  }

  return order;
}

export async function upsertOrderFromGraphQLNode(shopId: string, node: any) {
  const customerShopifyId = node.customer?.id ?? null;
  const { record } = await upsertOrder(shopId, {
    shopifyId: node.id,
    name: node.name,
    email: node.email,
    financialStatus: node.displayFinancialStatus,
    fulfillmentStatus: node.displayFulfillmentStatus,
    currency: node.currencyCode,
    totalPrice: toDecimal(node.totalPriceSet?.shopMoney?.amount),
    subtotalPrice: toDecimal(node.subtotalPriceSet?.shopMoney?.amount),
    totalDiscounts: toDecimal(node.totalDiscountsSet?.shopMoney?.amount),
    cancelledAt: toDate(node.cancelledAt),
    processedAt: toDate(node.processedAt),
    customerShopifyId,
    raw: node,
  });
  return record;
}

export async function upsertLineItemFromGraphQLNode(
  shopId: string,
  orderShopifyId: string,
  node: any,
) {
  const order = await db.order.findUnique({
    where: { shopId_shopifyId: { shopId, shopifyId: orderShopifyId } },
  });
  if (!order) return null;

  let productId: string | null = null;
  if (node.product?.id) {
    const product = await db.product.findUnique({
      where: { shopId_shopifyId: { shopId, shopifyId: node.product.id } },
    });
    productId = product?.id ?? null;
  }

  return upsertLineItem(shopId, order.id, {
    shopifyId: node.id,
    productId,
    title: node.title,
    quantity: node.quantity ?? null,
    price: toDecimal(node.originalUnitPriceSet?.shopMoney?.amount),
    raw: node,
  });
}

// ---------- Order transactions ----------
// No dedicated Shopify webhook topic exists for transactions; populated via
// the GraphQL bulk order sync's nested `transactions` list (see sync.server.ts).

export async function upsertOrderTransactionFromGraphQLNode(shopId: string, orderId: string, node: any) {
  return db.orderTransaction.upsert({
    where: { shopId_shopifyId: { shopId, shopifyId: node.id } },
    update: {
      kind: node.kind ?? undefined,
      status: node.status ?? undefined,
      gateway: node.gateway ?? undefined,
      amount: toDecimal(node.amountSet?.shopMoney?.amount) ?? undefined,
      currency: node.amountSet?.shopMoney?.currencyCode ?? undefined,
      processedAt: toDate(node.processedAt) ?? undefined,
      raw: node,
      syncedAt: new Date(),
    },
    create: {
      shopId,
      orderId,
      shopifyId: node.id,
      kind: node.kind ?? null,
      status: node.status ?? null,
      gateway: node.gateway ?? null,
      amount: toDecimal(node.amountSet?.shopMoney?.amount),
      currency: node.amountSet?.shopMoney?.currencyCode ?? null,
      processedAt: toDate(node.processedAt),
      raw: node,
    },
  });
}

// ---------- Fulfillments ----------

export async function upsertFulfillment(
  shopId: string,
  orderId: string,
  data: {
    shopifyId: string;
    status?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    shippedAt?: Date | null;
    raw: unknown;
  },
) {
  const previous = await db.fulfillment.findUnique({
    where: { shopId_shopifyId: { shopId, shopifyId: data.shopifyId } },
  });

  const record = await db.fulfillment.upsert({
    where: { shopId_shopifyId: { shopId, shopifyId: data.shopifyId } },
    update: {
      status: data.status ?? undefined,
      trackingNumber: data.trackingNumber ?? undefined,
      trackingUrl: data.trackingUrl ?? undefined,
      shippedAt: data.shippedAt ?? undefined,
      raw: data.raw as object,
      syncedAt: new Date(),
    },
    create: {
      shopId,
      orderId,
      shopifyId: data.shopifyId,
      status: data.status ?? null,
      trackingNumber: data.trackingNumber ?? null,
      trackingUrl: data.trackingUrl ?? null,
      shippedAt: data.shippedAt ?? null,
      raw: data.raw as object,
    },
  });

  return { record, previous };
}

export async function upsertFulfillmentFromWebhook(shopId: string, payload: any) {
  const shopifyId = String(payload.admin_graphql_api_id ?? legacyIdToGid("Fulfillment", payload.id));
  const orderShopifyId = String(
    payload.order_id ? legacyIdToGid("Order", payload.order_id) : payload.admin_graphql_api_order_id,
  );
  const occurredAt = toDate(payload.updated_at) ?? new Date();

  const order = await db.order.findUnique({
    where: { shopId_shopifyId: { shopId, shopifyId: orderShopifyId } },
  });
  if (!order) return null;

  const trackingNumber = Array.isArray(payload.tracking_numbers)
    ? (payload.tracking_numbers[0] ?? null)
    : (payload.tracking_number ?? null);
  const trackingUrl = Array.isArray(payload.tracking_urls)
    ? (payload.tracking_urls[0] ?? null)
    : (payload.tracking_url ?? null);

  const { record: fulfillment, previous } = await upsertFulfillment(shopId, order.id, {
    shopifyId,
    status: payload.status ?? payload.shipment_status ?? null,
    trackingNumber,
    trackingUrl,
    shippedAt: toDate(payload.created_at),
    raw: payload,
  });

  await recordEvent({
    shopId,
    eventType: !previous ? "FULFILLMENT_CREATED" : "FULFILLMENT_UPDATED",
    entityType: "fulfillment",
    entityId: fulfillment.id,
    shopifyId,
    payload: { orderId: order.id, status: fulfillment.status, trackingNumber: fulfillment.trackingNumber },
    occurredAt,
  });

  return fulfillment;
}

// ---------- Customers ----------

export async function upsertCustomer(
  shopId: string,
  data: {
    shopifyId: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    ordersCount?: number | null;
    totalSpent?: number | null;
    raw: unknown;
  },
) {
  const previous = await db.customer.findUnique({
    where: { shopId_shopifyId: { shopId, shopifyId: data.shopifyId } },
  });

  const record = await db.customer.upsert({
    where: { shopId_shopifyId: { shopId, shopifyId: data.shopifyId } },
    update: {
      email: data.email ?? undefined,
      firstName: data.firstName ?? undefined,
      lastName: data.lastName ?? undefined,
      ordersCount: data.ordersCount ?? undefined,
      totalSpent: data.totalSpent ?? undefined,
      raw: data.raw as object,
      syncedAt: new Date(),
    },
    create: {
      shopId,
      shopifyId: data.shopifyId,
      email: data.email ?? null,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      ordersCount: data.ordersCount ?? null,
      totalSpent: data.totalSpent ?? null,
      raw: data.raw as object,
    },
  });

  return { record, previous };
}

export async function upsertCustomerFromWebhook(shopId: string, payload: any) {
  const shopifyId = String(payload.admin_graphql_api_id ?? legacyIdToGid("Customer", payload.id));
  const occurredAt = toDate(payload.updated_at) ?? new Date();

  const { record: customer, previous } = await upsertCustomer(shopId, {
    shopifyId,
    email: payload.email,
    firstName: payload.first_name,
    lastName: payload.last_name,
    ordersCount: payload.orders_count ?? null,
    totalSpent: toDecimal(payload.total_spent),
    raw: payload,
  });

  await recordEvent({
    shopId,
    eventType: previous ? "CUSTOMER_UPDATED" : "CUSTOMER_CREATED",
    entityType: "customer",
    entityId: customer.id,
    shopifyId,
    payload: { email: customer.email },
    occurredAt,
  });

  return customer;
}

export async function upsertCustomerFromGraphQLNode(shopId: string, node: any) {
  const { record } = await upsertCustomer(shopId, {
    shopifyId: node.id,
    email: node.email,
    firstName: node.firstName,
    lastName: node.lastName,
    ordersCount: node.numberOfOrders ? Number(node.numberOfOrders) : null,
    totalSpent: toDecimal(node.amountSpent?.amount),
    raw: node,
  });
  return record;
}

// ---------- Collections ----------

export async function upsertCollection(
  shopId: string,
  data: {
    shopifyId: string;
    title: string;
    handle?: string | null;
    raw: unknown;
  },
) {
  return db.collection.upsert({
    where: { shopId_shopifyId: { shopId, shopifyId: data.shopifyId } },
    update: {
      title: data.title,
      handle: data.handle ?? undefined,
      raw: data.raw as object,
      syncedAt: new Date(),
    },
    create: {
      shopId,
      shopifyId: data.shopifyId,
      title: data.title,
      handle: data.handle ?? null,
      raw: data.raw as object,
    },
  });
}

export async function upsertCollectionFromWebhook(shopId: string, payload: any) {
  const shopifyId = String(payload.admin_graphql_api_id ?? legacyIdToGid("Collection", payload.id));
  const collection = await upsertCollection(shopId, {
    shopifyId,
    title: payload.title,
    handle: payload.handle,
    raw: payload,
  });

  await recordEvent({
    shopId,
    eventType: "COLLECTION_UPDATED",
    entityType: "collection",
    entityId: collection.id,
    shopifyId,
    payload: { title: collection.title },
    occurredAt: toDate(payload.updated_at) ?? new Date(),
  });

  return collection;
}

export async function upsertCollectionFromGraphQLNode(shopId: string, node: any) {
  return upsertCollection(shopId, {
    shopifyId: node.id,
    title: node.title,
    handle: node.handle,
    raw: node,
  });
}

// ---------- Discounts ----------

export async function upsertDiscount(
  shopId: string,
  data: {
    shopifyId: string;
    title?: string | null;
    status?: string | null;
    startsAt?: Date | null;
    endsAt?: Date | null;
    raw: unknown;
  },
) {
  const previous = await db.discount.findUnique({
    where: { shopId_shopifyId: { shopId, shopifyId: data.shopifyId } },
  });

  const record = await db.discount.upsert({
    where: { shopId_shopifyId: { shopId, shopifyId: data.shopifyId } },
    update: {
      title: data.title ?? undefined,
      status: data.status ?? undefined,
      startsAt: data.startsAt ?? undefined,
      endsAt: data.endsAt ?? undefined,
      raw: data.raw as object,
      syncedAt: new Date(),
    },
    create: {
      shopId,
      shopifyId: data.shopifyId,
      title: data.title ?? null,
      status: data.status ?? null,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      raw: data.raw as object,
    },
  });

  return { record, previous };
}

export async function upsertDiscountFromWebhook(shopId: string, payload: any) {
  const shopifyId = String(
    payload.admin_graphql_api_id ?? legacyIdToGid("DiscountCodeNode", payload.id),
  );
  const { record: discount, previous } = await upsertDiscount(shopId, {
    shopifyId,
    title: payload.title ?? payload.code ?? null,
    status: payload.status,
    startsAt: toDate(payload.starts_at),
    endsAt: toDate(payload.ends_at),
    raw: payload,
  });

  await recordEvent({
    shopId,
    eventType: previous ? "DISCOUNT_UPDATED" : "DISCOUNT_CREATED",
    entityType: "discount",
    entityId: discount.id,
    shopifyId,
    payload: { title: discount.title, status: discount.status },
    occurredAt: new Date(),
  });

  return discount;
}

export async function upsertDiscountFromGraphQLNode(shopId: string, node: any) {
  const discount = node.codeDiscount ?? node.automaticDiscount ?? node;
  const { record } = await upsertDiscount(shopId, {
    shopifyId: node.id,
    title: discount?.title,
    status: discount?.status,
    startsAt: toDate(discount?.startsAt),
    endsAt: toDate(discount?.endsAt),
    raw: node,
  });
  return record;
}

// ---------- Inventory ----------

export async function upsertInventoryLevel(
  shopId: string,
  data: {
    shopifyId: string;
    sku?: string | null;
    locationId?: string | null;
    available?: number | null;
    raw: unknown;
  },
) {
  const previous = await db.inventoryItem.findUnique({
    where: {
      shopId_shopifyId_locationId: {
        shopId,
        shopifyId: data.shopifyId,
        locationId: data.locationId ?? "",
      },
    },
  });

  const record = await db.inventoryItem.upsert({
    where: {
      shopId_shopifyId_locationId: {
        shopId,
        shopifyId: data.shopifyId,
        locationId: data.locationId ?? "",
      },
    },
    update: {
      sku: data.sku ?? undefined,
      available: data.available ?? undefined,
      raw: data.raw as object,
      syncedAt: new Date(),
    },
    create: {
      shopId,
      shopifyId: data.shopifyId,
      sku: data.sku ?? null,
      locationId: data.locationId ?? "",
      available: data.available ?? null,
      raw: data.raw as object,
    },
  });

  return { record, previous };
}

export async function upsertInventoryLevelFromWebhook(
  shopId: string,
  payload: any,
) {
  const shopifyId = String(
    payload.admin_graphql_api_id ??
      legacyIdToGid("InventoryItem", payload.inventory_item_id),
  );
  const locationId = String(
    payload.location_id ? legacyIdToGid("Location", payload.location_id) : "",
  );

  const { record: item, previous } = await upsertInventoryLevel(shopId, {
    shopifyId,
    locationId,
    available: payload.available ?? null,
    raw: payload,
  });

  const previousAvailable = previous?.available ?? null;
  const newAvailable = item.available ?? null;

  let eventType: "INVENTORY_LOW" | "INVENTORY_RESTOCKED" | "INVENTORY_UPDATED" = "INVENTORY_UPDATED";
  if (newAvailable !== null && newAvailable <= LOW_STOCK_THRESHOLD && (previousAvailable === null || previousAvailable > LOW_STOCK_THRESHOLD)) {
    eventType = "INVENTORY_LOW";
  } else if (newAvailable !== null && newAvailable > 0 && previousAvailable !== null && previousAvailable <= 0) {
    eventType = "INVENTORY_RESTOCKED";
  }

  await recordEvent({
    shopId,
    eventType,
    entityType: "inventory_item",
    entityId: item.id,
    shopifyId,
    payload: { from: previousAvailable, to: newAvailable, locationId },
    occurredAt: new Date(),
  });

  return item;
}

export { gidToLegacyId };
