import type { SupabaseClient } from "@supabase/supabase-js";
import { AiResult } from "./types";
import { classifyMerchant } from "./merchants";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function hasAiKey(): boolean {
  const k = process.env.OPENROUTER_API_KEY;
  return !!k && k.trim().length > 0;
}

/**
 * "Answer once, categorised forever" — look up whether this organisation has
 * already learned this merchant (from a prior client answer or a bookkeeper's
 * override). Org-specific memory outranks the generic AU pattern list because
 * it reflects how *this* practice actually codes *this* merchant.
 */
export async function lookupOrgMemory(
  supabase: SupabaseClient,
  organisationId: string,
  merchant: string
): Promise<AiResult | null> {
  if (!merchant.trim()) return null;
  const { data } = await supabase
    .from("ai_memory")
    .select("learned_category, gst_claimable, confidence")
    .eq("organisation_id", organisationId)
    .eq("merchant_pattern", merchant.toLowerCase())
    .maybeSingle();
  if (!data) return null;
  return {
    suggested_category: data.learned_category,
    confidence: Number(data.confidence),
    gst_claimable: !!data.gst_claimable,
    needs_more_info: false,
    follow_up_question: null,
  };
}

interface CategoriseInput {
  merchant: string;
  description: string;
  amount: number;
  date: string;
  answer?: {
    who: string;
    what: string;
    why: string;
    business_or_personal: string;
  };
  /** Pre-fetched org memory match (via lookupOrgMemory) — takes priority over everything else. */
  memoryMatch?: AiResult | null;
}

/**
 * Categorise a transaction. Order of operations:
 * 1. This organisation's learned memory for the merchant, if any (highest priority).
 * 2. Local Australian merchant pattern pass (fast, free, offline).
 * 3. If no confident match AND an OpenRouter key exists, call the model.
 * 4. If no key (mock mode), return the local result or a low-confidence default.
 */
export async function categoriseTransaction(input: CategoriseInput): Promise<AiResult> {
  if (input.memoryMatch && input.memoryMatch.confidence >= 0.7) return input.memoryMatch;

  const local = classifyMerchant(input.merchant, input.description);
  if (local && local.confidence >= 0.85 && !input.answer) return local;

  if (!hasAiKey()) {
    return (
      local ?? {
        suggested_category: "Uncategorised",
        confidence: 0.2,
        gst_claimable: false,
        needs_more_info: true,
        follow_up_question: `Who was "${input.merchant}" paid to, what was it for, and was it business or personal?`,
      }
    );
  }

  const system = [
    "You are an Australian bookkeeping categorisation assistant.",
    "You are given a bank transaction and, optionally, the client's Who/What/Why answer.",
    "Respond ONLY with a JSON object, no markdown fences, with keys:",
    'suggested_category (string, Australian chart-of-accounts style),',
    "confidence (number 0-1),",
    "gst_claimable (boolean, per Australian GST rules),",
    "needs_more_info (boolean),",
    "follow_up_question (string or null — one short, plain-English question a small business owner can answer from their phone).",
  ].join(" ");

  const user = JSON.stringify(input);

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "HelpMyBooks",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    // Fail soft: fall back to local classification rather than erroring the route.
    return (
      local ?? {
        suggested_category: "Uncategorised",
        confidence: 0.2,
        gst_claimable: false,
        needs_more_info: true,
        follow_up_question: null,
      }
    );
  }

  const data = await res.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? "{}";
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return {
      suggested_category: String(parsed.suggested_category ?? "Uncategorised"),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5))),
      gst_claimable: Boolean(parsed.gst_claimable),
      needs_more_info: Boolean(parsed.needs_more_info),
      follow_up_question: parsed.follow_up_question ? String(parsed.follow_up_question) : null,
    };
  } catch {
    return (
      local ?? {
        suggested_category: "Uncategorised",
        confidence: 0.3,
        gst_claimable: false,
        needs_more_info: true,
        follow_up_question: null,
      }
    );
  }
}
