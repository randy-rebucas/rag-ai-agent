import type { Prisma } from "@prisma/client";
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { recordEvent } from "../lib/shopify-data/events.server";
import db from "../db.server";

type DataRequestPayload = {
  shop_id: number;
  shop_domain: string;
  customer: { id: number; email?: string; phone?: string };
  orders_requested?: number[];
};

/**
 * GDPR mandatory webhook: a customer asked the merchant for the data this app
 * holds on them. This app has no automated data-export flow, so we log the
 * request as an auditable Event for the merchant to fulfil within 30 days
 * (see https://shopify.dev/docs/apps/build/privacy-law-compliance).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const data = payload as DataRequestPayload;

  const shopRecord = await db.shop.findUnique({ where: { shopDomain: shop } });
  if (shopRecord) {
    await recordEvent({
      shopId: shopRecord.id,
      eventType: "COMPLIANCE_REQUEST",
      entityType: "customer",
      entityId: data.customer?.id ? String(data.customer.id) : null,
      actor: "shopify",
      payload: data as unknown as Prisma.InputJsonValue,
      occurredAt: new Date(),
    });
  }

  return new Response();
};
