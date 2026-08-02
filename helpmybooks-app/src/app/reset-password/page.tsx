"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { createBrowserSupabaseClient } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const mockMode = supabase === null;

  const [ready, setReady] = useState(mockMode);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mockMode) return;
    // Supabase delivers a recovery session via the URL hash; the client picks
    // it up automatically. Listen for it so the form only enables when valid.
    const { data: sub } = supabase!.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase!.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [mockMode, supabase]);

  async function handleSubmit() {
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (mockMode) {
      router.push("/login");
      return;
    }
    setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Link href="/"><Logo className="h-9" /></Link>
        </div>
        <div className="card">
          <h1 className="font-display text-2xl font-semibold">Choose a new password</h1>
          {mockMode && (
            <p className="mt-2 rounded-lg bg-teal-light px-3 py-2 text-sm text-teal-dark">
              Demo mode — password won&rsquo;t actually change.
            </p>
          )}
          {!ready && !mockMode ? (
            <p className="mt-4 text-sm text-ink/60">
              Waiting for a valid reset link… If you opened this page directly, request a
              new link from the <Link href="/forgot-password" className="text-teal underline">forgot password</Link> page.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">
                New password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                />
              </label>
              <label className="block text-sm font-medium">
                Confirm password
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button onClick={handleSubmit} disabled={busy} className="btn-primary w-full">
                {busy ? "Saving…" : "Set new password"}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
