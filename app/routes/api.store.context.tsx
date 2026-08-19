import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import { buildContext } from "../lib/context/context-engine.server";

/** Spec §44's reusable Context API, exposed directly for debugging/inspection — the agent itself calls buildContext() in-process rather than through this HTTP hop. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await ensureShop(session.shop);

  const url = new URL(request.url);
  const query = url.searchParams.get("q");
  if (!query) {
    return Response.json({ error: "q query param is required" }, { status: 400 });
  }

  const context = await buildContext({ shopId: shopRecord.id, query });
  return Response.json(context);
};
