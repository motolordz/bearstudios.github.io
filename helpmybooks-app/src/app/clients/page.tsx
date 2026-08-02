"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { apiFetch } from "@/lib/apiClient";
import type { ClientRecord } from "@/lib/types";

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [mode, setMode] = useState<"mock" | "real">("mock");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [tagFilter, setTagFilter] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", business_name: "", contact_person: "", email: "", phone: "", abn: "" });

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    const res = await apiFetch(`/api/clients?archived=${showArchived ? "true" : "false"}`);
    const data = await res.json();
    setClients(data.clients ?? []);
    setMode(data.mode ?? "mock");
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const allTags = useMemo(
    () => Array.from(new Set(clients.flatMap((c) => c.tags ?? []))).sort(),
    [clients]
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return clients.filter((c) => {
      if (tagFilter && !(c.tags ?? []).includes(tagFilter)) return false;
      if (!needle) return true;
      return [c.name, c.email, c.business_name, c.contact_person]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(needle));
    });
  }, [clients, q, tagFilter]);

  async function createClient() {
    if (!form.name.trim()) {
      flash("Client name is required");
      return;
    }
    const res = await apiFetch("/api/clients", { method: "POST", body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok && res.status !== 202) {
      flash(data.error ?? "Failed to create client");
      return;
    }
    flash(res.status === 202 ? "Demo mode — client not persisted" : "Client added");
    setAdding(false);
    setForm({ name: "", business_name: "", contact_person: "", email: "", phone: "", abn: "" });
    if (res.status !== 202) load();
  }

  async function setArchived(c: ClientRecord, archived: boolean) {
    const res = await apiFetch("/api/clients", {
      method: "PATCH",
      body: JSON.stringify({ id: c.id, archived }),
    });
    if (res.ok || res.status === 202) {
      setClients((prev) => prev.filter((x) => x.id !== c.id));
      flash(res.status === 202 ? "Demo mode — not persisted" : archived ? "Client archived" : "Client restored");
    }
  }

  async function editTags(c: ClientRecord) {
    const current = (c.tags ?? []).join(", ");
    const input = window.prompt("Tags (comma-separated):", current);
    if (input === null) return;
    const tags = input.split(",").map((t) => t.trim()).filter(Boolean);
    const res = await apiFetch("/api/clients", {
      method: "PATCH",
      body: JSON.stringify({ id: c.id, tags }),
    });
    if (res.ok || res.status === 202) {
      setClients((prev) => prev.map((x) => (x.id === c.id ? { ...x, tags } : x)));
      flash(res.status === 202 ? "Demo mode — not persisted" : "Tags updated");
    }
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal";

  return (
    <main className="min-h-screen bg-paper pb-16">
      <header className="border-b border-ink/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/dashboard"><Logo className="h-8" /></Link>
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link href="/dashboard" className="text-ink/70 hover:text-teal">Dashboard</Link>
            <span className="text-teal">Clients</span>
            <Link href="/settings" className="text-ink/70 hover:text-teal">Settings</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 px-4 pt-8">
        {mode === "mock" && (
          <p className="rounded-lg bg-teal-light px-3 py-2 text-sm text-teal-dark">
            Demo mode — showing sample clients.
          </p>
        )}
        {toast && <p className="rounded-lg bg-ink px-3 py-2 text-sm text-white">{toast}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clients…"
            className="grow rounded-lg border border-ink/15 px-3 py-2 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal sm:max-w-xs"
          />
          {allTags.length > 0 && (
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
            >
              <option value="">All tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Archived
          </label>
          <button onClick={() => setAdding((v) => !v)} className="btn-primary ml-auto">
            {adding ? "Cancel" : "Add client"}
          </button>
        </div>

        {adding && (
          <div className="card">
            <h2 className="font-display text-lg font-semibold">New client</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Name*
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Dave's Plumbing Pty Ltd" />
              </label>
              <label className="block text-sm font-medium">
                Business name
                <input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} className={inputCls} />
              </label>
              <label className="block text-sm font-medium">
                Contact person
                <input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className={inputCls} />
              </label>
              <label className="block text-sm font-medium">
                ABN
                <input value={form.abn} onChange={(e) => setForm({ ...form, abn: e.target.value })} className={inputCls} />
              </label>
              <label className="block text-sm font-medium">
                Email
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
              </label>
              <label className="block text-sm font-medium">
                Phone
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} placeholder="+61 4xx xxx xxx" />
              </label>
            </div>
            <button onClick={createClient} className="btn-primary mt-4">Save client</button>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-ink/60">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="card text-center text-sm text-ink/60">
            {showArchived ? "No archived clients." : "No clients yet — add your first client to start sending questions."}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((c) => (
              <div key={c.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    {c.contact_person && <p className="text-sm text-ink/60">{c.contact_person}</p>}
                    <p className="text-sm text-ink/60">{c.email || "no email"} · {c.phone || "no phone"}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.archived ? "bg-ink/10 text-ink/60" : "bg-teal-light text-teal-dark"}`}>
                    {c.archived ? "archived" : (c.bookkeeping_status ?? "active")}
                  </span>
                </div>
                {(c.tags ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(c.tags ?? []).map((t) => (
                      <span key={t} className="rounded-full bg-ink/5 px-2 py-0.5 text-xs text-ink/70">{t}</span>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <Link href={`/client/${c.secure_link_token}`} className="text-teal hover:underline">Client portal</Link>
                  <button onClick={() => editTags(c)} className="text-teal hover:underline">Tags</button>
                  {c.archived ? (
                    <button onClick={() => setArchived(c, false)} className="text-teal hover:underline">Restore</button>
                  ) : (
                    <button onClick={() => setArchived(c, true)} className="text-red-600 hover:underline">Archive</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
