import { NextRequest, NextResponse } from "next/server";
import { getAuthMode } from "@/lib/supabaseClient";
import { requireUser, isAuthFailure, isStaff } from "@/lib/serverAuth";
import { createAndSendQuestion } from "@/lib/questions";

export const dynamic = "force-dynamic";

/** Accepts either { transaction_id } for a single send or { transaction_ids: [...] } for bulk. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const channel = body?.channel ?? "link";
  const ids: string[] = Array.isArray(body?.transaction_ids)
    ? body.transaction_ids
    : body?.transaction_id
      ? [body.transaction_id]
      : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "transaction_id or transaction_ids required" }, { status: 400 });
  }

  if (getAuthMode() === "mock") {
    return NextResponse.json(
      {
        mode: "mock",
        message: "Mock mode: question(s) queued but not persisted. In real mode this marks the transaction(s) waiting_client and notifies the client.",
        transaction_ids: ids,
        channel,
      },
      { status: 202 }
    );
  }

  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json(
      { mode: "mock", message: "Mock mode: question(s) queued but not persisted.", transaction_ids: ids, channel },
      { status: 202 }
    );
  }
  if (!isStaff(auth.profile.role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const results = await Promise.all(
    ids.map((id) => createAndSendQuestion(auth.supabase, id, auth.profile.organisation_id, channel, auth.profile.id))
  );

  if (ids.length === 1) {
    const r = results[0];
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404 });
    return NextResponse.json({ ok: true, question: r.question, link: r.link, dispatch: r.dispatch });
  }

  return NextResponse.json({ ok: true, results });
}
