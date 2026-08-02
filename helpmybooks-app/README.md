# HelpMyBooks — v1.0-alpha.1

Base: v0.3 rebuild + ported v3.3 features (billing, team, messaging, CI/tests)
+ new Phase 1–2 functionality. See ROADMAP-STATUS.md for the phase-by-phase state.

AI-powered reconciliation questions for Australian bookkeepers. Flag a transaction,
the client answers Who/What/Why from their phone (receipt attached), AI suggests the
category + GST treatment with a confidence score, you review and reconcile.

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

## Go live

1. **Supabase** — create a project, run `supabase/schema.sql` then `supabase/seed.sql`
   in the SQL editor, create a private Storage bucket named `receipts`, and fill
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. **OpenRouter** — set `OPENROUTER_API_KEY` (optional `OPENROUTER_MODEL`). Without it,
   categorisation falls back to the built-in 12 Australian merchant patterns.
3. **Resend** — set `RESEND_API_KEY` + `RESEND_FROM` to send real email reminders.
4. **Twilio** — set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` for SMS.
5. **Xero** — create an OAuth 2.0 app at developer.xero.com, set `XERO_CLIENT_ID`,
   `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`.

Full variable list: `.env.example`.

## Deploy to Vercel

```bash
npx vercel
```

Set the env vars in the Vercel dashboard (Production + Preview). `vercel.json`
already schedules the overdue-reminder escalation cron (daily, `/api/reminders/run`).
Set `NEXT_PUBLIC_APP_URL` to your production URL so client links are correct.

## Architecture

- `src/lib/supabaseClient.ts` — mock/real mode detection; `createServiceSupabaseClient()`
  returns `null` in mock mode and every caller null-checks it. All write routes return
  **202** with a message in mock mode.
- `src/lib/ai.ts` — local AU merchant pattern pass first, OpenRouter second, fail-soft.
- `src/lib/merchants.ts` — 12 Australian merchant patterns (Bunnings, Caltex, ATO, Telstra…).
- `src/lib/reminders.ts` — escalation ladder none → first → second → final; Resend + Twilio.
- `src/lib/xero.ts` — OAuth 2.0 (Hubdoc has no public API; Xero is the feed source).
- Client portal is tokenised (`clients.secure_link_token`) — no client login needed;
  API routes scope strictly by token server-side. RLS protects everything else.
- `next.config.mjs` sets `Permissions-Policy: camera=(self)` so receipt capture works.

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/transactions` | GET / PATCH | Queue list · status/category updates |
| `/api/client/[token]` | GET | Client's open questions |
| `/api/questions/send` | POST | Generate question, mark waiting_client, notify |
| `/api/answers/submit` | POST | Save answer, run AI, learn merchant (ai_memory) |
| `/api/receipts/upload` | POST | Store receipt in Supabase Storage |
| `/api/reminders/run` | POST | Escalate overdue replies (cron) |
| `/api/ai/categorise` | POST | Direct categorisation endpoint |
| `/api/xero/connect` / `/api/xero/callback` | GET | Xero OAuth flow |

## Still needs real provider setup

- Supabase project + storage bucket (everything persists once configured)
- OpenRouter key (AI beyond the 12 local patterns)
- Resend domain verification; Twilio AU number with SMS capability
- Xero app approval + encrypted token persistence (callback has a marked TODO)
- Voice notes (placeholder button in the client portal)

## Next 10 steps to pilot users

1. Create the Supabase project, run schema + seed, flip to real mode, retest the loop end-to-end.
2. Sign up your own bookkeeper account and link it to the demo organisation.
3. Verify a sending domain in Resend and send yourself a real question email.
4. Buy an AU Twilio number and test the final-reminder SMS path.
5. Add your real logo to `/public/helpmybooks-logo.png` and set `USE_PNG = true` in `src/components/Logo.tsx`.
6. Deploy to Vercel with production env vars; point helpmybooks.com at it.
7. Import one real client's bank CSV (or connect Xero) and run a genuine reconciliation week.
8. Recruit 2–3 friendly bookkeepers; give each a demo org and a feedback form.
9. Add Supabase Auth session enforcement to `/dashboard` (middleware) before external users touch it.
10. Instrument the answer-rate metric (questions sent → answered within 48h) — it's the product's whole pitch.
