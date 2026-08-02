"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { createBrowserSupabaseClient } from "@/lib/supabaseClient";

export default function ForgotPasswordPage() {
  const supabase = createBrowserSupabaseClient();
  const mockMode = supabase === null;

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (mockMode) {
      setSent(true);
      return;
    }
    setBusy(true);
    const { error } = await supabase!.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Link href="/"><Logo className="h-9" /></Link>
        </div>
        <div className="card">
          <h1 className="font-display text-2xl font-semibold">Reset your password</h1>
          {mockMode && (
            <p className="mt-2 rounded-lg bg-teal-light px-3 py-2 text-sm text-teal-dark">
              Demo mode — no email will be sent.
            </p>
          )}
          {sent ? (
            <div className="mt-4 space-y-4">
              <p className="rounded-lg bg-teal-light px-3 py-2 text-sm text-teal-dark">
                If an account exists for <strong>{email || "that address"}</strong>, a reset
                link is on its way. Check your inbox.
              </p>
              <Link href="/login" className="btn-secondary w-full">Back to login</Link>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                  placeholder="you@practice.com.au"
                />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button onClick={handleSubmit} disabled={busy} className="btn-primary w-full">
                {busy ? "Sending…" : "Send reset link"}
              </button>
              <p className="text-center text-sm text-ink/60">
                Remembered it? <Link href="/login" className="text-teal underline">Log in</Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
