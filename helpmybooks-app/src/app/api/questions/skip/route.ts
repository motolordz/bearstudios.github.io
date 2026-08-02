import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient, getAuthMode } from "@/lib/supabaseClient";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * "Skip for now" from the client portal — doesn't change the transaction's
 * status (it stays waiting_client/unanswered so it resurfaces next visit),
 * just records that the client saw it and chose to defer it.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`questions-skip:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests, please try again shortly." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const { token, transaction_id } = body ?? {};
  if (!token || !transaction_id) {
    return NextResponse.json({ error: "token and transaction_id are required" }, { status: 400 });
  }

  if (getAuthMode() === "mock") {
    return NextResponse.json({ mode: "mock", ok: true }, { status: 202 });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: client } = await supabase.from("clients").select("id, organisation_id").eq("secure_link_token", token).single();
  if (!client) return NextResponse.json({ error: "invalid link" }, { status: 403 });

  const { data: txn } = await supabase.from("transactions").select("id").eq("id", transaction_id).eq("client_id", client.id).single();
  if (!txn) return NextResponse.json({ error: "transaction not found for this client" }, { status: 404 });

  await supabase.from("audit_logs").insert({
    organisation_id: client.organisation_id,
    actor: `client_token:${token.slice(0, 8)}…`,
    action: "question_skipped",
    entity: `transaction:${transaction_id}`,
  });

  return NextResponse.json({ ok: true });
}
