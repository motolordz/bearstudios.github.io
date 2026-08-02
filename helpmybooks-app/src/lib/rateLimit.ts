import { NextRequest } from "next/server";

/**
 * Best-effort in-memory rate limiter for the token-scoped client-portal
 * routes, which are reachable without a login (by design — clients answer
 * via a secure link, not an account). It protects against token brute-forcing
 * and upload spam on a single serverless instance.
 *
 * This is NOT durable across instances/regions. For multi-instance production
 * (e.g. Vercel with concurrent lambdas), swap the Map below for a shared store
 * such as Upstash Redis or Vercel KV — the limit()/keyFor() shape is designed
 * to make that a drop-in change.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodically drop expired buckets so the Map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  Array.from(buckets.entries()).forEach(([key, bucket]) => {
    if (bucket.resetAt <= now) buckets.delete(key);
  });
}, 60_000).unref?.();

export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Returns true if the call is within the limit (and records it),
 * false if the caller should be rejected with 429.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}
