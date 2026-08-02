import { NextRequest, NextResponse } from "next/server";
import { requireUser, isAuthFailure, canManageTeam } from "@/lib/serverAuth";
import { hasStripeConfig, priceIdForPlan, createCheckoutSession, changeSubscriptionPrice, type BillingPlan } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const PLANS: BillingPlan[] = ["starter", "growth", "practice"];

/**
 * POST { plan } — start a new subscription via Stripe Checkout, or (if the
 * org already has an active subscription) change its plan directly.
 * Owner/admin only. Ported from v3.3 (firms → organisations).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const plan: BillingPlan = PLANS.includes(body?.plan) ? body.plan : "starter";

  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json(
      { mode: "mock", message: "Mock mode: configure Supabase + Stripe keys to create a live checkout session." },
      { status: 202 }
    );
  }
  if (!canManageTeam(auth.profile.role)) {
    return NextResponse.json({ error: "Only owners and admins can manage billing." }, { status: 403 });
  }

  const orgId = auth.profile.organisation_id;
  let { data: account } = await auth.supabase.from("billing_accounts").select("*").eq("organisation_id", orgId).maybeSingle();
  if (!account) {
    const { data: created, error } = await auth.supabase.from("billing_accounts").insert({ organisation_id: orgId }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    account = created;
  }

  const priceId = priceIdForPlan(plan);
  if (!hasStripeConfig() || !priceId) {
    return NextResponse.json(
      { mode: "no-stripe", message: `Add STRIPE_SECRET_KEY and a price ID for the "${plan}" plan to enable billing.` },
      { status: 202 }
    );
  }

  try {
    // Already an active paid subscription — change the plan in place instead of a new checkout.
    if (account?.stripe_subscription_id && account.status === "active") {
      await changeSubscriptionPrice(account.stripe_subscription_id, priceId);
      await auth.supabase.from("billing_accounts").update({ plan }).eq("organisation_id", orgId);
      return NextResponse.json({ ok: true, changed: true, plan });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const session = await createCheckoutSession({
      priceId,
      organisationId: orgId,
      customerId: account?.stripe_customer_id,
      successUrl: `${appUrl}/settings?billing=success`,
      cancelUrl: `${appUrl}/settings?billing=cancelled`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
