# HelpMyBooks v1.0 — Roadmap Status

Base: v4.4 codebase (clean, 0 TS errors, Xero OAuth, organisations schema)
Quarry: v3.3 codebase (features ported and adapted, not copied blind)
Owner/IP: Bear Studios Pty Ltd

Legend: ✅ done · 🔶 partial · ⬜ not started

## Phase 0 — Codebase audit ✅
Two divergent uploads audited. v4.4 chosen as base (0 type errors, correct
schema, only Xero integration). v3.3 (28 type errors) used as feature quarry.

## Phase 1 — Core foundation ✅
- ✅ Sign up, login, logout
- ✅ Forgot password (/forgot-password) + reset password (/reset-password)
- ✅ Magic links (login page) + email verification via /auth/callback (PKCE)
- ✅ Session persistence (cookie-based via @supabase/ssr) + bearer-token API auth
- ✅ Session enforcement middleware on /dashboard, /clients, /settings
- ✅ Two-factor authentication (TOTP enroll/disable in Settings, step-up on login)
- ✅ Organisations: create, edit (/settings + /api/org)
- ✅ Team: invite, remove, revoke invite, change role (/api/team, /api/team/accept, /invite/[token])
- ✅ Role model: owner / admin / bookkeeper / accountant / client (schema + serverAuth)
- ⬜ Delete organisation (deliberately deferred — destructive; needs confirm flow + cascade policy)

## Phase 2 — Client management ✅
- ✅ Create clients with business details, contact person, email, phone, ABN
- ✅ Archive / restore / search / filter / tag (/clients + /api/clients)
- ✅ bookkeeping_status + xero_contact_id fields
- ✅ Xero connection is org-level (one practice, one Xero org) — clients link via
  xero_contact_id, auto-matched/created during sync

## Phase 3 — Transaction engine ✅
- ✅ Statuses, GST, confidence, AI fields, escalation (from base)
- ✅ account_code / source / synced_at columns
- ✅ Org-scoped, role-checked transaction APIs
- ✅ Manual transaction entry (dashboard "Add transaction")
- ✅ Xero → DB sync (/api/xero/sync): client matching/creation, dedup by
  xero_bank_transaction_id, auto-clarification on low confidence
- ✅ Bulk actions (select rows → ask client / mark reviewed / reconcile)

## Phase 4 — AI clarification engine ✅
- ✅ AI categorise route, 12 AU merchant patterns, low-confidence follow-ups
- ✅ Org memory (ai_memory) is now read before every categorisation call, not
  just written to — "answer once, categorised forever" actually holds
- ✅ Auto-create clarification on low confidence during Xero import

## Phase 5 — Client portal ✅
- ✅ Tokenised no-login portal, Who/What/Why, receipt upload, submit
- ✅ Voice reply (MediaRecorder → /api/voice/upload → best-effort transcription)
- ✅ Skip (defer without losing the question) + save draft (localStorage,
  restored on return)

## Phase 6 — Receipt engine ✅
- ✅ Upload path + camera permission; file-type/size validation
- ✅ OCR extraction (merchant/date/amount/GST) via OpenRouter vision model,
  writing into the existing receipts.ocr_* columns

## Phase 7 — AI learning ✅
- ✅ ai_memory table + per-org merchant learning
- ✅ Learn-on-approval hook: a bookkeeper's final_category on review/reconcile
  is stored as a bookkeeper_override memory entry

## Phase 8 — Bookkeeper dashboard ✅
- ✅ Queue, filters, counts, send question, review, nav/logout
- ✅ Metrics: avg response time, AI accuracy, estimated time saved,
  weekly/monthly reconciled counts

## Phase 9 — Accountant dashboard 🔶
- ✅ The `accountant` role has full staff access to the existing dashboard
  (isStaff() includes it) — reviews, reconciles, sees everything a bookkeeper does
- ⬜ A distinct accountant-specific view/layout was not built — not started in
  any prior session, treated as a new feature rather than something to complete

## Phase 10 — Integrations ✅
- ✅ Xero OAuth connect/callback + bank transaction fetch
- ✅ xero_connections table with AES-256-GCM encrypted tokens at rest, auto-refresh
- ✅ Connection status surfaced in the dashboard header
- ⬜ Chart of accounts / contacts sync, pushing coding back to Xero, multi-provider
  abstraction (Xero is the only provider; out of scope for this pass)

## Phase 11 — Notifications ✅
- ✅ Delivery engine (Resend + Twilio), deduplicated between lib/reminders (ladder)
  and lib/delivery (actual sends)
- ✅ message_jobs queue + /api/messages/process (cron every 15 min)
- ✅ Escalation reminder ladder + daily cron
- ✅ Team invite emails queued through the engine
- ⬜ Digests, push notifications (net-new features, not started previously)

## Phase 12 — Billing ✅
- ✅ billing_accounts (trial default, 14 days), Stripe checkout, webhook
- ✅ Plan upgrade/downgrade (in-place subscription price change)
- ✅ Cancel-at-period-end + reactivate
- ✅ Invoice list (Stripe Invoices API) in Settings

## Phase 13 — Security ✅
- ✅ Bearer-token auth on staff APIs, org scoping everywhere, role checks
- ✅ Audit logs on org/team/client/transaction/billing/xero actions
- ✅ Stripe webhook signature verification (timing-safe), CRON_SECRET protection
- ✅ Session-enforcing middleware (was previously unauthenticated)
- ✅ Two-factor authentication (TOTP)
- ✅ Best-effort rate limiting on token-scoped client-portal routes
- ✅ Previously-public /api/ai/categorise now requires staff auth
- ⬜ Durable (multi-instance) rate limiting — current implementation is
  per-serverless-instance; fine for a single-region small deployment, needs
  Upstash/Vercel KV for real production scale

## Phase 14 — Admin console ⬜
Never started in any prior session. Not attempted here — building a full
cross-organisation admin console is a new feature, not a completion of
existing scaffolding, and was out of scope for this pass.

## Phase 15 — Analytics ⬜
Same as Phase 14 — no prior scaffolding existed. Dashboard-level metrics
(Phase 8) were added; a dedicated analytics module was not.

## Phase 16 — Production polish ✅
- ✅ Loading/empty states present on all data-bearing pages
- ✅ ESLint added (project had no lint config at all) — 0 warnings/errors
- ✅ File-type/size validation on uploads
- ✅ next/font instead of a manual Google Fonts `<link>` (removes a
  render-blocking request and an ESLint warning)

## Verification (this session)
- `npm run lint`: 0 warnings/errors (ESLint newly added — eslint-config-next)
- `tsc --noEmit`: 0 errors
- `npm test`: 6/6 pass
- `next build`: clean, 12 static + 20 dynamic routes, 1 middleware bundle
- Live smoke: not run in this environment (no browser-driven E2E harness) —
  see README's "Outstanding manual credential checks"

## Recommended next priorities
1. Swap the in-memory rate limiter for Upstash/Vercel KV before scaling past
   one Vercel region.
2. Consider Next.js 15/16 migration — Next 14.2.35 (already latest patch)
   still carries several `npm audit` advisories that only affect newer
   versions' features (Server Actions, middleware i18n) this app doesn't use;
   evaluate before your next major dependency bump.
3. Phase 9/14/15 (accountant view, admin console, analytics) if the business
   need materialises — none had prior scaffolding to complete.
