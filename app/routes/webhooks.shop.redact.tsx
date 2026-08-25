import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * GDPR mandatory webhook: Shopify calls this ~48 hours after uninstall to
 * confirm we've erased the shop's data. Product/Order/Customer/etc. cascade
 * from the Shop row's FK, but Event/Memory/ConversationSession/Action/
 * ActionOutcomeStat/Metric/Document only carry a plain shopId column (no FK),
 * so those need explicit deletes before the Shop row itself goes.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  const shopRecord = await db.shop.findUnique({ where: { shopDomain: shop } });
  if (!shopRecord) {
    return new Response();
  }

  await db.$transaction([
    db.event.deleteMany({ where: { shopId: shopRecord.id } }),
    db.memory.deleteMany({ where: { shopId: shopRecord.id } }),
    db.conversationSession.deleteMany({ where: { shopId: shopRecord.id } }),
    db.action.deleteMany({ where: { shopId: shopRecord.id } }),
    db.actionOutcomeStat.deleteMany({ where: { shopId: shopRecord.id } }),
    db.metric.deleteMany({ where: { shopId: shopRecord.id } }),
    db.document.deleteMany({ where: { shopId: shopRecord.id } }),
    db.session.deleteMany({ where: { shop } }),
    // Cascades to Product/ProductVariant/Order/OrderLineItem/Fulfillment/
    // OrderTransaction/Customer/InventoryItem/Collection/Discount/ShopSettings.
    db.shop.delete({ where: { id: shopRecord.id } }),
  ]);

  return new Response();
};
