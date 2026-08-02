import { NextRequest, NextResponse } from "next/server";
import { requireUser, isAuthFailure } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

/**
 * POST { token } — accept a team invitation. Caller must be signed in with the
 * invited email address. Attaches their profile to the organisation with the
 * invited role.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = (body?.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json(
      { mode: "mock", message: "Mock mode: invitation accepted locally only." },
      { status: 202 }
    );
  }

  const { data: invite, error } = await auth.supabase
    .from("team_invitations")
    .select("*")
    .eq("token", token)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .single();
  if (error || !invite) {
    return NextResponse.json({ error: "Invitation not found, expired, or already used" }, { status: 404 });
  }
  if (invite.email.toLowerCase() !== auth.profile.email.toLowerCase()) {
    return NextResponse.json(
      { error: `This invitation was sent to ${invite.email}. Sign in with that email to accept.` },
      { status: 403 }
    );
  }
  if (auth.profile.organisation_id && auth.profile.organisation_id !== invite.organisation_id) {
    return NextResponse.json({ error: "You already belong to another organisation" }, { status: 409 });
  }

  const { error: pErr } = await auth.supabase
    .from("profiles")
    .update({ organisation_id: invite.organisation_id, role: invite.role })
    .eq("id", auth.profile.id);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  await auth.supabase
    .from("team_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  await auth.supabase.from("audit_logs").insert({
    organisation_id: invite.organisation_id,
    actor: auth.profile.id,
    action: "team_invite_accepted",
    entity: `invitation:${invite.id}`,
  });

  return NextResponse.json({ mode: "real", ok: true, organisation_id: invite.organisation_id });
}
