import { NextRequest, NextResponse } from "next/server";
import { requireUser, isAuthFailure, canManageTeam } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

const MOCK_TEAM = {
  members: [
    { id: "p1", full_name: "Sarah Mitchell", email: "sarah@mitchellbooks.com.au", role: "owner" },
    { id: "p2", full_name: "Tom Nguyen", email: "tom@mitchellbooks.com.au", role: "bookkeeper" },
  ],
  invitations: [
    {
      id: "i1",
      email: "alex@mitchellbooks.com.au",
      role: "accountant",
      token: "demo-invite-token",
      accepted_at: null,
      expires_at: "2099-01-01T00:00:00Z",
      created_at: "2026-07-01T00:00:00Z",
    },
  ],
};

const TEAM_ROLES = ["admin", "bookkeeper", "accountant"];

/** GET — members + pending invitations for the caller's org */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") return NextResponse.json({ mode: "mock", ...MOCK_TEAM });

  const orgId = auth.profile.organisation_id;
  const [members, invites] = await Promise.all([
    auth.supabase.from("profiles").select("id, full_name, email, role").eq("organisation_id", orgId),
    auth.supabase
      .from("team_invitations")
      .select("*")
      .eq("organisation_id", orgId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);
  if (members.error || invites.error) {
    return NextResponse.json({ error: members.error?.message ?? invites.error?.message }, { status: 500 });
  }
  return NextResponse.json({ mode: "real", members: members.data, invitations: invites.data });
}

/** POST — invite a team member (owner/admin only). Queues the invite email. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = (body?.email ?? "").trim().toLowerCase();
  const role = body?.role ?? "bookkeeper";
  if (!email || !email.includes("@")) return NextResponse.json({ error: "valid email required" }, { status: 400 });
  if (!TEAM_ROLES.includes(role)) return NextResponse.json({ error: "invalid role" }, { status: 400 });

  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json(
      { mode: "mock", message: "Mock mode: invite recorded locally only.", invitation: { email, role } },
      { status: 202 }
    );
  }
  if (!canManageTeam(auth.profile.role)) {
    return NextResponse.json({ error: "Only owners and admins can invite team members" }, { status: 403 });
  }

  const orgId = auth.profile.organisation_id;
  const { data: invite, error } = await auth.supabase
    .from("team_invitations")
    .insert({ organisation_id: orgId, email, role, invited_by: auth.profile.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Queue the invite email through the message engine (delivered by cron)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  await auth.supabase.from("message_jobs").insert({
    organisation_id: orgId,
    channel: "email",
    template: "team_invite",
    payload: {
      to: email,
      role,
      invite_url: `${appUrl}/invite/${invite.token}`,
      invited_by: auth.profile.full_name,
    },
  });

  await auth.supabase.from("audit_logs").insert({
    organisation_id: orgId,
    actor: auth.profile.id,
    action: "team_invite_sent",
    entity: `invitation:${invite.id}`,
    detail: { email, role },
  });

  return NextResponse.json({ mode: "real", invitation: invite });
}

/** PATCH — change a member's role (owner/admin only) */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { memberId, role } = body ?? {};
  if (!memberId || !TEAM_ROLES.includes(role)) {
    return NextResponse.json({ error: "memberId and valid role required" }, { status: 400 });
  }

  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json({ mode: "mock", message: "Mock mode: role change not persisted." }, { status: 202 });
  }
  if (!canManageTeam(auth.profile.role)) {
    return NextResponse.json({ error: "Only owners and admins can change roles" }, { status: 403 });
  }
  if (memberId === auth.profile.id) {
    return NextResponse.json({ error: "You can't change your own role" }, { status: 400 });
  }

  const { data: target, error: tErr } = await auth.supabase
    .from("profiles")
    .select("id, role, organisation_id")
    .eq("id", memberId)
    .eq("organisation_id", auth.profile.organisation_id)
    .single();
  if (tErr || !target) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (target.role === "owner") return NextResponse.json({ error: "The owner's role can't be changed" }, { status: 400 });

  const { error } = await auth.supabase.from("profiles").update({ role }).eq("id", memberId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auth.supabase.from("audit_logs").insert({
    organisation_id: auth.profile.organisation_id,
    actor: auth.profile.id,
    action: "team_role_changed",
    entity: `profile:${memberId}`,
    detail: { role },
  });

  return NextResponse.json({ mode: "real", ok: true });
}

/** DELETE — remove a member or revoke an invitation (owner/admin only) */
export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const memberId = url.searchParams.get("memberId");
  const invitationId = url.searchParams.get("invitationId");
  if (!memberId && !invitationId) {
    return NextResponse.json({ error: "memberId or invitationId required" }, { status: 400 });
  }

  const auth = await requireUser(req);
  if (isAuthFailure(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.mode === "mock") {
    return NextResponse.json({ mode: "mock", message: "Mock mode: removal not persisted." }, { status: 202 });
  }
  if (!canManageTeam(auth.profile.role)) {
    return NextResponse.json({ error: "Only owners and admins can remove team members" }, { status: 403 });
  }

  const orgId = auth.profile.organisation_id;

  if (invitationId) {
    const { error } = await auth.supabase
      .from("team_invitations")
      .delete()
      .eq("id", invitationId)
      .eq("organisation_id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ mode: "real", ok: true });
  }

  if (memberId === auth.profile.id) {
    return NextResponse.json({ error: "You can't remove yourself" }, { status: 400 });
  }
  const { data: target } = await auth.supabase
    .from("profiles")
    .select("id, role")
    .eq("id", memberId!)
    .eq("organisation_id", orgId)
    .single();
  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (target.role === "owner") return NextResponse.json({ error: "The owner can't be removed" }, { status: 400 });

  const { error } = await auth.supabase
    .from("profiles")
    .update({ organisation_id: null, role: "bookkeeper" })
    .eq("id", memberId!);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auth.supabase.from("audit_logs").insert({
    organisation_id: orgId,
    actor: auth.profile.id,
    action: "team_member_removed",
    entity: `profile:${memberId}`,
  });

  return NextResponse.json({ mode: "real", ok: true });
}
