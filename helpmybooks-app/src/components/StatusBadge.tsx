import { TransactionStatus } from "@/lib/types";

const STYLES: Record<TransactionStatus, { label: string; cls: string }> = {
  unanswered: { label: "Unanswered", cls: "bg-ink/5 text-ink/70 border-ink/15" },
  waiting_client: { label: "Waiting on client", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  answered: { label: "Answered", cls: "bg-teal-light text-teal-dark border-teal/25" },
  reviewed: { label: "Reviewed", cls: "bg-blue-50 text-blue-800 border-blue-200" },
  reconciled: { label: "Reconciled", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
};

export default function StatusBadge({ status }: { status: TransactionStatus }) {
  const s = STYLES[status] ?? STYLES.unanswered;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}
