"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { createBrowserSupabaseClient } from "@/lib/supabaseClient";
import { apiFetch } from "@/lib/apiClient";
import StatusBadge from "@/components/StatusBadge";
import { ClientRecord, Transaction, TransactionStatus } from "@/lib/types";

type Filter = { client: string; status: string; from: string; to: string };

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [mode, setMode] = useState<"mock" | "real">("mock");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>({ client: "all", status: "all", from: "", to: "" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTxn, setNewTxn] = useState({ client_id: "", date: "", amount: "", merchant: "", description: "" });
  const [whoAmI, setWhoAmI] = useState({ orgName: "", fullName: "" });

  function load() {
    setLoading(true);
    return apiFetch("/api/transactions")
      .then((r) => r.json())
      .then((d) => {
        setTransactions(d.transactions ?? []);
        setClients(d.clients ?? []);
        setMode(d.mode ?? "mock");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    apiFetch("/api/org")
      .then((r) => r.json())
      .then((d) => setWhoAmI({ orgName: d.organisation?.name ?? "", fullName: d.full_name ?? "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (filter.client !== "all" && t.client_id !== filter.client) return false;
      if (filter.status !== "all" && t.status !== filter.status) return false;
      if (filter.from && t.date < filter.from) return false;
      if (filter.to && t.date > filter.to) return false;
      return true;
    });
  }, [transactions, filter]);

  const stats = useMemo(() => {
    const unanswered = transactions.filter((t) => t.status === "unanswered").length;
    const answered = transactions.filter((t) => t.status === "answered").length;
    const overdue = transactions.filter(
      (t) => t.status === "waiting_client" && (t.escalation_stage === "second_reminder" || t.escalation_stage === "final_reminder")
    ).length;
    return { clients: clients.length, unanswered, answered, overdue };
  }, [transactions, clients]);

  const activity = useMemo(
    () =>
      transactions
        .filter((t) => t.answered_at || t.question_sent_at)
        .sort((a, b) => (b.answered_at ?? b.question_sent_at ?? "").localeCompare(a.answered_at ?? a.question_sent_at ?? ""))
        .slice(0, 5),
    [transactions]
  );

  const MINUTES_SAVED_PER_ANSWER = 12; // vs. chasing by phone/email — indicative, not measured
  const HOURLY_RATE_AUD = 65;

  const metrics = useMemo(() => {
    const now = Date.now();
    const DAY = 86400000;

    const responseTimes = transactions
      .filter((t) => t.question_sent_at && t.answered_at)
      .map((t) => (new Date(t.answered_at!).getTime() - new Date(t.question_sent_at!).getTime()) / 3600000);
    const avgResponseHours = responseTimes.length
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null;

    const graded = transactions.filter((t) => t.final_category && t.ai_suggested_category);
    const aiAccuracy = graded.length
      ? graded.filter((t) => t.final_category === t.ai_suggested_category).length / graded.length
      : null;

    const answeredCount = transactions.filter((t) => t.answered_at).length;
    const savedMinutes = answeredCount * MINUTES_SAVED_PER_ANSWER;
    const savedAud = (savedMinutes / 60) * HOURLY_RATE_AUD;

    const completedThisWeek = transactions.filter(
      (t) => t.status === "reconciled" && t.answered_at && now - new Date(t.answered_at).getTime() < 7 * DAY
    ).length;
    const completedThisMonth = transactions.filter(
      (t) => t.status === "reconciled" && t.answered_at && now - new Date(t.answered_at).getTime() < 30 * DAY
    ).length;

    return { avgResponseHours, aiAccuracy, savedAud, completedThisWeek, completedThisMonth };
  }, [transactions]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function askClient(t: Transaction) {
    const res = await apiFetch("/api/questions/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction_id: t.id, channel: "email" }),
    });
    const d = await res.json();
    if (res.status === 202) {
      setTransactions((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: "waiting_client" } : x)));
      flash("Demo: question sent (not persisted — connect Supabase to save).");
    } else if (res.ok) {
      setTransactions((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: "waiting_client" } : x)));
      flash("Question sent to client.");
    } else {
      flash(d.error ?? "Something went wrong sending the question.");
    }
  }

  async function setStatus(t: Transaction, status: TransactionStatus) {
    const res = await apiFetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, status }),
    });
    if (res.ok || res.status === 202) {
      setTransactions((prev) => prev.map((x) => (x.id === t.id ? { ...x, status } : x)));
      flash(res.status === 202 ? `Demo: marked ${status} (not persisted).` : `Marked ${status}.`);
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((t) => t.id))));
  }

  async function bulkAskClient() {
    const ids = Array.from(selected);
    const res = await apiFetch("/api/questions/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction_ids: ids, channel: "email" }),
    });
    if (res.ok || res.status === 202) {
      setTransactions((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, status: "waiting_client" } : x)));
      flash(res.status === 202 ? `Demo: ${ids.length} question(s) sent (not persisted).` : `Sent ${ids.length} question(s) to clients.`);
      setSelected(new Set());
    }
  }

  async function bulkSetStatus(status: TransactionStatus) {
    const ids = Array.from(selected);
    const res = await apiFetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status }),
    });
    if (res.ok || res.status === 202) {
      setTransactions((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, status } : x)));
      flash(res.status === 202 ? `Demo: marked ${ids.length} as ${status} (not persisted).` : `Marked ${ids.length} as ${status}.`);
      setSelected(new Set());
    }
  }

  async function connectXero() {
    const res = await apiFetch("/api/xero/connect");
    const d = await res.json().catch(() => ({}));
    if (res.status === 202) {
      flash(d.message ?? "Xero is not configured yet.");
      return;
    }
    if (d.url) window.location.href = d.url;
    else flash(d.error ?? "Could not start the Xero connection.");
  }

  async function syncXero() {
    setSyncing(true);
    const res = await apiFetch("/api/xero/sync", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setSyncing(false);
    if (res.status === 202) {
      flash(d.message ?? "Xero sync unavailable in demo mode.");
      return;
    }
    if (res.ok) {
      flash(`Synced: ${d.imported} imported, ${d.skippedDuplicate} already had, ${d.autoQuestioned} auto-questioned.`);
      load();
    } else {
      flash(d.error ?? "Xero sync failed.");
    }
  }

  async function createTransaction() {
    if (!newTxn.client_id || !newTxn.date || !newTxn.amount || !newTxn.merchant) {
      flash("Client, date, amount and merchant are required.");
      return;
    }
    const res = await apiFetch("/api/transactions", {
      method: "POST",
      body: JSON.stringify({ ...newTxn, amount: Number(newTxn.amount) }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 202) {
      flash(d.error ?? "Failed to add transaction.");
      return;
    }
    flash(res.status === 202 ? "Demo mode — transaction not persisted." : "Transaction added.");
    setAdding(false);
    setNewTxn({ client_id: "", date: "", amount: "", merchant: "", description: "" });
    if (res.status !== 202) load();
  }

  const money = (n: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

  async function handleLogout() {
    const supabase = createBrowserSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-paper pb-16">
      <header className="border-b border-ink/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/"><Logo className="h-8" /></Link>
          <div className="flex items-center gap-3">
            {mode === "mock" && (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 border border-amber-200">
                Demo mode
              </span>
            )}
            <nav className="hidden items-center gap-4 text-sm font-medium sm:flex">
              <Link href="/clients" className="text-ink/70 hover:text-teal">Clients</Link>
              <Link href="/settings" className="text-ink/70 hover:text-teal">Settings</Link>
            </nav>
            <button onClick={connectXero} className="btn-secondary !px-4 !py-2 text-sm">Connect Xero</button>
            <button onClick={syncXero} disabled={syncing} className="btn-secondary !px-4 !py-2 text-sm">
              {syncing ? "Syncing…" : "Sync Xero"}
            </button>
            <button onClick={handleLogout} className="text-sm font-medium text-ink/70 hover:text-teal">
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-8">
        <h1 className="font-display text-3xl font-semibold">Reconciliation queue</h1>
        {(whoAmI.orgName || whoAmI.fullName) && (
          <p className="mt-1 text-ink/60">
            {[whoAmI.orgName, whoAmI.fullName && `signed in as ${whoAmI.fullName}`].filter(Boolean).join(" · ")}
          </p>
        )}

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="card"><p className="text-sm text-ink/60">Total clients</p><p className="font-display text-3xl">{stats.clients}</p></div>
          <div className="card"><p className="text-sm text-ink/60">Unanswered</p><p className="font-display text-3xl">{stats.unanswered}</p></div>
          <div className="card"><p className="text-sm text-ink/60">Answered — to review</p><p className="font-display text-3xl text-teal">{stats.answered}</p></div>
          <div className="card"><p className="text-sm text-ink/60">Overdue replies</p><p className="font-display text-3xl text-gum">{stats.overdue}</p></div>
        </div>

        {/* Insights */}
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="card">
            <p className="text-sm text-ink/60">Avg. response time</p>
            <p className="font-display text-2xl">
              {metrics.avgResponseHours == null
                ? "—"
                : metrics.avgResponseHours < 24
                  ? `${metrics.avgResponseHours.toFixed(1)} hrs`
                  : `${(metrics.avgResponseHours / 24).toFixed(1)} days`}
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-ink/60">AI accuracy</p>
            <p className="font-display text-2xl">
              {metrics.aiAccuracy == null ? "—" : `${Math.round(metrics.aiAccuracy * 100)}%`}
            </p>
            <p className="text-xs text-ink/50">of reviewed categories matched the AI suggestion</p>
          </div>
          <div className="card">
            <p className="text-sm text-ink/60">Estimated time saved</p>
            <p className="font-display text-2xl">{money(metrics.savedAud)}</p>
            <p className="text-xs text-ink/50">vs. chasing clients manually (indicative)</p>
          </div>
          <div className="card">
            <p className="text-sm text-ink/60">Reconciled</p>
            <p className="font-display text-2xl">{metrics.completedThisWeek} <span className="text-sm text-ink/50">this week</span></p>
            <p className="text-xs text-ink/50">{metrics.completedThisMonth} this month</p>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-6 flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">
            Client
            <select
              value={filter.client}
              onChange={(e) => setFilter({ ...filter, client: e.target.value })}
              className="mt-1 block rounded-lg border border-ink/15 bg-white px-3 py-2"
            >
              <option value="all">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">
            Status
            <select
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              className="mt-1 block rounded-lg border border-ink/15 bg-white px-3 py-2"
            >
              <option value="all">All statuses</option>
              {["unanswered", "waiting_client", "answered", "reviewed", "reconciled"].map((s) => (
                <option key={s} value={s}>{s.replace("_", " ")}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            From
            <input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} className="mt-1 block rounded-lg border border-ink/15 bg-white px-3 py-2" />
          </label>
          <label className="text-sm font-medium">
            To
            <input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} className="mt-1 block rounded-lg border border-ink/15 bg-white px-3 py-2" />
          </label>
          <button onClick={() => setAdding((v) => !v)} className="btn-primary ml-auto">
            {adding ? "Cancel" : "Add transaction"}
          </button>
        </div>

        {adding && (
          <div className="card mt-3">
            <h2 className="font-display text-lg font-semibold">New transaction</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="block text-sm font-medium">
                Client
                <select
                  value={newTxn.client_id}
                  onChange={(e) => setNewTxn({ ...newTxn, client_id: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
                >
                  <option value="">Select client…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Date
                <input type="date" value={newTxn.date} onChange={(e) => setNewTxn({ ...newTxn, date: e.target.value })} className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2" />
              </label>
              <label className="block text-sm font-medium">
                Amount
                <input type="number" step="0.01" value={newTxn.amount} onChange={(e) => setNewTxn({ ...newTxn, amount: e.target.value })} placeholder="-187.45" className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2" />
              </label>
              <label className="block text-sm font-medium">
                Merchant
                <input value={newTxn.merchant} onChange={(e) => setNewTxn({ ...newTxn, merchant: e.target.value })} placeholder="Bunnings Warehouse" className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2" />
              </label>
              <label className="block text-sm font-medium">
                Description
                <input value={newTxn.description} onChange={(e) => setNewTxn({ ...newTxn, description: e.target.value })} className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2" />
              </label>
            </div>
            <button onClick={createTransaction} className="btn-primary mt-4">Save transaction</button>
          </div>
        )}

        {selected.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-teal/30 bg-teal-light px-4 py-2.5 text-sm">
            <span className="font-medium text-teal-dark">{selected.size} selected</span>
            <button onClick={bulkAskClient} className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-dark">
              Ask client
            </button>
            <button onClick={() => bulkSetStatus("reviewed")} className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold hover:border-teal hover:text-teal">
              Mark reviewed
            </button>
            <button onClick={() => bulkSetStatus("reconciled")} className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold hover:border-teal hover:text-teal">
              Reconcile
            </button>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-ink/60 hover:underline">
              Clear
            </button>
          </div>
        )}

        {/* Queue */}
        <div className="card mt-4 overflow-x-auto !p-0">
          {loading ? (
            <p className="p-6 text-ink/60">Loading transactions…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-ink/60">No transactions match these filters.</p>
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/50">
                  <th className="w-8 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Merchant</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">AI suggestion</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-ink/5 align-top hover:bg-paper/60">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelected(t.id)} aria-label={`Select ${t.merchant}`} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{t.date}</td>
                    <td className="px-4 py-3">{clientName(t.client_id)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{t.merchant}</p>
                      <p className="text-xs text-ink/50">{t.description}</p>
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${t.amount >= 0 ? "text-emerald-700" : ""}`}>
                      {money(t.amount)}
                    </td>
                    <td className="px-4 py-3">
                      {t.ai_suggested_category ? (
                        <>
                          <p>{t.ai_suggested_category}</p>
                          <p className="text-xs text-ink/50">
                            {t.ai_confidence != null && `${Math.round(t.ai_confidence * 100)}% confidence`}
                            {t.gst_claimable != null && ` · GST ${t.gst_claimable ? "claimable" : "not claimable"}`}
                          </p>
                        </>
                      ) : (
                        <span className="text-ink/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {(t.status === "unanswered" || t.status === "waiting_client") && (
                          <button onClick={() => askClient(t)} className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-dark">
                            {t.status === "unanswered" ? "Ask client" : "Re-send"}
                          </button>
                        )}
                        {t.status === "answered" && (
                          <button onClick={() => setStatus(t, "reviewed")} className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold hover:border-teal hover:text-teal">
                            Mark reviewed
                          </button>
                        )}
                        {(t.status === "answered" || t.status === "reviewed") && (
                          <button onClick={() => setStatus(t, "reconciled")} className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold hover:border-teal hover:text-teal">
                            Reconcile
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent activity */}
        <h2 className="mt-10 font-display text-xl font-semibold">Recent activity</h2>
        <div className="card mt-3">
          {activity.length === 0 ? (
            <p className="text-ink/60">No activity yet. Send your first question from the queue above.</p>
          ) : (
            <ul className="divide-y divide-ink/5 text-sm">
              {activity.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2.5">
                  <span>
                    {t.answered_at
                      ? `${clientName(t.client_id)} answered the ${t.merchant} question`
                      : `Question sent to ${clientName(t.client_id)} about ${t.merchant}`}
                  </span>
                  <span className="text-xs text-ink/50">{(t.answered_at ?? t.question_sent_at ?? "").slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {toast && (
        <div role="status" className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-sm text-paper shadow-card">
          {toast}
        </div>
      )}
    </main>
  );
}
