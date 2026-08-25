import type { LoaderFunctionArgs } from "react-router";
import { ensureShop } from "../lib/shopify-data/shop.server";
import { exchangeCodeForTokens, fetchGoogleEmail, verifyState } from "../lib/google/drive.server";
import db from "../db.server";

function popupResponse(message: string, ok: boolean) {
  const html = `<!doctype html>
<html>
  <body>
    <p>${ok ? "Google Drive connected." : "Something went wrong connecting Google Drive."}</p>
    <script>
      window.opener?.postMessage(${JSON.stringify(ok ? "google-drive-connected" : "google-drive-error")}, "*");
      window.close();
    </script>
  </body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" }, status: ok ? 200 : 400 });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return popupResponse("Missing code or state", false);
  }

  let shopDomain: string;
  try {
    shopDomain = verifyState(state);
  } catch {
    return popupResponse("Invalid state", false);
  }

  try {
    const shop = await ensureShop(shopDomain);
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Google only returns a refresh token on first consent — if the merchant
      // already granted access once before without revoking it, force re-consent.
      return popupResponse("Google didn't return a refresh token — please revoke access in your Google account and try again.", false);
    }
    const email = await fetchGoogleEmail(tokens.access_token);

    await db.shopSettings.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token,
        googleTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        googleEmail: email,
      },
      update: {
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token,
        googleTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        googleEmail: email,
      },
    });

    return popupResponse("Connected", true);
  } catch (error) {
    console.error("Google Drive OAuth callback failed:", error);
    return popupResponse("Failed to connect Google Drive", false);
  }
};
