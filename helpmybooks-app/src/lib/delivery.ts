/**
 * Outbound delivery engine — Resend (email) + Twilio (SMS).
 * Ported from v3.3 and adapted to the v1.0 message_jobs model.
 *
 * Behaviour without provider keys: returns { status: "skipped" } so the
 * message_jobs processor records the outcome instead of erroring — same
 * philosophy as mock mode elsewhere.
 */

export interface DeliveryResult {
  status: "sent" | "skipped" | "failed";
  detail?: string;
}

export function hasEmailProvider(): boolean {
  return !!process.env.RESEND_API_KEY?.trim();
}

export function hasSmsProvider(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
    process.env.TWILIO_AUTH_TOKEN?.trim() &&
    process.env.TWILIO_PHONE_NUMBER?.trim()
  );
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<DeliveryResult> {
  if (!hasEmailProvider()) return { status: "skipped", detail: "RESEND_API_KEY not configured" };

  const from = process.env.RESEND_FROM?.trim() || "notifications@helpmybooks.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://helpmybooks.com";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.body,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <img src="${appUrl}/helpmybooks-logo.png" alt="HelpMyBooks" style="width:180px;margin-bottom:24px" />
        <div style="background:#f7faff;border-radius:12px;padding:20px;white-space:pre-line;line-height:1.6">
          ${opts.body.replace(/\n/g, "<br>")}
        </div>
        <p style="color:#657188;font-size:12px;margin-top:24px">
          Sent via HelpMyBooks.com — reply to this email if you have questions.
        </p>
      </div>`,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return { status: "failed", detail: `Resend ${res.status}: ${err.slice(0, 300)}` };
  }
  return { status: "sent" };
}

export async function sendSms(opts: { to: string; body: string }): Promise<DeliveryResult> {
  if (!hasSmsProvider()) return { status: "skipped", detail: "Twilio not configured" };

  const sid = process.env.TWILIO_ACCOUNT_SID!.trim();
  const token = process.env.TWILIO_AUTH_TOKEN!.trim();
  const from = process.env.TWILIO_PHONE_NUMBER!.trim();
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: opts.to, From: from, Body: opts.body }).toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    return { status: "failed", detail: `Twilio ${res.status}: ${err.slice(0, 300)}` };
  }
  return { status: "sent" };
}

/** Render a message_jobs template + payload into subject/body */
export function renderTemplate(
  template: string,
  payload: Record<string, unknown>
): { subject: string; body: string } {
  const p = payload as Record<string, string>;
  switch (template) {
    case "team_invite":
      return {
        subject: "You've been invited to a practice on HelpMyBooks",
        body: `${p.invited_by ?? "A colleague"} has invited you to join their practice on HelpMyBooks as ${p.role ?? "a team member"}.\n\nAccept your invitation:\n${p.invite_url}\n\nThis link expires in 7 days.`,
      };
    case "question_sent":
      return {
        subject: "Quick question about a transaction",
        body: `Hi ${p.client_name ?? "there"}, your bookkeeper has a quick question about ${p.amount ?? "a transaction"} at ${p.merchant ?? "a merchant"}.\n\nAnswer in under a minute:\n${p.link}`,
      };
    case "reminder":
      return {
        subject: p.subject ?? "Reminder: transaction questions waiting",
        body: p.body ?? `Hi ${p.client_name ?? "there"}, you have transaction questions waiting: ${p.link}`,
      };
    default:
      return {
        subject: p.subject ?? "Message from HelpMyBooks",
        body: p.body ?? "",
      };
  }
}
