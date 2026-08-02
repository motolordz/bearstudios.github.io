"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { apiFetch } from "@/lib/apiClient";
import { createBrowserSupabaseClient } from "@/lib/supabaseClient";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const mockMode = supabase === null;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setError(null);
    setBusy(true);
    if (!mockMode) {
      const { data } = await supabase!.auth.getSession();
      if (!data.session) {
        router.push(`/login?next=/invite/${token}`);
        return;
      }
    }
    const res = await apiFetch("/api/team/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    const payload = await res.json();
    setBusy(false);
    if (!res.ok && res.status !== 202) {
      setError(payload.error ?? "Could not accept invitation.");
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
        <div className="card text-center">
          <h1 className="font-display text-2xl font-semibold">Join the team</h1>
          <p className="mt-2 text-sm text-ink/60">
            You've been invited to join a practice on HelpMyBooks. Accepting links your
            account to their organisation.
          </p>
          {mockMode && (
            <p className="mt-3 rounded-lg bg-teal-light px-3 py-2 text-sm text-teal-dark">
              Demo mode — acceptance is simulated.
            </p>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <button onClick={accept} disabled={busy} className="btn-primary mt-5 w-full">
            {busy ? "Joining…" : "Accept invitation"}
          </button>
          <p className="mt-3 text-sm text-ink/60">
            New here? <Link href="/signup" className="text-teal underline">Create an account</Link> with the
            invited email first, then return to this link.
          </p>
        </div>
      </div>
    </main>
  );
}
