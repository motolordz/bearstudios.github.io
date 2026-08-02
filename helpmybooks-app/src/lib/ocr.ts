import { hasAiKey } from "./ai";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface OcrResult {
  merchant: string | null;
  date: string | null; // YYYY-MM-DD
  amount: number | null;
  gst: number | null;
  confidence: number; // 0..1
}

/**
 * Extract merchant/date/amount/GST from a receipt photo using an OpenRouter
 * vision-capable model. Fail-soft: returns null if no AI key is configured,
 * the file isn't an image, or the model call/parse fails — the receipt is
 * still stored either way, this is a best-effort enrichment.
 */
export async function extractReceiptData(bytes: Buffer, contentType: string): Promise<OcrResult | null> {
  if (!hasAiKey()) return null;
  if (!contentType.startsWith("image/")) return null; // vision models need an image, not a PDF
  if (bytes.byteLength === 0) return null;

  const dataUrl = `data:${contentType};base64,${bytes.toString("base64")}`;

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "HelpMyBooks",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_VISION_MODEL ?? process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5",
        messages: [
          {
            role: "system",
            content:
              'You extract data from Australian receipt photos. Respond ONLY with a JSON object, no markdown fences, with keys: merchant (string or null), date (string "YYYY-MM-DD" or null), amount (number, the total paid, or null), gst (number, the GST component if shown or 1/11th of the total for a standard AU receipt, or null), confidence (0-1, how legible/certain the extraction is).',
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the merchant, date, total amount and GST from this receipt." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.1,
      }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "{}";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return {
      merchant: parsed.merchant ? String(parsed.merchant) : null,
      date: parsed.date ? String(parsed.date) : null,
      amount: parsed.amount != null ? Number(parsed.amount) : null,
      gst: parsed.gst != null ? Number(parsed.gst) : null,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5))),
    };
  } catch {
    return null; // fail soft — OCR is an enrichment, not a requirement
  }
}
