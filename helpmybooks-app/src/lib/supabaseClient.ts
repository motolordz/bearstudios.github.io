import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Mock mode rules (important):
 * - The app runs in MOCK mode when Supabase env vars are absent or empty.
 * - Never put placeholder values in .env.local — present-but-fake values would
 *   cause real (failing) DB queries. True mock mode = no Supabase vars at all.
 * - createServiceSupabaseClient() returns null in mock mode and MUST be
 *   null-checked by every caller. API routes should detect mock mode and
 *   return 202 with a message instead of erroring.
 *
 * The browser client uses @supabase/ssr so the session lives in cookies
 * (not just localStorage) — this lets middleware.ts read the session
 * server-side to gate protected pages (/dashboard, /clients, /settings).
 */

function envOrNull(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : null;
}

export function isMockMode(): boolean {
  return !envOrNull("NEXT_PUBLIC_SUPABASE_URL") || !envOrNull("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function getAuthMode(): "mock" | "real" {
  return isMockMode() ? "mock" : "real";
}

export function createBrowserSupabaseClient(): SupabaseClient | null {
  if (isMockMode()) return null;
  return createBrowserClient(
    envOrNull("NEXT_PUBLIC_SUPABASE_URL")!,
    envOrNull("NEXT_PUBLIC_SUPABASE_ANON_KEY")!
  );
}

export function createServiceSupabaseClient(): SupabaseClient | null {
  const url = envOrNull("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = envOrNull("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null; // mock mode — callers must null-check
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
