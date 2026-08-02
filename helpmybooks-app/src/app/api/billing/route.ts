import { NextRequest, NextResponse } from "next/server";
import { requireUser, isAuthFailure } from "@/lib/serverAuth";
import { hasStripeConfig, listInvoices } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const MOCK_ACCOUNT = {
  plan: "trial",
  status: "trialing",
  trial_ends_at: new Date(Date.now() + 10 * 86400000).toISOString(),
  current_period_end: null,
  cancel_at_period_end: false,
};

/** GET — the caller's org billing status + recent Stripe invoices, if any. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json({ mode: "mock", account: MOCK_ACCOUNT, invoices: [] });
  }

  const { data: account } = await auth.supabase
    .from("billing_accounts")
    .select("*")
    .eq("organisation_id", auth.profile.organisation_id)
    .maybeSingle();

  let invoices: unknown[] = [];
  if (account?.stripe_customer_id && hasStripeConfig()) {
    try {
      const result = await listInvoices(account.stripe_customer_id);
      invoices = result.data.map((inv) => ({
        id: inv.id,
        status: inv.status,
        total: inv.total / 100,
        currency: inv.currency.toUpperCase(),
        created: new Date(inv.created * 1000).toISOString(),
        url: inv.hosted_invoice_url,
      }));
    } catch {
      invoices = []; // non-fatal — the billing status is still useful without the invoice list
    }
  }

  return NextResponse.json({ mode: "real", account: account ?? null, invoices });
}
