import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailReminder, sendSmsReminder, reminderCopy } from "./reminders";

export interface SendQuestionResult {
  transaction_id: string;
  ok: boolean;
  question?: string;
  link?: string;
  dispatch?: { sent: boolean; channel: string; reason: string | null };
  error?: string;
}

/**
 * Marks a transaction waiting_client, records the question, and notifies the
 * client. Shared by the staff "Ask client" action (/api/questions/send) and
 * the Xero sync auto-clarification path (low-confidence imports).
 */
export async function createAndSendQuestion(
  supabase: SupabaseClient,
  transactionId: string,
  organisationId: string,
  channel: "link" | "email" | "sms",
  actor: string
): Promise<SendQuestionResult> {
  const { data: txn, error: txnErr } = await supabase
    .from("transactions")
    .select("*, clients(name, email, phone, secure_link_token)")
    .eq("id", transactionId)
    .eq("organisation_id", organisationId)
    .single();
  if (txnErr || !txn) return { transaction_id: transactionId, ok: false, error: txnErr?.message ?? "not found" };

  const question = `On ${txn.date}, $${Math.abs(txn.amount).toFixed(2)} at "${txn.merchant}" — who was this paid to/from, what was it for, and was it business or personal?`;

  const { error: qErr } = await supabase.from("transaction_questions").insert({
    transaction_id: transactionId,
    question_text: question,
    channel,
  });
  if (qErr) return { transaction_id: transactionId, ok: false, error: qErr.message };

  await supabase
    .from("transactions")
    .update({ status: "waiting_client", question_sent_at: new Date().toISOString() })
    .eq("id", transactionId);

  const client = txn.clients;
  const link = `${process.env.NEXT_PUBLIC_APP_URL}/client/${client?.secure_link_token}`;
  const copy = reminderCopy("first_reminder", client?.name ?? "there", 1, link);

  const dispatch =
    channel === "sms" && client?.phone
      ? await sendSmsReminder(client.phone, copy.body)
      : channel === "email" && client?.email
        ? await sendEmailReminder(client.email, copy.subject, copy.body)
        : { sent: false, channel, reason: "link-only (no notification requested)" };

  await supabase.from("audit_logs").insert({
    organisation_id: organisationId,
    actor,
    action: "question_sent",
    entity: `transaction:${transactionId}`,
    detail: { channel, dispatched: dispatch.sent, reason: dispatch.reason },
  });

  return { transaction_id: transactionId, ok: true, question, link, dispatch };
}
