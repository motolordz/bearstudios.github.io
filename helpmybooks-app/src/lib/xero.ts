/**
 * Xero OAuth 2.0 integration layer.
 * Note: Hubdoc has no public API (confirmed), so Xero is the direct
 * bank-feed/transaction source. Flow:
 *   1. /api/xero/connect  -> returns the Xero consent URL for the caller's org
 *   2. /api/xero/callback -> exchange code for tokens, persist encrypted, redirect to dashboard
 *   3. getValidAccessToken(org) -> decrypts stored tokens, refreshes if near expiry
 *   4. fetchBankTransactions(accessToken, tenantId) for reconciliation queue (see /api/xero/sync)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret, decryptSecret } from "./crypto";

const AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const SCOPES = "openid profile email accounting.transactions accounting.contacts offline_access";

export function hasXeroConfig(): boolean {
  return !!(process.env.XERO_CLIENT_ID?.trim() && process.env.XERO_CLIENT_SECRET?.trim());
}

export function xeroAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.XERO_CLIENT_ID!,
    redirect_uri: process.env.XERO_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_APP_URL}/api/xero/callback`,
    scope: SCOPES,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface XeroTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  id_token?: string;
}

export async function exchangeCodeForTokens(code: string): Promise<XeroTokens> {
  const auth = Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.XERO_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_APP_URL}/api/xero/callback`,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Xero token exchange failed: ${res.status}`);
  return res.json();
}

export async function refreshTokens(refreshToken: string): Promise<XeroTokens> {
  const auth = Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(),
  });
  if (!res.ok) throw new Error(`Xero token refresh failed: ${res.status}`);
  return res.json();
}

export interface XeroConnectionInfo {
  tenantId: string;
  tenantName: string | null;
}

export async function getTenantInfo(accessToken: string): Promise<XeroConnectionInfo | null> {
  const res = await fetch(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const connections = await res.json();
  const first = connections?.[0];
  if (!first?.tenantId) return null;
  return { tenantId: first.tenantId, tenantName: first.tenantName ?? null };
}

/** Persist a freshly-issued token pair (encrypted) for the organisation. */
export async function saveXeroConnection(
  supabase: SupabaseClient,
  organisationId: string,
  tokens: XeroTokens,
  info: XeroConnectionInfo
): Promise<void> {
  await supabase.from("xero_connections").upsert(
    {
      organisation_id: organisationId,
      tenant_id: info.tenantId,
      tenant_name: info.tenantName,
      access_token: encryptSecret(tokens.access_token),
      refresh_token: encryptSecret(tokens.refresh_token),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    },
    { onConflict: "organisation_id" }
  );
}

/**
 * Returns a live access token for the organisation, refreshing (and
 * persisting the refreshed pair) if the stored token is within 2 minutes
 * of expiry. Returns null if the org has no Xero connection.
 */
export async function getValidAccessToken(
  supabase: SupabaseClient,
  organisationId: string
): Promise<{ accessToken: string; tenantId: string } | null> {
  const { data: conn } = await supabase
    .from("xero_connections")
    .select("*")
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (!conn?.access_token || !conn?.refresh_token) return null;

  const expiresAt = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
  const soonToExpire = expiresAt - Date.now() < 2 * 60 * 1000;

  if (!soonToExpire) {
    return { accessToken: decryptSecret(conn.access_token), tenantId: conn.tenant_id };
  }

  const refreshed = await refreshTokens(decryptSecret(conn.refresh_token));
  await saveXeroConnection(supabase, organisationId, refreshed, {
    tenantId: conn.tenant_id,
    tenantName: conn.tenant_name,
  });
  return { accessToken: refreshed.access_token, tenantId: conn.tenant_id };
}

export async function fetchBankTransactions(accessToken: string, tenantId: string) {
  const res = await fetch("https://api.xero.com/api.xro/2.0/BankTransactions?page=1", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-Tenant-Id": tenantId,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Xero bank transactions fetch failed: ${res.status}`);
  const data = await res.json();
  return data?.BankTransactions ?? [];
}
