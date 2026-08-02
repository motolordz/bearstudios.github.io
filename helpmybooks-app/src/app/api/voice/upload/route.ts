import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient, getAuthMode } from "@/lib/supabaseClient";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { transcribeVoiceNote } from "@/lib/voice";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB — a minute or two of compressed voice
const ALLOWED_TYPES = new Set(["audio/webm", "audio/mp4", "audio/m4a", "audio/mpeg", "audio/wav", "audio/ogg"]);

/**
 * Voice-note upload for the client portal. multipart/form-data with fields:
 *   token, transaction_id, file (a MediaRecorder blob from the browser)
 * Stores in the private "receipts" bucket under voice/{client_id}/{transaction_id}/…
 * and returns a best-effort transcript so the answer can be filed like text.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`voice-upload:${clientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests, please try again shortly." }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart form-data required" }, { status: 400 });

  const token = String(form.get("token") ?? "");
  const transactionId = String(form.get("transaction_id") ?? "");
  const file = form.get("file") as File | null;
  if (!token || !transactionId || !file) {
    return NextResponse.json({ error: "token, transaction_id and file are required" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Recording too large (max 10MB)." }, { status: 413 });
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported audio format." }, { status: 415 });
  }

  if (getAuthMode() === "mock") {
    return NextResponse.json(
      {
        mode: "mock",
        message: "Mock mode: voice note accepted but not stored.",
        voice_note_path: `receipts/mock/voice/${transactionId}/${file.name}`,
        transcript: "(Demo mode — transcription requires Supabase + an OpenRouter key.)",
      },
      { status: 202 }
    );
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: client } = await supabase.from("clients").select("id").eq("secure_link_token", token).single();
  if (!client) return NextResponse.json({ error: "invalid link" }, { status: 403 });

  const { data: txn } = await supabase.from("transactions").select("id").eq("id", transactionId).eq("client_id", client.id).single();
  if (!txn) return NextResponse.json({ error: "transaction not found for this client" }, { status: 404 });

  const ext = file.type.split("/")[1]?.split(";")[0] || "webm";
  const path = `voice/${client.id}/${transactionId}/${Date.now()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage.from("receipts").upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const transcript = await transcribeVoiceNote(bytes, file.type || "").catch(() => null);

  return NextResponse.json({ ok: true, voice_note_path: path, transcript });
}
