"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { apiFetch } from "@/lib/apiClient";
import { createBrowserSupabaseClient } from "@/lib/supabaseClient";
import type { TeamMember, TeamInvitation, TeamRole } from "@/lib/types";

interface Org {
  id: string;
  name: string;
  abn: string | null;
}

interface BillingAccount {
  plan: "trial" | "starter" | "growth" | "practice" | "cancelled";
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

interface Invoice {
  id: string;
  status: string;
  total: number;
  currency: string;
  created: string;
  url: string | null;
}

const PLAN_LABELS: Record<string, string> = {
  trial: "Free trial",
  starter: "Solo — $29/mo",
  growth: "Practice — $79/mo",
  practice: "Firm",
  cancelled: "Cancelled",
};

export default function SettingsPage() {
  const [mode, setMode] = useState<"mock" | "real">("mock");
  const [myRole, setMyRole] = useState<string>("owner");
  const [org, setOrg] = useState<Org | null>(null);
  const [orgName, setOrgName] = useState("");
  const [orgAbn, setOrgAbn] = useState("");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("bookkeeper");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingAccount | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [billingBusy, setBillingBusy] = useState(false);

  const supabase = createBrowserSupabaseClient();
  const [mfaEnrolled, setMfaEnrolled] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaEnrolling, setMfaEnrolling] = useState(false);
  const [mfaQr, setMfaQr] = useState<string | null>(null);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);

  const canManage = myRole === "owner" || myRole === "admin";

  async function loadMfa() {
    if (!supabase) return;
    const { data } = await supabase.auth.mfa.listFactors();
    const totp = data?.totp?.find((f) => f.status === "verified");
    setMfaEnrolled(!!totp);
    setMfaFactorId(totp?.id ?? null);
  }

  useEffect(() => {
    loadMfa();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startMfaEnroll() {
    if (!supabase) return;
    setMfaBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setMfaBusy(false);
    if (error) {
      flash(error.message);
      return;
    }
    setMfaFactorId(data.id);
    setMfaQr(data.totp.qr_code);
    setMfaSecret(data.totp.secret);
    setMfaEnrolling(true);
  }

  async function confirmMfaEnroll() {
    if (!supabase || !mfaFactorId || mfaCode.length < 6) return;
    setMfaBusy(true);
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
    if (chErr) {
      setMfaBusy(false);
      flash(chErr.message);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: challenge.id,
      code: mfaCode,
    });
    setMfaBusy(false);
    if (vErr) {
      flash(vErr.message);
      return;
    }
    setMfaEnrolling(false);
    setMfaQr(null);
    setMfaSecret(null);
    setMfaCode("");
    flash("Two-factor authentication enabled.");
    loadMfa();
  }

  async function disableMfa() {
    if (!supabase || !mfaFactorId) return;
    if (!window.confirm("Turn off two-factor authentication for your account?")) return;
    setMfaBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
    setMfaBusy(false);
    if (error) {
      flash(error.message);
      return;
    }
    flash("Two-factor authentication disabled.");
    loadMfa();
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    const [orgRes, teamRes, billingRes] = await Promise.all([apiFetch("/api/org"), apiFetch("/api/team"), apiFetch("/api/billing")]);
    const orgData = await orgRes.json();
    const teamData = await teamRes.json();
    const billingData = await billingRes.json().catch(() => ({}));
    setMode(orgData.mode ?? "mock");
    setMyRole(orgData.role ?? "owner");
    if (orgData.organisation) {
      setOrg(orgData.organisation);
      setOrgName(orgData.organisation.name ?? "");
      setOrgAbn(orgData.organisation.abn ?? "");
    }
    setMembers(teamData.members ?? []);
    setInvitations(teamData.invitations ?? []);
    setBilling(billingData.account ?? null);
    setInvoices(billingData.invoices ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveOrg() {
    const res = await apiFetch("/api/org", {
      method: org ? "PATCH" : "POST",
      body: JSON.stringify({ name: orgName, abn: orgAbn }),
    });
    const data = await res.json();
    if (!res.ok && res.status !== 202) {
      flash(data.error ?? "Failed to save");
      return;
    }
    flash(res.status === 202 ? "Demo mode — changes not persisted" : "Organisation saved");
    if (data.organisation) setOrg(data.organisation);
  }

  async function sendInvite() {
    if (!inviteEmail) return;
    const res = await apiFetch("/api/team", {
      method: "POST",
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const data = await res.json();
    if (!res.ok && res.status !== 202) {
      flash(data.error ?? "Failed to send invite");
      return;
    }
    flash(res.status === 202 ? "Demo mode — invite recorded locally" : `Invite sent to ${inviteEmail}`);
    setInviteEmail("");
    if (res.status !== 202) load();
    else if (data.invitation) {
      setInvitations((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          email: data.invitation.email,
          role: data.invitation.role,
          token: "demo",
          accepted_at: null,
          expires_at: "",
          created_at: new Date().toISOString(),
        },
      ]);
    }
  }

  async function changeRole(memberId: string, role: string) {
    const res = await apiFetch("/api/team", {
      method: "PATCH",
      body: JSON.stringify({ memberId, role }),
    });
    const data = await res.json();
    if (!res.ok && res.status !== 202) {
      flash(data.error ?? "Failed to change role");
      return;
    }
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: role as TeamMember["role"] } : m)));
    flash(res.status === 202 ? "Demo mode — not persisted" : "Role updated");
  }

  async function choosePlan(plan: "starter" | "growth" | "practice") {
    setBillingBusy(true);
    const res = await apiFetch("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan }) });
    const d = await res.json().catch(() => ({}));
    setBillingBusy(false);
    if (res.status === 202) {
      flash(d.message ?? "Billing isn't configured yet.");
      return;
    }
    if (d.url) {
      window.location.href = d.url;
    } else if (d.changed) {
      flash(`Switched to the ${PLAN_LABELS[plan]} plan.`);
      load();
    } else {
      flash(d.error ?? "Couldn't start checkout.");
    }
  }

  async function cancelBilling() {
    if (!window.confirm("Cancel your subscription at the end of the current billing period?")) return;
    setBillingBusy(true);
    const res = await apiFetch("/api/billing/cancel", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBillingBusy(false);
    if (!res.ok && res.status !== 202) {
      flash(d.error ?? "Couldn't cancel.");
      return;
    }
    flash(res.status === 202 ? d.message : "Subscription will end at the current period's close.");
    load();
  }

  async function reactivateBilling() {
    setBillingBusy(true);
    const res = await apiFetch("/api/billing/reactivate", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBillingBusy(false);
    if (!res.ok && res.status !== 202) {
      flash(d.error ?? "Couldn't reactivate.");
      return;
    }
    flash(res.status === 202 ? d.message : "Subscription reactivated.");
    load();
  }

  async function remove(kind: "member" | "invitation", id: string) {
    const qs = kind === "member" ? `memberId=${id}` : `invitationId=${id}`;
    const res = await apiFetch(`/api/team?${qs}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok && res.status !== 202) {
      flash(data.error ?? "Failed to remove");
      return;
    }
    if (kind === "member") setMembers((prev) => prev.filter((m) => m.id !== id));
    else setInvitations((prev) => prev.filter((i) => i.id !== id));
    flash(res.status === 202 ? "Demo mode — not persisted" : "Removed");
  }

  return (
    <main className="min-h-screen bg-paper pb-16">
      <header className="border-b border-ink/10 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/dashboard"><Logo className="h-8" /></Link>
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link href="/dashboard" className="text-ink/70 hover:text-teal">Dashboard</Link>
            <Link href="/clients" className="text-ink/70 hover:text-teal">Clients</Link>
            <span className="text-teal">Settings</span>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 pt-8">
        {mode === "mock" && (
          <p className="rounded-lg bg-teal-light px-3 py-2 text-sm text-teal-dark">
            Demo mode — settings are shown with sample data and changes aren&rsquo;t persisted.
          </p>
        )}
        {toast && (
          <p className="rounded-lg bg-ink px-3 py-2 text-sm text-white">{toast}</p>
        )}

        <section className="card">
          <h1 className="font-display text-xl font-semibold">Organisation</h1>
          <p className="mt-1 text-sm text-ink/60">
            {org ? "Practice details shown to clients on questions and reminders." : "Create your practice to get started."}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Practice name
              <input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={!canManage}
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal disabled:bg-ink/5"
                placeholder="Mitchell Bookkeeping"
              />
            </label>
            <label className="block text-sm font-medium">
              ABN
              <input
                value={orgAbn}
                onChange={(e) => setOrgAbn(e.target.value)}
                disabled={!canManage}
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal disabled:bg-ink/5"
                placeholder="51 824 753 556"
              />
            </label>
          </div>
          {canManage && (
            <button onClick={saveOrg} className="btn-primary mt-4">
              {org ? "Save changes" : "Create organisation"}
            </button>
          )}
        </section>

        {supabase && (
          <section className="card">
            <h2 className="font-display text-xl font-semibold">Account security</h2>
            <p className="mt-1 text-sm text-ink/60">
              Add a second factor so a leaked password alone can&rsquo;t get into your practice&rsquo;s data.
            </p>

            {mfaEnrolling ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm">Scan this with your authenticator app (Google Authenticator, 1Password, Authy…):</p>
                {mfaQr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mfaQr} alt="Scan this QR code with your authenticator app" className="h-40 w-40 rounded-lg border border-ink/10" />
                )}
                {mfaSecret && <p className="text-xs text-ink/50">Can&rsquo;t scan? Enter this key manually: <code className="font-mono">{mfaSecret}</code></p>}
                <input
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="000000"
                  className="w-40 rounded-lg border border-ink/15 px-3 py-2 text-center tracking-[0.3em] focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                />
                <div className="flex gap-2">
                  <button onClick={confirmMfaEnroll} disabled={mfaBusy || mfaCode.length < 6} className="btn-primary">
                    Confirm
                  </button>
                  <button onClick={() => { setMfaEnrolling(false); setMfaQr(null); setMfaSecret(null); }} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            ) : mfaEnrolled ? (
              <div className="mt-4 flex items-center gap-3">
                <span className="rounded-full bg-teal-light px-3 py-1 text-xs font-semibold text-teal-dark">2FA enabled</span>
                <button onClick={disableMfa} disabled={mfaBusy} className="text-sm text-red-600 hover:underline">
                  Turn off
                </button>
              </div>
            ) : (
              <button onClick={startMfaEnroll} disabled={mfaBusy} className="btn-secondary mt-4">
                Set up two-factor authentication
              </button>
            )}
          </section>
        )}

        <section className="card">
          <h2 className="font-display text-xl font-semibold">Billing</h2>
          {loading ? (
            <p className="mt-4 text-sm text-ink/60">Loading…</p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-teal-light px-3 py-1 text-sm font-semibold text-teal-dark">
                  {PLAN_LABELS[billing?.plan ?? "trial"] ?? billing?.plan}
                </span>
                {billing?.status && <span className="text-sm text-ink/60">Status: {billing.status}</span>}
                {billing?.trial_ends_at && billing.plan === "trial" && (
                  <span className="text-sm text-ink/60">Trial ends {new Date(billing.trial_ends_at).toLocaleDateString("en-AU")}</span>
                )}
                {billing?.current_period_end && (
                  <span className="text-sm text-ink/60">
                    {billing.cancel_at_period_end ? "Ends" : "Renews"} {new Date(billing.current_period_end).toLocaleDateString("en-AU")}
                  </span>
                )}
              </div>

              {canManage && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {(["starter", "growth", "practice"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => choosePlan(p)}
                      disabled={billingBusy}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold ${billing?.plan === p ? "border-teal bg-teal-light text-teal-dark" : "border-ink/15 hover:border-teal hover:text-teal"}`}
                    >
                      {PLAN_LABELS[p]}
                    </button>
                  ))}
                  {billing?.status === "active" && !billing.cancel_at_period_end && (
                    <button onClick={cancelBilling} disabled={billingBusy} className="rounded-lg border border-ink/15 px-3 py-2 text-sm font-semibold text-red-600 hover:border-red-300">
                      Cancel subscription
                    </button>
                  )}
                  {billing?.cancel_at_period_end && (
                    <button onClick={reactivateBilling} disabled={billingBusy} className="rounded-lg border border-ink/15 px-3 py-2 text-sm font-semibold hover:border-teal hover:text-teal">
                      Reactivate
                    </button>
                  )}
                </div>
              )}

              {invoices.length > 0 && (
                <div className="mt-5 border-t border-ink/10 pt-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">Invoices</h3>
                  <div className="mt-2 divide-y divide-ink/10 text-sm">
                    {invoices.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between py-2">
                        <span>{new Date(inv.created).toLocaleDateString("en-AU")} · {inv.status}</span>
                        <span className="flex items-center gap-3">
                          {new Intl.NumberFormat("en-AU", { style: "currency", currency: inv.currency }).format(inv.total)}
                          {inv.url && <a href={inv.url} target="_blank" rel="noreferrer" className="text-teal hover:underline">View</a>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section className="card">
          <h2 className="font-display text-xl font-semibold">Team</h2>
          <p className="mt-1 text-sm text-ink/60">
            Owners and admins can invite bookkeepers, accountants, and admins.
          </p>

          {loading ? (
            <p className="mt-4 text-sm text-ink/60">Loading…</p>
          ) : (
            <>
              <div className="mt-4 divide-y divide-ink/10">
                {members.map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="font-medium">{m.full_name || m.email}</p>
                      <p className="text-sm text-ink/60">{m.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {canManage && m.role !== "owner" ? (
                        <select
                          value={m.role}
                          onChange={(e) => changeRole(m.id, e.target.value)}
                          className="rounded-lg border border-ink/15 px-2 py-1.5 text-sm"
                        >
                          <option value="admin">Admin</option>
                          <option value="bookkeeper">Bookkeeper</option>
                          <option value="accountant">Accountant</option>
                        </select>
                      ) : (
                        <span className="rounded-full bg-teal-light px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-dark">
                          {m.role}
                        </span>
                      )}
                      {canManage && m.role !== "owner" && (
                        <button
                          onClick={() => remove("member", m.id)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {invitations.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">Pending invitations</h3>
                  <div className="mt-2 divide-y divide-ink/10">
                    {invitations.map((i) => (
                      <div key={i.id} className="flex items-center justify-between py-2">
                        <div>
                          <p className="text-sm font-medium">{i.email}</p>
                          <p className="text-xs text-ink/50">as {i.role}</p>
                        </div>
                        {canManage && (
                          <button
                            onClick={() => remove("invitation", i.id)}
                            className="text-sm text-red-600 hover:underline"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {canManage && (
                <div className="mt-5 flex flex-wrap items-end gap-2 border-t border-ink/10 pt-4">
                  <label className="grow text-sm font-medium">
                    Invite by email
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                      placeholder="teammate@practice.com.au"
                    />
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                    className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
                  >
                    <option value="bookkeeper">Bookkeeper</option>
                    <option value="accountant">Accountant</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button onClick={sendInvite} className="btn-primary">Send invite</button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
