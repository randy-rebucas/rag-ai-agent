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
