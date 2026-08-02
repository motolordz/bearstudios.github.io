"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { createBrowserSupabaseClient } from "@/lib/supabaseClient";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const mockMode = supabase === null;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"bookkeeper" | "client">("bookkeeper");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSignup() {
    setError(null);
    if (mockMode) {
      router.push("/dashboard");
      return;
    }
    setBusy(true);
    const { error } = await supabase!.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Link href="/"><Logo className="h-9" /></Link>
        </div>
        <div className="card">
          <h1 className="font-display text-2xl font-semibold">Create your account</h1>
          {mockMode && (
            <p className="mt-2 rounded-lg bg-teal-light px-3 py-2 text-sm text-teal-dark">
              Demo mode — no Supabase configured. Continue straight to the demo dashboard.
            </p>
          )}
          {done ? (
            <p className="mt-4 rounded-lg bg-teal-light px-3 py-3 text-sm text-teal-dark">
              Check your email to confirm your account, then <Link href="/login" className="font-medium underline">log in</Link>.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">
                Full name
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={mockMode}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal disabled:bg-ink/5"
                  placeholder="Sarah Mitchell"
                />
              </label>
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
                  placeholder="At least 8 characters"
                />
              </label>
              <fieldset className="text-sm font-medium">
                <legend>I am a…</legend>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole("bookkeeper")}
                    className={`rounded-lg border px-3 py-2 ${role === "bookkeeper" ? "border-teal bg-teal-light text-teal-dark" : "border-ink/15"}`}
                  >
                    Bookkeeper
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("client")}
                    className={`rounded-lg border px-3 py-2 ${role === "client" ? "border-teal bg-teal-light text-teal-dark" : "border-ink/15"}`}
                  >
                    Client
                  </button>
                </div>
              </fieldset>
              {error && <p className="text-sm text-gum">{error}</p>}
              <button onClick={handleSignup} disabled={busy} className="btn-primary w-full">
                {busy ? "Creating…" : mockMode ? "Enter demo dashboard" : "Create account"}
              </button>
            </div>
          )}
          <p className="mt-4 text-center text-sm text-ink/60">
            Already have an account? <Link href="/login" className="font-medium text-teal hover:underline">Log in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
