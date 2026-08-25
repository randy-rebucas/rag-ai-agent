import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { recordEvent } from "../lib/shopify-data/events.server";
import db from "../db.server";

type RedactPayload = {
  shop_id: number;
  shop_domain: string;
  customer: { id: number; email?: string; phone?: string };
  orders_to_redact?: number[];
};

const REDACTED = "[redacted]";

/**
 * GDPR mandatory webhook: scrub this customer's PII from our tenant copy of
 * Shopify data. We don't delete the Customer/Order rows outright — order
 * totals and product associations still feed store analytics — but every
 * personally-identifying field is overwritten.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const data = payload as RedactPayload;
  const shopifyCustomerId = data.customer?.id ? String(data.customer.id) : null;

  const shopRecord = await db.shop.findUnique({ where: { shopDomain: shop } });
  if (!shopRecord || !shopifyCustomerId) {
    return new Response();
  }

  const customer = await db.customer.findUnique({
    where: { shopId_shopifyId: { shopId: shopRecord.id, shopifyId: shopifyCustomerId } },
  });

  if (customer) {
    await db.customer.update({
      where: { id: customer.id },
      data: {
        email: REDACTED,
        firstName: REDACTED,
        lastName: REDACTED,
        raw: { redacted: true },
      },
    });
    await db.order.updateMany({
      where: { customerId: customer.id },
      data: { email: REDACTED },
    });
  }

  await recordEvent({
    shopId: shopRecord.id,
    eventType: "COMPLIANCE_REQUEST",
    entityType: "customer",
    entityId: shopifyCustomerId,
    actor: "shopify",
    payload: { redacted: true, ordersToRedact: data.orders_to_redact ?? [] },
    occurredAt: new Date(),
  });

  return new Response();
};
