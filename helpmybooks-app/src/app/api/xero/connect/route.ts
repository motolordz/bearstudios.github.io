import { NextRequest, NextResponse } from "next/server";
import { hasXeroConfig, xeroAuthUrl } from "@/lib/xero";
import { requireUser, isAuthFailure, canManageTeam } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

/**
 * Owner/admin only. Called via apiFetch (Bearer token) so it can identify the
 * caller's organisation — the org id travels in the httpOnly oauth-state
 * cookie and is read back by /api/xero/callback, which has no session of its
 * own (it's a plain browser redirect from Xero).
 */
export async function GET(req: NextRequest) {
  if (!hasXeroConfig()) {
    return NextResponse.json(
      { mode: "mock", message: "Xero not configured. Set XERO_CLIENT_ID and XERO_CLIENT_SECRET to enable the OAuth flow." },
      { status: 202 }
    );
  }

  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json(
      { mode: "mock", message: "Demo mode — connect Supabase to link a real Xero account." },
      { status: 202 }
    );
  }
  if (!canManageTeam(auth.profile.role)) {
    return NextResponse.json({ error: "Only owners and admins can connect Xero." }, { status: 403 });
  }
  if (!auth.profile.organisation_id) {
    return NextResponse.json({ error: "Create an organisation first." }, { status: 400 });
  }

  const state = crypto.randomUUID();
  const res = NextResponse.json({ url: xeroAuthUrl(state) });
  res.cookies.set("xero_oauth_state", `${auth.profile.organisation_id}.${state}`, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
