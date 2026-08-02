import { NextRequest } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient, getAuthMode } from "@/lib/supabaseClient";
import type { Profile, Role } from "@/lib/types";

/**
 * Server-side authentication for API routes.
 *
 * Client pages send the Supabase session access token as
 * `Authorization: Bearer <token>`. We verify it against Supabase Auth, load the
 * caller's profile (role + organisation), and hand back the SERVICE client for
 * DB work — every query in the route MUST then be scoped by
 * `auth.profile.organisation_id`.
 *
 * In mock mode this returns { mode: "mock" } and routes fall back to demo data
 * / 202 responses, preserving the established mock-mode contract.
 */

export type AuthContext =
  | { mode: "mock"; supabase: null; profile: null }
  | { mode: "real"; supabase: SupabaseClient; profile: Profile };

export type AuthFailure = { error: string; status: number };

export async function requireUser(
  req: NextRequest
): Promise<AuthContext | AuthFailure> {
  if (getAuthMode() === "mock") {
    return { mode: "mock", supabase: null, profile: null };
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { error: "Not authenticated", status: 401 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();
  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return { error: "Invalid or expired session", status: 401 };

  const service = createServiceSupabaseClient();
  if (!service) return { error: "Supabase not configured", status: 500 };

  const { data: profile, error: pErr } = await service
    .from("profiles")
    .select("id, full_name, role, organisation_id, email")
    .eq("id", data.user.id)
    .single();
  if (pErr || !profile) return { error: "Profile not found", status: 403 };

  return { mode: "real", supabase: service, profile: profile as Profile };
}

export function isAuthFailure(x: AuthContext | AuthFailure): x is AuthFailure {
  return (x as AuthFailure).error !== undefined;
}

const STAFF_ROLES: Role[] = ["owner", "admin", "bookkeeper", "accountant"];
const MANAGER_ROLES: Role[] = ["owner", "admin"];

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

export function canManageTeam(role: Role): boolean {
  return MANAGER_ROLES.includes(role);
}
