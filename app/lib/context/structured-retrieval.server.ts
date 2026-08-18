import db from "../../db.server";
import type { ClassifiedQuery, StructuredFact } from "./types";

const PRODUCT_INTENTS = new Set(["PRODUCT_ANALYSIS", "PRICING_ANALYSIS", "INVENTORY_ANALYSIS"]);
const ORDER_INTENTS = new Set(["SALES_ANALYSIS", "PROFIT_ANALYSIS", "FORECAST"]);
const CUSTOMER_INTENTS = new Set(["CUSTOMER_ANALYSIS"]);

/** Masks a customer email before it enters LLM context (spec §7: minimize customer PII exposure). */
function maskEmail(email: string | null): string {
  if (!email) return "unknown customer";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

function productFact(product: {
  id: string;
  shopifyId: string;
  title: string;
  status: string | null;
  productType: string | null;
  vendor: string | null;
  variants: { shopifyId: string; sku: string | null; price: unknown; inventoryQty: number | null }[];
}): StructuredFact {
  const prices = product.variants
    .map((v) => (v.price !== null ? Number(v.price) : null))
    .filter((p): p is number => p !== null);
  const totalInventory = product.variants.reduce((sum, v) => sum + (v.inventoryQty ?? 0), 0);

  return {
    sourceType: "product",
    sourceId: product.id,
    summary: `${product.title} (${product.status ?? "unknown status"}) — ${prices.length ? `price ${Math.min(...prices)}-${Math.max(...prices)}` : "no price data"}, inventory ${totalInventory}`,
    data: {
      productId: product.shopifyId,
      title: product.title,
      status: product.status,
      productType: product.productType,
      vendor: product.vendor,
      priceRange: prices.length ? [Math.min(...prices), Math.max(...prices)] : null,
      totalInventory,
      variants: product.variants.map((v) => ({
        variantId: v.shopifyId,
        sku: v.sku,
        price: v.price !== null ? Number(v.price) : null,
        inventoryQty: v.inventoryQty,
      })),
    },
  };
}

async function getProductFacts(shopId: string, productTitles: string[] | undefined): Promise<StructuredFact[]> {
  const products = await db.product.findMany({
    where: {
      shopId,
      ...(productTitles?.length
        ? { OR: productTitles.map((title) => ({ title: { contains: title, mode: "insensitive" as const } })) }
        : {}),
    },
    include: { variants: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  return products.map(productFact);
}

async function getOrderFacts(shopId: string, timeRange: ClassifiedQuery["timeRange"]): Promise<StructuredFact[]> {
  const orders = await db.order.findMany({
    where: {
      shopId,
      ...(timeRange ? { processedAt: { gte: timeRange.from, lte: timeRange.to } } : {}),
    },
    orderBy: { processedAt: "desc" },
    take: 20,
  });

  return orders.map((order) => ({
    sourceType: "order",
    sourceId: order.id,
    summary: `Order ${order.name ?? order.id} — ${order.financialStatus ?? "unknown"}, total ${order.totalPrice ?? "?"}`,
    data: {
      name: order.name,
      financialStatus: order.financialStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      totalPrice: order.totalPrice ? Number(order.totalPrice) : null,
      processedAt: order.processedAt,
    },
  }));
}

async function getCustomerFacts(shopId: string): Promise<StructuredFact[]> {
  const customers = await db.customer.findMany({
    where: { shopId },
    orderBy: { totalSpent: "desc" },
    take: 10,
  });

  return customers.map((customer) => ({
    sourceType: "customer",
    sourceId: customer.id,
    summary: `${maskEmail(customer.email)} — ${customer.ordersCount ?? 0} orders, spent ${customer.totalSpent ?? 0}`,
    data: {
      // Full email is deliberately not included here — this data is sent to
      // the LLM as context (spec §7: minimize customer PII exposure; only
      // surface what's relevant to the merchant's question).
      customerRef: maskEmail(customer.email),
      ordersCount: customer.ordersCount,
      totalSpent: customer.totalSpent ? Number(customer.totalSpent) : null,
    },
  }));
}

/** Structured retrieval: pulls typed, pre-trimmed facts from Prisma based on intent. Not a generic dump. */
export async function getStructuredFacts(
  shopId: string,
  classified: ClassifiedQuery,
): Promise<StructuredFact[]> {
  const facts: StructuredFact[] = [];

  if (PRODUCT_INTENTS.has(classified.intent) || classified.entities.productTitles?.length) {
    facts.push(...(await getProductFacts(shopId, classified.entities.productTitles)));
  }

  if (ORDER_INTENTS.has(classified.intent)) {
    facts.push(...(await getOrderFacts(shopId, classified.timeRange)));
  }

  if (CUSTOMER_INTENTS.has(classified.intent)) {
    facts.push(...(await getCustomerFacts(shopId)));
  }

  return facts;
}
