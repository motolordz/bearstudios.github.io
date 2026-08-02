import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

/** Verify Stripe webhook signature without the SDK (HMAC-SHA256, 5-min tolerance). */
function verifyStripeSignature(payload: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("="))) as Record<string, string>;
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(parts.v1, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  if (!verifyStripeSignature(payload, signature, secret)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  const event = JSON.parse(payload) as {
    type: string;
    data?: { object?: Record<string, any> };
  };
  const service = createServiceSupabaseClient();
  if (!service) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });

  const obj = event.data?.object ?? {};

  if (event.type === "checkout.session.completed" && obj.metadata?.organisation_id) {
    await service
      .from("billing_accounts")
      .update({
        stripe_customer_id: obj.customer,
        stripe_subscription_id: obj.subscription,
        plan: "starter",
        status: "active",
      })
      .eq("organisation_id", obj.metadata.organisation_id);
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const update: Record<string, unknown> = {
      stripe_subscription_id: obj.id,
      status: obj.status || "cancelled",
    };
    if (obj.current_period_end) {
      update.current_period_end = new Date(Number(obj.current_period_end) * 1000).toISOString();
    }
    if (event.type === "customer.subscription.deleted" || obj.status === "canceled") {
      update.plan = "cancelled";
      update.status = "cancelled";
    }
    await service.from("billing_accounts").update(update).eq("stripe_customer_id", obj.customer);
  }

  return NextResponse.json({ received: true });
}
