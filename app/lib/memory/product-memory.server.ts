import type { Product, ProductVariant } from "@prisma/client";
import db from "../../db.server";
import { saveMemory, deleteMemoriesForEntity } from "./memory.server";
import { LOW_STOCK_THRESHOLD } from "../shopify-data/normalize.server";

function formatPriceRange(variants: ProductVariant[]): string | null {
  const prices = variants
    .map((v) => (v.price !== null ? Number(v.price) : null))
    .filter((p): p is number => p !== null);
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `${min}` : `${min}-${max}`;
}

/** high if any variant is at/under the low-stock threshold, otherwise low. No "medium" tier — spec §6 doesn't define one and inventing thresholds would be guessing. */
function computeStockRisk(variants: ProductVariant[]): "high" | "low" | null {
  const quantities = variants.map((v) => v.inventoryQty).filter((q): q is number => q !== null);
  if (quantities.length === 0) return null;
  return quantities.some((q) => q <= LOW_STOCK_THRESHOLD) ? "high" : "low";
}

/** Renders a short semantic summary of a product — not the raw JSON (spec: embed meaningful units, not rows). */
export function buildProductSemanticDocument(
  product: Product,
  variants: ProductVariant[],
): string {
  const priceRange = formatPriceRange(variants);
  const stockRisk = computeStockRisk(variants);
  const parts = [
    `Product: ${product.title}`,
    product.vendor ? `Vendor: ${product.vendor}` : null,
    product.productType ? `Type: ${product.productType}` : null,
    product.status ? `Status: ${product.status}` : null,
    priceRange ? `Price: ${priceRange}` : null,
    `Variants: ${variants.length}`,
    product.salesVelocity !== null ? `Sales velocity: ${Number(product.salesVelocity).toFixed(2)} units/day` : null,
    stockRisk ? `Stock risk: ${stockRisk}` : null,
  ].filter(Boolean);

  return parts.join(". ");
}

/**
 * Replaces the PRODUCT memory for a product with a fresh semantic snapshot.
 * Fire-and-forget-but-logged from the webhook path — a failure here must
 * never fail the webhook response, since semantic memory is an enhancement,
 * not part of keeping structured data correct.
 */
export async function upsertProductMemory(shopId: string, productId: string): Promise<void> {
  try {
    const product = await db.product.findUnique({
      where: { id: productId },
      include: { variants: true },
    });
    if (!product) return;

    const content = buildProductSemanticDocument(product, product.variants);

    await deleteMemoriesForEntity(shopId, "PRODUCT", "product", product.id);
    await saveMemory({
      shopId,
      memoryType: "PRODUCT",
      entityType: "product",
      entityId: product.id,
      content,
      source: "shopify_sync",
      confidence: 1,
      importance: 0.5,
      metadata: { shopifyId: product.shopifyId, title: product.title },
    });
  } catch (error) {
    console.error(`Failed to update product memory for ${productId}:`, error);
  }
}
