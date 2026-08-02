import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient, getAuthMode } from "@/lib/supabaseClient";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { extractReceiptData } from "@/lib/ocr";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]);

/**
 * Receipt upload. multipart/form-data with fields:
 *   token (client secure link token), transaction_id, file
 * Stores in the private "receipts" bucket at receipts/{client_id}/{transaction_id}/{filename}
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`receipts-upload:${clientIp(req)}`, 20, 60_000)) {
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
    return NextResponse.json({ error: "File too large (max 15MB)." }, { status: 413 });
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type. Upload a photo or PDF of the receipt." }, { status: 415 });
  }

  if (getAuthMode() === "mock") {
    return NextResponse.json(
      {
        mode: "mock",
        message: "Mock mode: receipt accepted but not stored. Configure Supabase Storage to persist uploads.",
        receipt_path: `receipts/mock/${transactionId}/${file.name}`,
      },
      { status: 202 }
    );
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: client } = await supabase.from("clients").select("id").eq("secure_link_token", token).single();
  if (!client) return NextResponse.json({ error: "invalid link" }, { status: 403 });

  const { data: txn } = await supabase
    .from("transactions")
    .select("id")
    .eq("id", transactionId)
    .eq("client_id", client.id)
    .single();
  if (!txn) return NextResponse.json({ error: "transaction not found for this client" }, { status: 404 });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${client.id}/${transactionId}/${Date.now()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage.from("receipts").upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Best-effort OCR enrichment — never blocks the upload if it fails.
  const ocr = await extractReceiptData(bytes, file.type || "").catch(() => null);

  await supabase.from("receipts").insert({
    transaction_id: transactionId,
    storage_path: path,
    file_name: safeName,
    content_type: file.type,
    ocr_merchant: ocr?.merchant ?? null,
    ocr_date: ocr?.date ?? null,
    ocr_amount: ocr?.amount ?? null,
    ocr_gst: ocr?.gst ?? null,
    ocr_confidence: ocr?.confidence ?? null,
  });

  return NextResponse.json({ ok: true, receipt_path: path, ocr });
}
