import { NextRequest, NextResponse } from "next/server";
import { requireUser, isAuthFailure, canManageTeam } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

/**
 * POST — create a Stripe Checkout session for the caller's organisation.
 * Owner/admin only. Ported from v3.3 (firms → organisations).
 */
export async function POST(req: NextRequest) {
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
  let { data: account } = await auth.supabase
    .from("billing_accounts")
    .select("*")
    .eq("organisation_id", orgId)
    .maybeSingle();
  if (!account) {
    const { data: created, error } = await auth.supabase
      .from("billing_accounts")
      .insert({ organisation_id: orgId })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    account = created;
  }

  if (!process.env.STRIPE_SECRET_KEY?.trim() || !process.env.STRIPE_PRICE_ID?.trim()) {
    return NextResponse.json(
      { mode: "no-stripe", message: "Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID to enable billing." },
      { status: 202 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const params = new URLSearchParams({
    mode: "subscription",
    success_url: `${appUrl}/settings?billing=success`,
    cancel_url: `${appUrl}/settings?billing=cancelled`,
    "line_items[0][price]": process.env.STRIPE_PRICE_ID,
    "line_items[0][quantity]": "1",
    client_reference_id: orgId,
    "metadata[organisation_id]": orgId,
  });
  if (account?.stripe_customer_id) params.set("customer", account.stripe_customer_id);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  if (!response.ok) {
    return NextResponse.json({ error: "Stripe checkout session creation failed" }, { status: 502 });
  }
  const session = (await response.json()) as { url: string };
  return NextResponse.json({ url: session.url });
}
