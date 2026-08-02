import { NextRequest, NextResponse } from "next/server";
import { requireUser, isAuthFailure, isStaff } from "@/lib/serverAuth";
import { mockClients } from "@/lib/mockData";

export const dynamic = "force-dynamic";

/**
 * GET — list the org's clients.
 * Query params: q (search name/email/business), archived (true|false|all), tag
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const archived = url.searchParams.get("archived") ?? "false";
  const tag = (url.searchParams.get("tag") ?? "").trim();

  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    const filtered = mockClients.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
    return NextResponse.json({ mode: "mock", clients: filtered });
  }

  let query = auth.supabase
    .from("clients")
    .select("*")
    .eq("organisation_id", auth.profile.organisation_id)
    .order("name");
  if (archived !== "all") query = query.eq("archived", archived === "true");
  if (tag) query = query.contains("tags", [tag]);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const clients = q
    ? data.filter((c) =>
        [c.name, c.email, c.business_name, c.contact_person]
          .filter(Boolean)
          .some((v: string) => v.toLowerCase().includes(q))
      )
    : data;
  return NextResponse.json({ mode: "real", clients });
}

/** POST — create a client */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = (body?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json(
      { mode: "mock", message: "Mock mode: client not persisted.", client: { id: `local-${Date.now()}`, name } },
      { status: 202 }
    );
  }
  if (!isStaff(auth.profile.role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const insert = {
    organisation_id: auth.profile.organisation_id,
    name,
    email: (body?.email ?? "").trim() || null,
    phone: (body?.phone ?? "").trim() || null,
    business_name: (body?.business_name ?? "").trim() || null,
    contact_person: (body?.contact_person ?? "").trim() || null,
    abn: (body?.abn ?? "").trim() || null,
    tags: Array.isArray(body?.tags) ? body.tags : [],
  };
  const { data, error } = await auth.supabase.from("clients").insert(insert).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auth.supabase.from("audit_logs").insert({
    organisation_id: auth.profile.organisation_id,
    actor: auth.profile.id,
    action: "client_created",
    entity: `client:${data.id}`,
  });

  return NextResponse.json({ mode: "real", client: data });
}

/** PATCH — edit / archive / restore / tag a client */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = body?.id;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json({ mode: "mock", message: "Mock mode: update not persisted." }, { status: 202 });
  }
  if (!isStaff(auth.profile.role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const update: Record<string, unknown> = {};
  const strFields = ["name", "email", "phone", "business_name", "contact_person", "abn", "bookkeeping_status"];
  for (const f of strFields) {
    if (typeof body?.[f] === "string") update[f] = body[f].trim() || null;
  }
  if (typeof body?.archived === "boolean") update.archived = body.archived;
  if (Array.isArray(body?.tags)) update.tags = body.tags.map((t: string) => String(t).trim()).filter(Boolean);
  if (!Object.keys(update).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const { data, error } = await auth.supabase
    .from("clients")
    .update(update)
    .eq("id", id)
    .eq("organisation_id", auth.profile.organisation_id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auth.supabase.from("audit_logs").insert({
    organisation_id: auth.profile.organisation_id,
    actor: auth.profile.id,
    action: typeof body?.archived === "boolean" ? (body.archived ? "client_archived" : "client_restored") : "client_updated",
    entity: `client:${id}`,
  });

  return NextResponse.json({ mode: "real", client: data });
}
