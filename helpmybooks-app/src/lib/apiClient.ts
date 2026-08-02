"use client";

import { createBrowserSupabaseClient } from "@/lib/supabaseClient";

/**
 * fetch wrapper that attaches the Supabase session access token as a Bearer
 * header. In mock mode it's a plain fetch — API routes serve demo data.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const supabase = createBrowserSupabaseClient();
  const headers = new Headers(init.headers);
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body && !headers.has("Content-Type") && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers });
}
