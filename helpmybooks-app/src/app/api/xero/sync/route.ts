import { NextRequest, NextResponse } from "next/server";
import { getAuthMode } from "@/lib/supabaseClient";
import { requireUser, isAuthFailure, isStaff } from "@/lib/serverAuth";
import { getValidAccessToken, fetchBankTransactions } from "@/lib/xero";
import { categoriseTransaction, lookupOrgMemory } from "@/lib/ai";
import { createAndSendQuestion } from "@/lib/questions";

export const dynamic = "force-dynamic";

interface XeroBankTransaction {
  BankTransactionID: string;
  Type: "SPEND" | "RECEIVE" | string;
  Total: number;
  DateString?: string;
  Date?: string;
  Reference?: string;
  Contact?: { ContactID?: string; Name?: string };
  LineItems?: { Description?: string }[];
}

function parseXeroDate(txn: XeroBankTransaction): string {
  if (txn.DateString) return txn.DateString.slice(0, 10);
  const match = txn.Date?.match(/\/Date\((\d+)/);
  if (match) return new Date(Number(match[1])).toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

/**
 * Pulls bank transactions from Xero into the reconciliation queue. Matches
 * each transaction's Xero contact to an existing client (by xero_contact_id,
 * then by name); creates a new client record when there's no match so the
 * transaction always has somewhere to land. Low-confidence imports are
 * automatically sent to the client as a clarification question.
 */
export async function POST(req: NextRequest) {
  if (getAuthMode() === "mock") {
    return NextResponse.json(
      { mode: "mock", message: "Mock mode: connect Supabase and Xero to sync real bank transactions." },
      { status: 202 }
    );
  }
  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json({ mode: "mock", message: "Demo mode — nothing to sync." }, { status: 202 });
  }
  if (!isStaff(auth.profile.role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const supabase = auth.supabase;
  const orgId = auth.profile.organisation_id;

  const conn = await getValidAccessToken(supabase, orgId);
  if (!conn) {
    return NextResponse.json(
      { mode: "no-xero", message: "No Xero connection for this organisation yet. Connect Xero from the dashboard first." },
      { status: 202 }
    );
  }

  let xeroTxns: XeroBankTransaction[];
  try {
    xeroTxns = await fetchBankTransactions(conn.accessToken, conn.tenantId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  let imported = 0;
  let skippedDuplicate = 0;
  let clientsCreated = 0;
  let autoQuestioned = 0;

  for (const txn of xeroTxns) {
    if (!txn.BankTransactionID) continue;

    const { data: existing } = await supabase
      .from("transactions")
      .select("id")
      .eq("organisation_id", orgId)
      .eq("xero_bank_transaction_id", txn.BankTransactionID)
      .maybeSingle();
    if (existing) {
      skippedDuplicate++;
      continue;
    }

    const contactId = txn.Contact?.ContactID ?? null;
    const contactName = txn.Contact?.Name?.trim() || "Xero import";

    let clientId: string | null = null;
    if (contactId) {
      const { data } = await supabase.from("clients").select("id").eq("organisation_id", orgId).eq("xero_contact_id", contactId).maybeSingle();
      clientId = data?.id ?? null;
    }
    if (!clientId) {
      const { data } = await supabase
        .from("clients")
        .select("id")
        .eq("organisation_id", orgId)
        .ilike("name", contactName)
        .maybeSingle();
      clientId = data?.id ?? null;
    }
    if (!clientId) {
      const { data: created, error: createErr } = await supabase
        .from("clients")
        .insert({ organisation_id: orgId, name: contactName, xero_contact_id: contactId })
        .select("id")
        .single();
      if (createErr || !created) continue; // can't place this transaction anywhere — skip it
      clientId = created.id;
      clientsCreated++;
    }

    const amount = txn.Type === "SPEND" ? -Math.abs(Number(txn.Total)) : Math.abs(Number(txn.Total));
    const description = txn.Reference || txn.LineItems?.[0]?.Description || "";

    const memoryMatch = await lookupOrgMemory(supabase, orgId, contactName);
    const ai = await categoriseTransaction({
      merchant: contactName,
      description,
      amount,
      date: parseXeroDate(txn),
      memoryMatch,
    });

    const { data: inserted, error: insertErr } = await supabase
      .from("transactions")
      .insert({
        organisation_id: orgId,
        client_id: clientId,
        date: parseXeroDate(txn),
        amount,
        merchant: contactName,
        description,
        source: "xero",
        xero_bank_transaction_id: txn.BankTransactionID,
        synced_at: new Date().toISOString(),
        ai_suggested_category: ai.suggested_category,
        ai_confidence: ai.confidence,
        gst_claimable: ai.gst_claimable,
      })
      .select("id")
      .single();
    if (insertErr || !inserted) continue;
    imported++;

    // Phase 4: auto-create a clarification when the AI isn't confident.
    if (ai.needs_more_info || ai.confidence < 0.7) {
      const { data: clientRow } = await supabase.from("clients").select("email").eq("id", clientId).maybeSingle();
      const channel = clientRow?.email ? "email" : "link";
      const result = await createAndSendQuestion(supabase, inserted.id, orgId, channel, "xero_sync");
      if (result.ok) autoQuestioned++;
    }
  }

  await supabase.from("audit_logs").insert({
    organisation_id: orgId,
    actor: auth.profile.id,
    action: "xero_sync_run",
    entity: `organisation:${orgId}`,
    detail: { imported, skippedDuplicate, clientsCreated, autoQuestioned },
  });

  return NextResponse.json({ ok: true, imported, skippedDuplicate, clientsCreated, autoQuestioned });
}
