import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthMode } from "@/lib/supabaseClient";
import { requireUser, isAuthFailure, isStaff } from "@/lib/serverAuth";
import { mockClients, mockTransactions } from "@/lib/mockData";
import { categoriseTransaction, lookupOrgMemory } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (getAuthMode() === "mock") {
    return NextResponse.json({ mode: "mock", transactions: mockTransactions, clients: mockClients });
  }
  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json({ mode: "mock", transactions: mockTransactions, clients: mockClients });
  }
  if (!isStaff(auth.profile.role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });
  const supabase = auth.supabase;
  const orgId = auth.profile.organisation_id;
  const [txns, clients] = await Promise.all([
    supabase.from("transactions").select("*").eq("organisation_id", orgId).order("date", { ascending: false }),
    supabase.from("clients").select("*").eq("organisation_id", orgId),
  ]);
  if (txns.error || clients.error) {
    return NextResponse.json({ error: txns.error?.message ?? clients.error?.message }, { status: 500 });
  }
  return NextResponse.json({ mode: "real", transactions: txns.data, clients: clients.data });
}

/** Manual transaction entry — staff pick a client and key in a bank line by hand. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { client_id, date, amount, merchant, description } = body ?? {};
  if (!client_id || !date || amount === undefined || !merchant) {
    return NextResponse.json({ error: "client_id, date, amount and merchant are required" }, { status: 400 });
  }

  if (getAuthMode() === "mock") {
    return NextResponse.json(
      { mode: "mock", message: "Mock mode: transaction not persisted.", transaction: { id: `local-${Date.now()}`, client_id, date, amount, merchant } },
      { status: 202 }
    );
  }
  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json({ mode: "mock", message: "Mock mode: transaction not persisted." }, { status: 202 });
  }
  if (!isStaff(auth.profile.role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });
  const supabase = auth.supabase;
  const orgId = auth.profile.organisation_id;

  const { data: client } = await supabase.from("clients").select("id").eq("id", client_id).eq("organisation_id", orgId).single();
  if (!client) return NextResponse.json({ error: "client not found" }, { status: 404 });

  const memoryMatch = await lookupOrgMemory(supabase, orgId, String(merchant));
  const ai = await categoriseTransaction({
    merchant: String(merchant),
    description: String(description ?? ""),
    amount: Number(amount),
    date: String(date),
    memoryMatch,
  });

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      organisation_id: orgId,
      client_id,
      date,
      amount: Number(amount),
      merchant: String(merchant),
      description: String(description ?? ""),
      source: "manual",
      ai_suggested_category: ai.suggested_category,
      ai_confidence: ai.confidence,
      gst_claimable: ai.gst_claimable,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("audit_logs").insert({
    organisation_id: orgId,
    actor: auth.profile.id,
    action: "transaction_created_manual",
    entity: `transaction:${data.id}`,
  });

  return NextResponse.json({ mode: "real", transaction: data });
}

async function applyUpdate(
  supabase: SupabaseClient,
  organisationId: string,
  actorId: string,
  id: string,
  update: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing } = await supabase
    .from("transactions")
    .select("merchant, gst_claimable")
    .eq("id", id)
    .eq("organisation_id", organisationId)
    .single();

  const { error } = await supabase.from("transactions").update(update).eq("id", id).eq("organisation_id", organisationId);
  if (error) return { ok: false, error: error.message };

  // Learn-on-approval: a bookkeeper setting a final category on review/reconcile
  // is a stronger signal than the AI's own guess — remember it for next time.
  const finalCategory = update.final_category;
  const status = update.status;
  if (
    existing?.merchant &&
    typeof finalCategory === "string" &&
    finalCategory.trim() &&
    (status === "reviewed" || status === "reconciled")
  ) {
    await supabase.from("ai_memory").upsert(
      {
        organisation_id: organisationId,
        merchant_pattern: existing.merchant.toLowerCase(),
        learned_category: finalCategory,
        gst_claimable: existing.gst_claimable ?? null,
        confidence: 0.95,
        source: "bookkeeper_override",
      },
      { onConflict: "organisation_id,merchant_pattern" }
    );
  }

  await supabase.from("audit_logs").insert({
    organisation_id: organisationId,
    actor: actorId,
    action: "status_changed",
    entity: `transaction:${id}`,
    detail: update,
  });
  return { ok: true };
}

/** Accepts either { id, ... } for a single update or { ids: [...], ... } for bulk actions. */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ids, status, final_category, bookkeeper_notes } = body ?? {};
  const targetIds: string[] = Array.isArray(ids) ? ids : id ? [id] : [];
  if (targetIds.length === 0) return NextResponse.json({ error: "id or ids required" }, { status: 400 });

  if (getAuthMode() === "mock") {
    return NextResponse.json(
      { mode: "mock", message: "Mock mode: update accepted but not persisted. Configure Supabase to save changes.", ids: targetIds, status },
      { status: 202 }
    );
  }
  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json(
      { mode: "mock", message: "Mock mode: update accepted but not persisted.", ids: targetIds, status },
      { status: 202 }
    );
  }
  if (!isStaff(auth.profile.role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const update: Record<string, unknown> = {};
  if (status) update.status = status;
  if (final_category !== undefined) update.final_category = final_category;
  if (bookkeeper_notes !== undefined) update.bookkeeper_notes = bookkeeper_notes;

  const results = await Promise.all(
    targetIds.map((tid) => applyUpdate(auth.supabase, auth.profile.organisation_id, auth.profile.id, tid, update))
  );
  const failed = results.filter((r) => !r.ok);
  if (failed.length && targetIds.length === 1) {
    return NextResponse.json({ error: (failed[0] as { error: string }).error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: results.length - failed.length, failed: failed.length });
}
