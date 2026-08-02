import { NextResponse } from "next/server";
import { createServiceSupabaseClient, getAuthMode } from "@/lib/supabaseClient";
import {
  nextEscalationStage,
  reminderCopy,
  sendEmailReminder,
  sendSmsReminder,
} from "@/lib/reminders";
import { EscalationStage } from "@/lib/types";

export const dynamic = "force-dynamic";

const STAGE_AFTER_DAYS: Record<Exclude<EscalationStage, "none">, number> = {
  first_reminder: 2,
  second_reminder: 4,
  final_reminder: 7,
};

/**
 * Escalation runner. Call from a Vercel cron (vercel.json) or manually.
 * For each waiting_client transaction, if enough days have passed since the
 * question was sent, bump the escalation stage and notify the client.
 */
export async function POST() {
  if (getAuthMode() === "mock") {
    return NextResponse.json(
      { mode: "mock", message: "Mock mode: reminder run simulated, nothing sent or persisted." },
      { status: 202 }
    );
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: waiting, error } = await supabase
    .from("transactions")
    .select("*, clients(id, name, email, phone, secure_link_token)")
    .eq("status", "waiting_client");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const results: unknown[] = [];

  for (const txn of waiting ?? []) {
    if (!txn.question_sent_at || txn.escalation_stage === "final_reminder") continue;
    const daysSince = (now - new Date(txn.question_sent_at).getTime()) / 86400000;
    const next = nextEscalationStage(txn.escalation_stage as EscalationStage) as Exclude<EscalationStage, "none">;
    if (daysSince < STAGE_AFTER_DAYS[next]) continue;

    const client = txn.clients;
    const link = `${process.env.NEXT_PUBLIC_APP_URL}/client/${client.secure_link_token}`;
    const copy = reminderCopy(next, client.name, 1, link);

    const emailResult = client.email ? await sendEmailReminder(client.email, copy.subject, copy.body) : null;
    const smsResult = next === "final_reminder" && client.phone ? await sendSmsReminder(client.phone, copy.body) : null;

    await supabase.from("transactions").update({ escalation_stage: next }).eq("id", txn.id);
    for (const r of [emailResult, smsResult]) {
      if (!r) continue;
      await supabase.from("reminders").insert({
        client_id: client.id,
        transaction_id: txn.id,
        channel: r.channel,
        stage: next,
        sent: r.sent,
        failure_reason: r.reason,
      });
    }
    results.push({ transaction_id: txn.id, stage: next, email: emailResult?.sent ?? false, sms: smsResult?.sent ?? false });
  }

  return NextResponse.json({ ok: true, escalated: results.length, results });
}
