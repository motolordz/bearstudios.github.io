import { AiResult } from "./types";

interface MerchantPattern {
  pattern: RegExp;
  category: string;
  gst_claimable: boolean;
  confidence: number;
  note?: string;
}

/**
 * Australian merchant classification — 12 patterns.
 * Used as a fast local pass before (or instead of, in mock mode) the AI call.
 */
export const AU_MERCHANT_PATTERNS: MerchantPattern[] = [
  { pattern: /bunnings/i, category: "Repairs & Maintenance / Materials", gst_claimable: true, confidence: 0.9 },
  { pattern: /caltex|ampol|bp\b|shell/i, category: "Motor Vehicle — Fuel", gst_claimable: true, confidence: 0.85 },
  { pattern: /\bato\b|australian tax(ation)? office/i, category: "Tax Payments (ATO)", gst_claimable: false, confidence: 0.95, note: "BAS/PAYG payments have no GST" },
  { pattern: /telstra|optus|vodafone/i, category: "Telephone & Internet", gst_claimable: true, confidence: 0.9 },
  { pattern: /woolworths|coles|iga\b|aldi/i, category: "Groceries — possible personal", gst_claimable: false, confidence: 0.5, note: "Often personal; GST varies by basket" },
  { pattern: /officeworks/i, category: "Office Supplies", gst_claimable: true, confidence: 0.9 },
  { pattern: /qantas|virgin australia|jetstar|rex\b/i, category: "Travel — Airfares", gst_claimable: true, confidence: 0.8 },
  { pattern: /uber(?!\s*eats)|didi|ola\b|13cabs/i, category: "Travel — Rideshare/Taxi", gst_claimable: true, confidence: 0.8 },
  { pattern: /uber\s*eats|menulog|doordash|deliveroo/i, category: "Meals — possible entertainment", gst_claimable: false, confidence: 0.5, note: "Entertainment rules may deny GST/deduction" },
  { pattern: /xero|myob|quickbooks|intuit/i, category: "Software & Subscriptions — Accounting", gst_claimable: true, confidence: 0.95 },
  { pattern: /aust(ralia)? post|auspost/i, category: "Postage & Freight", gst_claimable: true, confidence: 0.9 },
  { pattern: /bank fee|account fee|monthly fee|nab\b|anz\b|westpac|commbank|cba\b/i, category: "Bank Fees", gst_claimable: false, confidence: 0.7, note: "Most bank fees are input-taxed (no GST)" },
];

export function classifyMerchant(merchant: string, description: string): AiResult | null {
  const haystack = `${merchant} ${description}`;
  for (const p of AU_MERCHANT_PATTERNS) {
    if (p.pattern.test(haystack)) {
      return {
        suggested_category: p.category,
        confidence: p.confidence,
        gst_claimable: p.gst_claimable,
        needs_more_info: p.confidence < 0.7,
        follow_up_question:
          p.confidence < 0.7
            ? `Was this ${merchant} purchase for the business or personal? A quick note on what it was for helps.`
            : null,
      };
    }
  }
  return null;
}
