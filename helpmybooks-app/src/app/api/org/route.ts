import { NextRequest, NextResponse } from "next/server";
import { requireUser, isAuthFailure, canManageTeam } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

const MOCK_ORG = {
  id: "org-demo",
  name: "Mitchell Bookkeeping",
  abn: "51 824 753 556",
  created_at: "2026-01-01T00:00:00Z",
};

/** GET — the caller's organisation + their role */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json({ mode: "mock", organisation: MOCK_ORG, role: "owner", full_name: "Sarah Mitchell" });
  }

  if (!auth.profile.organisation_id) {
    return NextResponse.json({ mode: "real", organisation: null, role: auth.profile.role, full_name: auth.profile.full_name });
  }
  const { data, error } = await auth.supabase
    .from("organisations")
    .select("*")
    .eq("id", auth.profile.organisation_id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mode: "real", organisation: data, role: auth.profile.role, full_name: auth.profile.full_name });
}

/** POST — create an organisation and attach the caller as owner */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = (body?.name ?? "").trim();
  const abn = (body?.abn ?? "").trim() || null;
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json(
      { mode: "mock", message: "Mock mode: organisation not persisted.", organisation: { ...MOCK_ORG, name, abn } },
      { status: 202 }
    );
  }

  if (auth.profile.organisation_id) {
    return NextResponse.json({ error: "You already belong to an organisation" }, { status: 409 });
  }

  const { data: org, error } = await auth.supabase
    .from("organisations")
    .insert({ name, abn })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: pErr } = await auth.supabase
    .from("profiles")
    .update({ organisation_id: org.id, role: "owner" })
    .eq("id", auth.profile.id);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  await auth.supabase.from("billing_accounts").insert({ organisation_id: org.id }).select();
  await auth.supabase.from("audit_logs").insert({
    organisation_id: org.id,
    actor: auth.profile.id,
    action: "organisation_created",
    entity: `organisation:${org.id}`,
  });

  return NextResponse.json({ mode: "real", organisation: org });
}

/** PATCH — update name/ABN (owner/admin only) */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json(
      { mode: "mock", message: "Mock mode: update accepted but not persisted." },
      { status: 202 }
    );
  }
  if (!canManageTeam(auth.profile.role)) {
    return NextResponse.json({ error: "Only owners and admins can edit the organisation" }, { status: 403 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body?.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (typeof body?.abn === "string") update.abn = body.abn.trim() || null;
  if (!Object.keys(update).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const { data, error } = await auth.supabase
    .from("organisations")
    .update(update)
    .eq("id", auth.profile.organisation_id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auth.supabase.from("audit_logs").insert({
    organisation_id: auth.profile.organisation_id,
    actor: auth.profile.id,
    action: "organisation_updated",
    entity: `organisation:${auth.profile.organisation_id}`,
    detail: update,
  });

  return NextResponse.json({ mode: "real", organisation: data });
}
