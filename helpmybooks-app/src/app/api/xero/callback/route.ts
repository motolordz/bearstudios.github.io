import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getTenantInfo, hasXeroConfig, saveXeroConnection } from "@/lib/xero";
import { createServiceSupabaseClient } from "@/lib/supabaseClient";
import { hasEncryptionKey } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!hasXeroConfig()) {
    return NextResponse.json({ error: "Xero not configured" }, { status: 500 });
  }
  if (!hasEncryptionKey()) {
    return NextResponse.json(
      { error: "XERO_TOKEN_ENCRYPTION_KEY is not configured — cannot store Xero tokens safely." },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieValue = req.cookies.get("xero_oauth_state")?.value ?? "";
  const [organisationId, expectedState] = cookieValue.split(".");

  if (!code || !state || !organisationId || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: "Invalid OAuth state or missing code" }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  try {
    const tokens = await exchangeCodeForTokens(code);
    const info = await getTenantInfo(tokens.access_token);
    if (!info) throw new Error("Xero did not return a connected tenant");

    await saveXeroConnection(supabase, organisationId, tokens, info);

    await supabase.from("audit_logs").insert({
      organisation_id: organisationId,
      actor: "system",
      action: "xero_connected",
      entity: `organisation:${organisationId}`,
      detail: { tenant_name: info.tenantName },
    });

    const res = NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard?xero=connected`);
    res.cookies.delete("xero_oauth_state");
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
