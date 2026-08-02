import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient, getAuthMode } from "@/lib/supabaseClient";
import { mockClients, mockTransactions } from "@/lib/mockData";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token;

  if (!rateLimit(`client-token:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests, please try again shortly." }, { status: 429 });
  }

  if (getAuthMode() === "mock") {
    const client = mockClients.find((c) => c.secure_link_token === token);
    if (!client) return NextResponse.json({ error: "invalid link" }, { status: 404 });
    const open = mockTransactions.filter(
      (t) => t.client_id === client.id && (t.status === "unanswered" || t.status === "waiting_client")
    );
    return NextResponse.json({ mode: "mock", client: { name: client.name }, transactions: open });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("secure_link_token", token)
    .single();
  if (!client) return NextResponse.json({ error: "invalid link" }, { status: 404 });

  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("client_id", client.id)
    .in("status", ["unanswered", "waiting_client"])
    .order("date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ mode: "real", client: { name: client.name }, transactions });
}
