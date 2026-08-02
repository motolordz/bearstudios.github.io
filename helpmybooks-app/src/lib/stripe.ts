/**
 * Minimal Stripe REST client (no SDK dependency, consistent with the rest of
 * the codebase's fetch-based provider integrations). Billing plans map to
 * Stripe Price IDs via env vars — STRIPE_PRICE_ID is kept as the legacy
 * alias for the "starter" plan.
 */

export type BillingPlan = "starter" | "growth" | "practice";

export function hasStripeConfig(): boolean {
  return !!process.env.STRIPE_SECRET_KEY?.trim();
}

export function priceIdForPlan(plan: BillingPlan): string | null {
  const map: Record<BillingPlan, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER?.trim() || process.env.STRIPE_PRICE_ID?.trim(),
    growth: process.env.STRIPE_PRICE_GROWTH?.trim(),
    practice: process.env.STRIPE_PRICE_PRACTICE?.trim(),
  };
  return map[plan] ?? null;
}

async function stripeRequest(path: string, init: RequestInit & { body?: URLSearchParams } = {}) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...init.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Stripe request failed: ${res.status}`);
  }
  return data;
}

export function createCheckoutSession(params: {
  priceId: string;
  organisationId: string;
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}) {
  const body = new URLSearchParams({
    mode: "subscription",
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    "line_items[0][price]": params.priceId,
    "line_items[0][quantity]": "1",
    client_reference_id: params.organisationId,
    "metadata[organisation_id]": params.organisationId,
  });
  if (params.customerId) body.set("customer", params.customerId);
  return stripeRequest("checkout/sessions", { method: "POST", body }) as Promise<{ url: string }>;
}

export function cancelSubscriptionAtPeriodEnd(subscriptionId: string) {
  const body = new URLSearchParams({ cancel_at_period_end: "true" });
  return stripeRequest(`subscriptions/${subscriptionId}`, { method: "POST", body });
}

export function resumeSubscription(subscriptionId: string) {
  const body = new URLSearchParams({ cancel_at_period_end: "false" });
  return stripeRequest(`subscriptions/${subscriptionId}`, { method: "POST", body });
}

/** Swap the subscription's single line item to a different price (upgrade/downgrade). */
export async function changeSubscriptionPrice(subscriptionId: string, newPriceId: string) {
  const sub = await stripeRequest(`subscriptions/${subscriptionId}`);
  const itemId = sub?.items?.data?.[0]?.id;
  if (!itemId) throw new Error("Could not find the subscription's line item to change.");
  const body = new URLSearchParams({
    "items[0][id]": itemId,
    "items[0][price]": newPriceId,
    proration_behavior: "create_prorations",
  });
  return stripeRequest(`subscriptions/${subscriptionId}`, { method: "POST", body });
}

export function listInvoices(customerId: string, limit = 12) {
  const params = new URLSearchParams({ customer: customerId, limit: String(limit) });
  return stripeRequest(`invoices?${params.toString()}`) as Promise<{
    data: { id: string; status: string; total: number; currency: string; created: number; hosted_invoice_url: string | null }[];
  }>;
}
