import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Handles Supabase auth redirects that use the PKCE ?code= flow:
 * - email verification links
 * - magic links
 * - OAuth providers (future)
 *
 * Exchanges the code for a session, then redirects to `next` (default /dashboard).
 * Hash-based recovery links go straight to /reset-password client-side instead.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !anonKey) {
    // Mock mode — nothing to exchange
    return NextResponse.redirect(new URL(next, url.origin));
  }

  if (code) {
    const supabase = createClient(supabaseUrl, anonKey);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin)
      );
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
