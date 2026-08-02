import { NextRequest, NextResponse } from "next/server";
import { categoriseTransaction, hasAiKey } from "@/lib/ai";
import { requireUser, isAuthFailure, isStaff } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

/** Staff-only: this calls a paid AI model, so it must not be publicly reachable. */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "real" && !isStaff(auth.profile.role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.merchant && !body?.description) {
    return NextResponse.json({ error: "merchant or description required" }, { status: 400 });
  }
  const result = await categoriseTransaction({
    merchant: body.merchant ?? "",
    description: body.description ?? "",
    amount: Number(body.amount ?? 0),
    date: body.date ?? new Date().toISOString().slice(0, 10),
    answer: body.answer,
  });
  return NextResponse.json({
    mode: hasAiKey() ? "ai" : "local-patterns",
    result,
  });
}
