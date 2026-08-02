import { NextRequest, NextResponse } from "next/server";
import { requireUser, isAuthFailure, canManageTeam } from "@/lib/serverAuth";
import { cancelSubscriptionAtPeriodEnd, hasStripeConfig } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** POST — cancel the org's subscription at the end of the current billing period. */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json({ mode: "mock", message: "Demo mode — nothing to cancel." }, { status: 202 });
  }
  if (!canManageTeam(auth.profile.role)) {
    return NextResponse.json({ error: "Only owners and admins can manage billing." }, { status: 403 });
  }

  const { data: account } = await auth.supabase
    .from("billing_accounts")
    .select("*")
    .eq("organisation_id", auth.profile.organisation_id)
    .maybeSingle();
  if (!account?.stripe_subscription_id || !hasStripeConfig()) {
    return NextResponse.json({ error: "No active subscription to cancel." }, { status: 400 });
  }

  try {
    await cancelSubscriptionAtPeriodEnd(account.stripe_subscription_id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  await auth.supabase
    .from("billing_accounts")
    .update({ cancel_at_period_end: true })
    .eq("organisation_id", auth.profile.organisation_id);

  await auth.supabase.from("audit_logs").insert({
    organisation_id: auth.profile.organisation_id,
    actor: auth.profile.id,
    action: "billing_cancel_scheduled",
    entity: `organisation:${auth.profile.organisation_id}`,
  });

  return NextResponse.json({ ok: true });
}
