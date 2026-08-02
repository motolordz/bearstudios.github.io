import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient, getAuthMode } from "@/lib/supabaseClient";
import { categoriseTransaction, lookupOrgMemory } from "@/lib/ai";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!rateLimit(`answers-submit:${clientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests, please try again shortly." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const { token, transaction_id, who, what, why, business_or_personal, receipt_path, voice_note_path, voice_transcript } = body ?? {};
  const hasVoice = !!voice_note_path;
  if (!token || !transaction_id || (!hasVoice && (!who || !what))) {
    return NextResponse.json(
      { error: "token, transaction_id, and either (who + what) or a voice note are required" },
      { status: 400 }
    );
  }
  const whoText = who || (hasVoice ? "(see voice note)" : "");
  const whatText = what || voice_transcript || (hasVoice ? "(see voice note)" : "");
  const whyText = why || (hasVoice && !what ? voice_transcript ?? "" : "");

  if (getAuthMode() === "mock") {
    // Still run AI (local patterns) so the demo shows the full loop.
    const ai = await categoriseTransaction({
      merchant: body.merchant ?? "",
      description: body.description ?? "",
      amount: Number(body.amount ?? 0),
      date: body.date ?? "",
      answer: { who: whoText, what: whatText, why: whyText, business_or_personal: business_or_personal ?? "business" },
    });
    return NextResponse.json(
      {
        mode: "mock",
        message: "Mock mode: answer accepted but not persisted.",
        ai,
      },
      { status: 202 }
    );
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  // Token scoping: the transaction must belong to the client owning this token.
  const { data: client } = await supabase.from("clients").select("id, organisation_id").eq("secure_link_token", token).single();
  if (!client) return NextResponse.json({ error: "invalid link" }, { status: 403 });

  const { data: txn } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transaction_id)
    .eq("client_id", client.id)
    .single();
  if (!txn) return NextResponse.json({ error: "transaction not found for this client" }, { status: 404 });

  const { error: ansErr } = await supabase.from("transaction_answers").insert({
    transaction_id,
    who_answer: whoText,
    what_answer: whatText,
    why_answer: whyText,
    business_or_personal: business_or_personal ?? "business",
    receipt_path: receipt_path ?? null,
    voice_note_path: voice_note_path ?? null,
    voice_transcript: voice_transcript ?? null,
  });
  if (ansErr) return NextResponse.json({ error: ansErr.message }, { status: 500 });

  const memoryMatch = await lookupOrgMemory(supabase, client.organisation_id, txn.merchant ?? "");
  const ai = await categoriseTransaction({
    merchant: txn.merchant,
    description: txn.description,
    amount: Number(txn.amount),
    date: txn.date,
    answer: { who: whoText, what: whatText, why: whyText, business_or_personal: business_or_personal ?? "business" },
    memoryMatch,
  });

  await supabase
    .from("transactions")
    .update({
      status: "answered",
      answered_at: new Date().toISOString(),
      ai_suggested_category: ai.suggested_category,
      ai_confidence: ai.confidence,
      gst_claimable: ai.gst_claimable,
    })
    .eq("id", transaction_id);

  // Memory rule: learn this merchant for the organisation (skip if this
  // result already came from memory — nothing new to learn).
  if (ai.confidence >= 0.7 && txn.merchant && !memoryMatch) {
    await supabase.from("ai_memory").upsert(
      {
        organisation_id: client.organisation_id,
        merchant_pattern: txn.merchant.toLowerCase(),
        learned_category: ai.suggested_category,
        gst_claimable: ai.gst_claimable,
        confidence: ai.confidence,
        source: "client_answer",
      },
      { onConflict: "organisation_id,merchant_pattern" }
    );
  }

  await supabase.from("audit_logs").insert({
    organisation_id: client.organisation_id,
    actor: `client_token:${token.slice(0, 8)}…`,
    action: "answer_submitted",
    entity: `transaction:${transaction_id}`,
    detail: { business_or_personal, has_receipt: !!receipt_path },
  });

  return NextResponse.json({ ok: true, ai });
}
