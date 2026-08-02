import { NextRequest, NextResponse } from "next/server";
import { requireUser, isAuthFailure, isStaff } from "@/lib/serverAuth";
import { hasXeroConfig } from "@/lib/xero";

export const dynamic = "force-dynamic";

/** GET — whether the caller's org has a live Xero connection, and to which tenant. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json({ mode: "mock", configured: false, connected: false, tenantName: null });
  }
  if (!isStaff(auth.profile.role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const { data } = await auth.supabase
    .from("xero_connections")
    .select("tenant_name, created_at")
    .eq("organisation_id", auth.profile.organisation_id)
    .maybeSingle();

  return NextResponse.json({
    mode: "real",
    configured: hasXeroConfig(),
    connected: !!data,
    tenantName: data?.tenant_name ?? null,
    connectedAt: data?.created_at ?? null,
  });
}
