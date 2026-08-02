"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { createBrowserSupabaseClient } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const mockMode = supabase === null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  async function completeLogin() {
    const next = new URLSearchParams(window.location.search).get("next") || "/dashboard";
    router.push(next);
  }

  async function verifyMfa() {
    if (!mfaFactorId || mfaCode.length < 6) return;
    setError(null);
    setBusy(true);
    const { data: challenge, error: chErr } = await supabase!.auth.mfa.challenge({ factorId: mfaFactorId });
    if (chErr) {
      setBusy(false);
      setError(chErr.message);
      return;
    }
    const { error: vErr } = await supabase!.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: challenge.id,
      code: mfaCode,
    });
    setBusy(false);
    if (vErr) {
      setError(vErr.message);
      return;
    }
    completeLogin();
  }

  async function handleMagicLink() {
    setError(null);
    setMagicSent(false);
    if (mockMode) return;
    if (!email) {
      setError("Enter your email first, then tap the magic link button.");
      return;
    }
    setBusy(true);
    const { error } = await supabase!.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMagicSent(true);
  }

  async function handleLogin() {
    setError(null);
    if (mockMode) {
      router.push("/dashboard");
      return;
    }
    setBusy(true);
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }

    // Step up to a TOTP challenge if this account has 2FA enrolled.
    const { data: aal } = await supabase!.auth.mfa.getAuthenticatorAssuranceLevel();
    setBusy(false);
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: factors } = await supabase!.auth.mfa.listFactors();
      const totp = factors?.totp?.find((f) => f.status === "verified");
      if (totp) {
        setMfaFactorId(totp.id);
        return;
      }
    }
    completeLogin();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Link href="/"><Logo className="h-9" /></Link>
        </div>
        <div className="card">
          <h1 className="font-display text-2xl font-semibold">Bookkeeper login</h1>
          {mockMode && (
            <p className="mt-2 rounded-lg bg-teal-light px-3 py-2 text-sm text-teal-dark">
              Demo mode — no Supabase configured. Continue straight to the demo dashboard.
            </p>
          )}
          {mfaFactorId ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-ink/60">Enter the 6-digit code from your authenticator app.</p>
              <input
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoFocus
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-center text-lg tracking-[0.3em] focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                placeholder="000000"
              />
              {error && <p className="text-sm text-gum">{error}</p>}
              <button onClick={verifyMfa} disabled={busy || mfaCode.length < 6} className="btn-primary w-full">
                {busy ? "Verifying…" : "Verify and log in"}
              </button>
              <button onClick={() => setMfaFactorId(null)} className="w-full text-sm text-ink/60 hover:underline">
                Back
              </button>
            </div>
          ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={mockMode}
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal disabled:bg-ink/5"
                placeholder="you@practice.com.au"
              />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={mockMode}
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal disabled:bg-ink/5"
                placeholder="••••••••"
              />
            </label>
            {error && <p className="text-sm text-gum">{error}</p>}
            {magicSent && (
              <p className="rounded-lg bg-teal-light px-3 py-2 text-sm text-teal-dark">
                Magic link sent — check your inbox and tap the link to sign in.
              </p>
            )}
            <button onClick={handleLogin} disabled={busy} className="btn-primary w-full">
              {busy ? "Signing in…" : mockMode ? "Enter demo dashboard" : "Log in"}
            </button>
            <button onClick={handleMagicLink} disabled={busy || mockMode} className="btn-secondary w-full">
              Email me a magic link
            </button>
            <p className="text-center text-sm">
              <Link href="/forgot-password" className="text-teal hover:underline">Forgot password?</Link>
            </p>
          </div>
          )}
          {!mfaFactorId && (
            <p className="mt-4 text-center text-sm text-ink/60">
              No account? <Link href="/signup" className="font-medium text-teal hover:underline">Sign up</Link>
              {" · "}
              <Link href="/client/demo-dave" className="font-medium text-teal hover:underline">I&rsquo;m a client</Link>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
