import type { ActionFunctionArgs } from "react-router";
import { authenticate, MONTHLY_PLAN } from "../shopify.server";

const isTestCharge = process.env.NODE_ENV !== "production";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);

  const { appSubscriptions } = await billing.check({ plans: [MONTHLY_PLAN], isTest: isTestCharge });
  const subscription = appSubscriptions[0];
  if (!subscription) {
    return Response.json({ error: "No active subscription to cancel" }, { status: 400 });
  }

  await billing.cancel({ subscriptionId: subscription.id, isTest: isTestCharge, prorate: true });

  return Response.json({ ok: true });
};
