import { hasAiKey } from "./ai";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Transcribe a client's voice-note reply using an OpenRouter audio-capable
 * model (OpenAI-compatible `input_audio` content type, e.g. gpt-4o-audio-preview
 * via OpenRouter). Fail-soft: returns null if no AI key is configured or the
 * call/parse fails — the bookkeeper can still listen to the recording directly.
 */
export async function transcribeVoiceNote(bytes: Buffer, contentType: string): Promise<string | null> {
  if (!hasAiKey()) return null;
  if (bytes.byteLength === 0) return null;

  const format = contentType.includes("mp4") || contentType.includes("m4a") ? "mp4" : contentType.includes("wav") ? "wav" : "webm";

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
        model: process.env.OPENROUTER_VOICE_MODEL ?? "openai/gpt-4o-audio-preview",
        messages: [
          {
            role: "system",
            content: "Transcribe the client's spoken answer plainly. Respond with the transcript text only — no commentary, no markdown.",
          },
          {
            role: "user",
            content: [
              { type: "input_audio", input_audio: { data: bytes.toString("base64"), format } },
            ],
          },
        ],
        temperature: 0,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    return text?.trim() || null;
  } catch {
    return null; // fail soft — transcription is an enrichment, not a requirement
  }
}
