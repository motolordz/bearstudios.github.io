# HelpMyBooks v1.0 — Roadmap Status

Base: v4.4 codebase (clean, 0 TS errors, Xero OAuth, organisations schema)
Quarry: v3.3 codebase (features ported and adapted, not copied blind)
Owner/IP: Bear Studios Pty Ltd

Legend: ✅ done · 🔶 partial · ⬜ not started

## Phase 0 — Codebase audit ✅
Two divergent uploads audited. v4.4 chosen as base (0 type errors, correct
schema, only Xero integration). v3.3 (28 type errors) used as feature quarry.

## Phase 1 — Core foundation 🔶 → mostly done
- ✅ Sign up, login, logout
- ✅ Forgot password (/forgot-password) + reset password (/reset-password)
- ✅ Magic links (login page) + email verification via /auth/callback (PKCE)
- ✅ Session persistence (Supabase client default) + bearer-token API auth
- ✅ Organisations: create, edit (/settings + /api/org)
- ✅ Team: invite, remove, revoke invite, change role (/api/team, /api/team/accept, /invite/[token])
- ✅ Role model: owner / admin / bookkeeper / accountant / client (schema + serverAuth)
- ⬜ Delete organisation (deliberately deferred — destructive; needs confirm flow + cascade policy)

## Phase 2 — Client management 🔶 → mostly done
- ✅ Create clients with business details, contact person, email, phone, ABN
- ✅ Archive / restore / search / filter / tag (/clients + /api/clients)
- ✅ bookkeeping_status + xero_contact_id fields
- ⬜ Per-client Xero connection UI (connection table exists: xero_connections)

## Phase 3 — Transaction engine 🔶
- ✅ Statuses, GST, confidence, AI fields, escalation (from base)
- ✅ account_code / source / synced_at columns added
- ✅ Org-scoped, role-checked transaction APIs (security retrofit)
- ⬜ Manual add UI, Xero sync of transactions into DB, bulk actions

## Phase 4 — AI clarification engine 🔶
- ✅ AI categorise route, 12 AU merchant patterns, low-confidence follow-ups (base)
- ⬜ Auto-create clarification on low confidence during import

## Phase 5 — Client portal 🔶
- ✅ Tokenised no-login portal, Who/What/Why, receipt upload, submit (base)
- ⬜ Voice reply, skip, save draft (v3.3 has voice route to port)

## Phase 6 — Receipt engine 🔶
- ✅ Upload path + camera permission; OCR columns added to schema
- ⬜ OCR extraction (merchant/date/amount/GST) — needs vision model call

## Phase 7 — AI learning 🔶
- ✅ ai_memory table + per-org merchant learning (base)
- ⬜ Learn-on-approval hook in review flow

## Phase 8 — Bookkeeper dashboard 🔶
- ✅ Queue, filters, counts, send question, review (base) + nav/logout
- ⬜ Metrics: response time, AI accuracy, savings, weekly/monthly completed

## Phase 9 — Accountant dashboard ⬜

## Phase 10 — Integrations 🔶
- ✅ Xero OAuth connect/callback + bank transaction fetch (base)
- ✅ xero_connections table (per-org token storage)
- ⬜ Chart of accounts, contacts, push coding back, provider abstraction

## Phase 11 — Notifications 🔶
- ✅ Delivery engine (Resend + Twilio, ported from v3.3)
- ✅ message_jobs queue + /api/messages/process (cron every 15 min)
- ✅ Escalation reminder ladder + daily cron (base)
- ✅ Team invite emails queued through the engine
- ⬜ Digests, push notifications

## Phase 12 — Billing 🔶
- ✅ billing_accounts (trial default, 14 days), Stripe checkout + webhook (ported, org model)
- ⬜ Upgrade/downgrade UI, usage, invoices list, cancel/reactivate flows

## Phase 13 — Security 🔶
- ✅ Bearer-token auth on staff APIs, org scoping everywhere, role checks
- ✅ Audit logs on org/team/client/transaction actions
- ✅ Stripe webhook signature verification (timing-safe), CRON_SECRET protection
- ⬜ 2FA, rate limiting, session management UI

## Phase 14 — Admin console ⬜
## Phase 15 — Analytics ⬜
## Phase 16 — Production polish ⬜ (loading/empty states partially exist)

## Verification (this session)
- `tsc --noEmit`: 0 errors
- `npm test`: 6/6 pass
- `next build`: clean
- Live smoke: 10 pages 200, all APIs correct mock responses, 202 contract intact

## Next session priorities
1. Phase 3: manual transaction add + Xero → DB sync + bulk actions
2. Phase 5: port voice reply from v3.3; add skip/draft
3. Phase 7: learn-on-approval hook
4. Phase 8: dashboard metrics
5. Phase 6: OCR via OpenRouter vision
