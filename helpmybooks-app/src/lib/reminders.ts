import { EscalationStage } from "./types";
import { sendEmail, sendSms, hasEmailProvider, hasSmsProvider } from "./delivery";

/**
 * Reminder system foundation.
 * Escalation ladder: none -> first_reminder -> second_reminder -> final_reminder.
 * Sending is a no-op unless the relevant provider keys are configured;
 * the structure is production-ready — just add keys.
 * Actual delivery (Resend/Twilio calls) lives in ./delivery — this module
 * only owns the escalation ladder and reminder copy.
 */

export { hasEmailProvider, hasSmsProvider };

export const ESCALATION_ORDER: EscalationStage[] = [
  "none",
  "first_reminder",
  "second_reminder",
  "final_reminder",
];

export function nextEscalationStage(current: EscalationStage): EscalationStage {
  const i = ESCALATION_ORDER.indexOf(current);
  return ESCALATION_ORDER[Math.min(i + 1, ESCALATION_ORDER.length - 1)];
}

export function reminderCopy(stage: EscalationStage, clientName: string, count: number, link: string) {
  const base = `Hi ${clientName}, you have ${count} quick transaction question${count === 1 ? "" : "s"} from your bookkeeper. Answer in under a minute: ${link}`;
  switch (stage) {
    case "first_reminder":
      return { subject: "Quick question about a transaction", body: base };
    case "second_reminder":
      return { subject: "Reminder: transaction questions waiting", body: `Just a nudge — ${base}` };
    case "final_reminder":
      return {
        subject: "Final reminder: answers needed to finish your books",
        body: `Final reminder — your books can't be finalised until these are answered. ${base}`,
      };
    default:
      return { subject: "Transaction question", body: base };
  }
}

/** Thin adapters over ./delivery that shape the result for the escalation-ladder callers. */
export async function sendEmailReminder(to: string, subject: string, body: string) {
  const r = await sendEmail({ to, subject, body });
  return { sent: r.status === "sent", channel: "email" as const, reason: r.detail ?? null };
}

export async function sendSmsReminder(to: string, body: string) {
  const r = await sendSms({ to, body });
  return { sent: r.status === "sent", channel: "sms" as const, reason: r.detail ?? null };
}
