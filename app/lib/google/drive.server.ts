import crypto from "node:crypto";
import db from "../../db.server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email";

// Refresh a bit before actual expiry so a request never races an expired token.
const TOKEN_REFRESH_SKEW_MS = 60_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — Google Drive integration is not configured.`);
  return value;
}

function redirectUri(): string {
  const appUrl = requireEnv("SHOPIFY_APP_URL");
  return `${appUrl.replace(/\/$/, "")}/auth/google/callback`;
}

/** Signs the shop domain into the OAuth state param — there's no session to tie this callback to. */
function signState(shop: string): string {
  const hmac = crypto.createHmac("sha256", requireEnv("SHOPIFY_API_SECRET")).update(shop).digest("hex");
  return `${shop}.${hmac}`;
}

export function verifyState(state: string): string {
  const dotIndex = state.lastIndexOf(".");
  if (dotIndex === -1) throw new Error("Invalid OAuth state.");
  const shop = state.slice(0, dotIndex);
  const signature = state.slice(dotIndex + 1);
  const expected = crypto.createHmac("sha256", requireEnv("SHOPIFY_API_SECRET")).update(shop).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length || !crypto.timingSafeEqual(expectedBuf, signatureBuf)) {
    throw new Error("Invalid OAuth state.");
  }
  return shop;
}

export function getGoogleAuthUrl(shop: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: DRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: signState(shop),
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

async function fetchTokens(body: URLSearchParams): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token request failed (${response.status}): ${text}`);
  }
  return response.json() as Promise<GoogleTokenResponse>;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  return fetchTokens(
    new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code,
    }),
  );
}

async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  return fetchTokens(
    new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}

export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { email?: string };
  return data.email ?? null;
}

/** Returns a usable Drive access token for the shop, refreshing and persisting if needed, or null if not connected. */
export async function getValidAccessToken(shopId: string): Promise<string | null> {
  const settings = await db.shopSettings.findUnique({ where: { shopId } });
  if (!settings?.googleRefreshToken) return null;

  const stillValid =
    settings.googleAccessToken &&
    settings.googleTokenExpiresAt &&
    settings.googleTokenExpiresAt.getTime() - TOKEN_REFRESH_SKEW_MS > Date.now();
  if (stillValid) return settings.googleAccessToken;

  const refreshed = await refreshAccessToken(settings.googleRefreshToken);
  await db.shopSettings.update({
    where: { shopId },
    data: {
      googleAccessToken: refreshed.access_token,
      googleTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    },
  });
  return refreshed.access_token;
}

export async function uploadFileToDrive(
  accessToken: string,
  filename: string,
  mimeType: string,
  bytes: Buffer,
): Promise<{ id: string; webViewLink: string | null }> {
  const boundary = `-------${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: filename });

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const response = await fetch(`${GOOGLE_DRIVE_UPLOAD_URL}&fields=id,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Drive upload failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<{ id: string; webViewLink: string | null }>;
}
