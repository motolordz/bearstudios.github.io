# HelpMyBooks — v1.0 RC5

Base: v0.3 rebuild + ported v3.3 features (billing, team, messaging, CI/tests)
+ Phase 1–13 functionality completed. See ROADMAP-STATUS.md for the phase-by-phase state.

AI-powered reconciliation questions for Australian bookkeepers. Flag a transaction,
the client answers Who/What/Why from their phone (receipt or voice note attached),
AI suggests the category + GST treatment with a confidence score, you review and reconcile.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Out of the box it runs in **demo (mock) mode** — no keys needed:
- `/` — landing page
- `/dashboard` — bookkeeper dashboard with 10 seeded transactions
- `/client/demo-dave` and `/client/demo-luna` — client portals
- `/login`, `/signup` — pass straight through in demo mode

**Mock mode rule (important):** `.env.local` must contain ONLY
`NEXT_PUBLIC_APP_URL` — no placeholder Supabase values. Present-but-fake values
trigger real (failing) DB queries.

## Verify before deploying

```bash
npm run lint        # ESLint (eslint-config-next)
npm run typecheck    # tsc --noEmit
npm test              # node --test
npm run build         # production build
```

All four are wired into `.github/workflows/ci.yml` and must pass clean.

## Go live

1. **Supabase** — create a project, run `supabase/schema.sql` then `supabase/seed.sql`
   in the SQL editor (safe to re-run — every migration is `add column/table if not exists`),
   create a private Storage bucket named `receipts`, and fill
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. **OpenRouter** — set `OPENROUTER_API_KEY` (optional `OPENROUTER_MODEL`,
   `OPENROUTER_VISION_MODEL`, `OPENROUTER_VOICE_MODEL`). Without it, categorisation
   falls back to the built-in 12 Australian merchant patterns and OCR/voice
   transcription are skipped (uploads still work, just without the AI extraction).
3. **Resend** — set `RESEND_API_KEY` + `RESEND_FROM` to send real email reminders.
4. **Twilio** — set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` for SMS.
5. **Xero** — create an OAuth 2.0 app at developer.xero.com, set `XERO_CLIENT_ID`,
   `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`, and generate `XERO_TOKEN_ENCRYPTION_KEY`
   with `openssl rand -base64 32` (tokens are encrypted at rest — the app refuses to
   store them without this key configured).
6. **Stripe** — set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and one Price ID per
   plan (`STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_PRACTICE`).
   Point a webhook at `/api/billing/webhook` for `checkout.session.completed` and
   `customer.subscription.*`.

Full variable list: `.env.example`.

## Deploy to Vercel

```bash
npx vercel
```

Set the env vars in the Vercel dashboard (Production + Preview). `vercel.json`
already schedules the overdue-reminder escalation cron (daily, `/api/reminders/run`)
and the message-queue processor (every 15 min, `/api/messages/process`).
Set `NEXT_PUBLIC_APP_URL` to your production URL so client links, OAuth redirects,
and Stripe checkout URLs are all correct.

GitHub Pages **cannot** host this app — it needs a Node server for API routes,
cron, and server-side Supabase/Stripe/Xero calls. Deploy the `helpmybooks-app/`
directory to Vercel (or any Node host); the rest of this repository (the static
`bearstudios.github.io` site) is unrelated and deploys separately via GitHub Pages.

## Architecture

- `src/lib/supabaseClient.ts` — mock/real mode detection. The browser client uses
  `@supabase/ssr` so sessions live in cookies (not just localStorage); this lets
  `src/middleware.ts` enforce login on `/dashboard`, `/clients`, `/settings`.
  `createServiceSupabaseClient()` returns `null` in mock mode and every caller
  null-checks it. All write routes return **202** with a message in mock mode.
- `src/lib/ai.ts` — priority order per transaction: this org's learned `ai_memory`
  first, then the local AU merchant pattern pass, then OpenRouter, fail-soft to a
  low-confidence default. "Answer once, categorised forever" is a real read path,
  not just a write.
- `src/lib/merchants.ts` — 12 Australian merchant patterns (Bunnings, Caltex, ATO, Telstra…).
- `src/lib/ocr.ts` / `src/lib/voice.ts` — OpenRouter vision/audio extraction for
  receipt photos and voice-note replies. Both fail-soft: the upload always
  succeeds, the AI enrichment is best-effort.
- `src/lib/reminders.ts` — escalation ladder none → first → second → final (copy
  + timing only); actual sending goes through `src/lib/delivery.ts` (Resend + Twilio).
- `src/lib/xero.ts` / `src/lib/crypto.ts` — OAuth 2.0 connect/callback, AES-256-GCM
  token encryption at rest, auto-refresh. `/api/xero/sync` pulls bank transactions,
  matches/creates clients, and auto-sends a clarification question for low-confidence
  imports.
- `src/lib/stripe.ts` — checkout, plan changes, cancel/reactivate, invoice listing —
  a small REST client, no SDK dependency.
- `src/lib/rateLimit.ts` — best-effort per-instance rate limiting on the token-scoped
  client-portal routes (not durable across serverless instances — swap in
  Upstash/Vercel KV for real multi-region protection).
- Client portal is tokenised (`clients.secure_link_token`) — no client login needed;
  API routes scope strictly by token server-side. RLS protects everything else.
  Two-factor auth (TOTP) is available for staff accounts via Settings.
- `next.config.mjs` sets `Permissions-Policy: camera=(self)` so receipt capture works.

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/transactions` | GET / POST / PATCH | Queue list · manual entry · single/bulk status updates |
| `/api/client/[token]` | GET | Client's open questions |
| `/api/questions/send` | POST | Generate question(s), mark waiting_client, notify (single or bulk) |
| `/api/questions/skip` | POST | Client defers a question without answering |
| `/api/answers/submit` | POST | Save answer (text and/or voice), run AI, learn merchant |
| `/api/receipts/upload` | POST | Store receipt in Supabase Storage + OCR extraction |
| `/api/voice/upload` | POST | Store voice-note reply + transcription |
| `/api/reminders/run` | POST | Escalate overdue replies (cron) |
| `/api/messages/process` | GET | Drain the outbound message_jobs queue (cron) |
| `/api/ai/categorise` | POST | Direct categorisation endpoint (staff-only) |
| `/api/xero/connect` / `/api/xero/callback` / `/api/xero/status` / `/api/xero/sync` | GET/GET/GET/POST | Xero OAuth + bank transaction sync |
| `/api/billing`, `/api/billing/checkout`, `/api/billing/cancel`, `/api/billing/reactivate`, `/api/billing/webhook` | — | Stripe billing lifecycle |

## Outstanding manual credential checks

Everything above is implemented against each provider's real API. Nobody has
supplied live credentials in this environment, so the following can only be
verified by whoever holds the accounts:

- Supabase project provisioned, schema + seed applied, `receipts` storage bucket created
- OpenRouter key valid and has credit
- Resend sending domain verified (SPF/DKIM) — until then, emails fail silently to `skipped`
- Twilio AU number purchased with SMS capability
- Xero app approved for the target scopes, redirect URI matches exactly
- Stripe account live, price IDs created, webhook endpoint registered and secret copied
- `XERO_TOKEN_ENCRYPTION_KEY` generated and stored as a secret (not in git)

## Next steps to pilot users

1. Create the Supabase project, run schema + seed, flip to real mode, retest the loop end-to-end.
2. Sign up your own bookkeeper account and link it to the demo organisation.
3. Verify a sending domain in Resend and send yourself a real question email.
4. Buy an AU Twilio number and test the final-reminder SMS path.
5. Add your real logo to `/public/helpmybooks-logo.png` and set `USE_PNG = true` in `src/components/Logo.tsx`.
6. Deploy to Vercel with production env vars; point helpmybooks.com at it.
7. Connect Xero and run a real sync, or import one client's bank CSV manually.
8. Recruit 2–3 friendly bookkeepers; give each a demo org and a feedback form.
9. Turn on 2FA (Settings → Account security) for every staff account before onboarding clients.
10. Instrument the answer-rate metric (questions sent → answered within 48h) — it's the product's whole pitch.
