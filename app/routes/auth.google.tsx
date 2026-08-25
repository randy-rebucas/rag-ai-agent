import type { LoaderFunctionArgs } from "react-router";
import { getGoogleAuthUrl } from "../lib/google/drive.server";

// Opened in a top-level tab from Settings (Google blocks OAuth inside an
// embedded iframe), so this can't go through authenticate.admin — the shop
// is identified by the query param and signed into the OAuth state instead.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) {
    throw new Response("Missing shop parameter", { status: 400 });
  }

  return Response.redirect(getGoogleAuthUrl(shop), 302);
};
