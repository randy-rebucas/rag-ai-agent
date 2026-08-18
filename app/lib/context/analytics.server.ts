import db from "../../db.server";
import type { TimeRange } from "./types";

export type SalesMetrics = {
  orderCount: number;
  totalRevenue: number;
  averageOrderValue: number;
  timeRange: TimeRange | null;
};

/**
 * Minimal analytical retrieval: order count/revenue/AOV for a window.
 * Deliberately not the full Business Intelligence layer (spec §26) —
 * conversion rate, LTV, cohorts need traffic data this app doesn't ingest.
 * Just enough to make the Context Engine's analytical-retrieval slot real.
 */
export async function getSalesMetrics(shopId: string, timeRange: TimeRange | null): Promise<SalesMetrics> {
  const aggregate = await db.order.aggregate({
    where: {
      shopId,
      cancelledAt: null,
      ...(timeRange ? { processedAt: { gte: timeRange.from, lte: timeRange.to } } : {}),
    },
    _count: { _all: true },
    _sum: { totalPrice: true },
  });

  const orderCount = aggregate._count._all;
  const totalRevenue = aggregate._sum.totalPrice ? Number(aggregate._sum.totalPrice) : 0;
  const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

  return { orderCount, totalRevenue, averageOrderValue, timeRange };
}

const SALES_VELOCITY_WINDOW_DAYS = 30;

/**
 * Recomputes and persists the Product.salesVelocity snapshot (spec §3.2 tier 1:
 * a cached current-state field, distinct from on-demand analytical retrieval).
 * Caller-driven (e.g. after order ingestion or on insight generation) rather
 * than wired into every webhook, to avoid a DB write on every line item.
 */
export async function refreshProductSalesVelocity(shopId: string, productId: string): Promise<number> {
  const since = new Date(Date.now() - SALES_VELOCITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const aggregate = await db.orderLineItem.aggregate({
    where: {
      shopId,
      productId,
      order: { cancelledAt: null, processedAt: { gte: since } },
    },
    _sum: { quantity: true },
  });

  const unitsSold = aggregate._sum.quantity ?? 0;
  const velocity = unitsSold / SALES_VELOCITY_WINDOW_DAYS;

  await db.product.update({
    where: { id: productId },
    data: { salesVelocity: velocity, metricsUpdatedAt: new Date() },
  });

  return velocity;
}
