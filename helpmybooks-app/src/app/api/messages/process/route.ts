import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient, getAuthMode } from "@/lib/supabaseClient";
import { sendEmail, sendSms, renderTemplate } from "@/lib/delivery";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 3;
const BATCH = 25;

/**
 * Processes queued message_jobs. Triggered by Vercel cron (see vercel.json)
 * or manually. Protected by CRON_SECRET when set.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 });
    }
  }

  if (getAuthMode() === "mock") {
    return NextResponse.json(
      { mode: "mock", message: "Mock mode: no queue to process.", processed: 0 },
      { status: 202 }
    );
  }
  const supabase = createServiceSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: jobs, error } = await supabase
    .from("message_jobs")
    .select("*")
    .eq("status", "queued")
    .lte("scheduled_for", new Date().toISOString())
    .lt("attempts", MAX_ATTEMPTS)
    .order("scheduled_for")
    .limit(BATCH);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of jobs ?? []) {
    const payload = (job.payload ?? {}) as Record<string, unknown>;
    const to = String(payload.to ?? "");
    const { subject, body } = renderTemplate(job.template, payload);

    let result;
    if (!to) {
      result = { status: "failed" as const, detail: "no recipient in payload" };
    } else if (job.channel === "email") {
      result = await sendEmail({ to, subject, body });
    } else {
      result = await sendSms({ to, body });
    }

    const update: Record<string, unknown> = {
      attempts: job.attempts + 1,
      last_error: result.status === "sent" ? null : result.detail ?? null,
    };
    if (result.status === "sent") {
      update.status = "sent";
      update.sent_at = new Date().toISOString();
      sent++;
    } else if (result.status === "skipped") {
      update.status = "skipped";
      skipped++;
    } else {
      // keep queued for retry until MAX_ATTEMPTS, then mark failed
      update.status = job.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "queued";
      failed++;
    }
    await supabase.from("message_jobs").update(update).eq("id", job.id);
  }

  return NextResponse.json({ mode: "real", processed: (jobs ?? []).length, sent, skipped, failed });
}
