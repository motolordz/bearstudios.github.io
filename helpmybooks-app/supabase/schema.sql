-- HelpMyBooks — Supabase schema (v0.3)
-- Run in the Supabase SQL editor. Migration pattern is ADDITIVE:
-- new columns go in "alter table ... add column if not exists" blocks
-- at the END of this file, labelled by version. Never edit create-table blocks.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

create table if not exists organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abn text,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organisation_id uuid references organisations(id),
  full_name text not null default '',
  role text not null default 'bookkeeper' check (role in ('bookkeeper','client','admin')),
  email text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  profile_id uuid references profiles(id),
  name text not null,
  email text,
  phone text,
  secure_link_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  client_id uuid not null references clients(id),
  date date not null,
  amount numeric(12,2) not null,
  merchant text not null default '',
  description text not null default '',
  status text not null default 'unanswered'
    check (status in ('unanswered','waiting_client','answered','reviewed','reconciled')),
  bookkeeper_notes text,
  ai_suggested_category text,
  ai_confidence numeric(3,2),
  final_category text,
  gst_claimable boolean,
  escalation_stage text not null default 'none'
    check (escalation_stage in ('none','first_reminder','second_reminder','final_reminder')),
  question_sent_at timestamptz,
  answered_at timestamptz,
  xero_bank_transaction_id text,
  created_at timestamptz not null default now()
);

create table if not exists transaction_questions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  question_text text not null,
  channel text not null default 'link' check (channel in ('link','email','sms')),
  sent_at timestamptz not null default now()
);

create table if not exists transaction_answers (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  who_answer text not null default '',
  what_answer text not null default '',
  why_answer text not null default '',
  business_or_personal text not null default 'business'
    check (business_or_personal in ('business','personal','mixed')),
  receipt_path text,
  submitted_at timestamptz not null default now()
);

create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  storage_path text not null, -- Supabase Storage bucket: receipts
  file_name text not null,
  content_type text,
  uploaded_at timestamptz not null default now()
);

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  transaction_id uuid references transactions(id),
  channel text not null check (channel in ('email','sms')),
  stage text not null check (stage in ('first_reminder','second_reminder','final_reminder')),
  sent boolean not null default false,
  failure_reason text,
  sent_at timestamptz not null default now()
);

create table if not exists ai_memory (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  merchant_pattern text not null,
  learned_category text not null,
  gst_claimable boolean,
  confidence numeric(3,2) not null default 0.90,
  source text not null default 'client_answer' check (source in ('client_answer','bookkeeper_override','pattern')),
  created_at timestamptz not null default now(),
  unique (organisation_id, merchant_pattern)
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references organisations(id),
  actor text not null,          -- profile id, client token, or 'system'
  action text not null,         -- e.g. 'question_sent', 'answer_submitted', 'status_changed'
  entity text not null,         -- e.g. 'transaction:uuid'
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Storage: create a bucket named "receipts" (private) in the dashboard, or:
-- insert into storage.buckets (id, name, public) values ('receipts','receipts', false)
-- on conflict do nothing;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table organisations enable row level security;
alter table profiles enable row level security;
alter table clients enable row level security;
alter table transactions enable row level security;
alter table transaction_questions enable row level security;
alter table transaction_answers enable row level security;
alter table receipts enable row level security;
alter table reminders enable row level security;
alter table ai_memory enable row level security;
alter table audit_logs enable row level security;

-- Helper: the caller's organisation
create or replace function current_org() returns uuid
language sql stable security definer as $$
  select organisation_id from profiles where id = auth.uid()
$$;

-- Profiles: users see/update their own row
drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles
  for select using (id = auth.uid());
drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles
  for update using (id = auth.uid());

-- Organisation-scoped read/write for bookkeepers & admins
drop policy if exists "org members read org" on organisations;
create policy "org members read org" on organisations
  for select using (id = current_org());

drop policy if exists "org read clients" on clients;
create policy "org read clients" on clients
  for select using (organisation_id = current_org());
drop policy if exists "org write clients" on clients;
create policy "org write clients" on clients
  for all using (organisation_id = current_org());

drop policy if exists "org rw transactions" on transactions;
create policy "org rw transactions" on transactions
  for all using (organisation_id = current_org());

drop policy if exists "org rw questions" on transaction_questions;
create policy "org rw questions" on transaction_questions
  for all using (exists (
    select 1 from transactions t where t.id = transaction_id and t.organisation_id = current_org()
  ));

drop policy if exists "org rw answers" on transaction_answers;
create policy "org rw answers" on transaction_answers
  for all using (exists (
    select 1 from transactions t where t.id = transaction_id and t.organisation_id = current_org()
  ));

drop policy if exists "org rw receipts" on receipts;
create policy "org rw receipts" on receipts
  for all using (exists (
    select 1 from transactions t where t.id = transaction_id and t.organisation_id = current_org()
  ));

drop policy if exists "org rw reminders" on reminders;
create policy "org rw reminders" on reminders
  for all using (exists (
    select 1 from clients c where c.id = client_id and c.organisation_id = current_org()
  ));

drop policy if exists "org rw ai_memory" on ai_memory;
create policy "org rw ai_memory" on ai_memory
  for all using (organisation_id = current_org());

drop policy if exists "org read audit" on audit_logs;
create policy "org read audit" on audit_logs
  for select using (organisation_id = current_org());

-- Clients with a login see only their own client record + transactions
drop policy if exists "client sees own record" on clients;
create policy "client sees own record" on clients
  for select using (profile_id = auth.uid());
drop policy if exists "client sees own txns" on transactions;
create policy "client sees own txns" on transactions
  for select using (exists (
    select 1 from clients c where c.id = client_id and c.profile_id = auth.uid()
  ));

-- Note: the tokenised client portal (/client/[token]) is served by API routes
-- using the service-role key server-side, which bypasses RLS deliberately and
-- scopes strictly by secure_link_token. Tokens are 48-hex-char random values.

-- ---------------------------------------------------------------------------
-- Seed / demo data
-- ---------------------------------------------------------------------------

insert into organisations (id, name, abn) values
  ('00000000-0000-0000-0000-000000000001'::uuid, 'Mitchell Bookkeeping', '51 824 753 556')
on conflict do nothing;

-- NOTE: seed profile requires a real auth.users row; create the bookkeeper via
-- the signup page first, then link:
-- update profiles set organisation_id = (select id from organisations limit 1),
--   role = 'bookkeeper' where email = 'sarah@mitchellbooks.com.au';

-- Demo clients + transactions: see supabase/seed.sql

-- ---------------------------------------------------------------------------
-- v0.3 additive migrations (append future changes below this line)
-- ---------------------------------------------------------------------------
alter table transactions add column if not exists xero_bank_transaction_id text;

-- ---------------------------------------------------------------------------
-- v1.0 additive migrations (Phase 1–3 foundation)
-- ---------------------------------------------------------------------------

-- Expanded role model: owner | admin | bookkeeper | accountant | client
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('owner','admin','bookkeeper','accountant','client'));

-- Phase 2: client management fields
alter table clients add column if not exists business_name text;
alter table clients add column if not exists contact_person text;
alter table clients add column if not exists abn text;
alter table clients add column if not exists archived boolean not null default false;
alter table clients add column if not exists tags text[] not null default '{}';
alter table clients add column if not exists bookkeeping_status text not null default 'active';
alter table clients add column if not exists xero_contact_id text;

-- Phase 3: transaction engine fields
alter table transactions add column if not exists account_code text;
alter table transactions add column if not exists source text not null default 'manual';
alter table transactions add column if not exists synced_at timestamptz;

-- Phase 6: receipt OCR fields
alter table receipts add column if not exists ocr_merchant text;
alter table receipts add column if not exists ocr_date date;
alter table receipts add column if not exists ocr_amount numeric(12,2);
alter table receipts add column if not exists ocr_gst numeric(12,2);
alter table receipts add column if not exists ocr_confidence numeric(3,2);

-- Team invitations (ported from v3.3 firms model → organisations)
create table if not exists team_invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  email text not null,
  role text not null default 'bookkeeper'
    check (role in ('admin','bookkeeper','accountant')),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references profiles(id),
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

-- Billing (Stripe) — ported from v3.3
create table if not exists billing_accounts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null default 'trial'
    check (plan in ('trial','starter','growth','practice','cancelled')),
  status text not null default 'trialing',
  trial_ends_at timestamptz not null default now() + interval '14 days',
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

-- Outbound message queue (email/SMS) — ported from v3.3
create table if not exists message_jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  client_id uuid references clients(id),
  transaction_id uuid references transactions(id),
  channel text not null check (channel in ('email','sms')),
  template text not null,
  payload jsonb not null default '{}',
  status text not null default 'queued'
    check (status in ('queued','sent','failed','skipped')),
  scheduled_for timestamptz not null default now(),
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Xero connections per organisation
create table if not exists xero_connections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) unique,
  tenant_id text not null,
  tenant_name text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table team_invitations enable row level security;
alter table billing_accounts enable row level security;
alter table message_jobs enable row level security;
alter table xero_connections enable row level security;

drop policy if exists "org rw invitations" on team_invitations;
create policy "org rw invitations" on team_invitations
  for all using (organisation_id = current_org());

drop policy if exists "org read billing" on billing_accounts;
create policy "org read billing" on billing_accounts
  for select using (organisation_id = current_org());

drop policy if exists "org rw message_jobs" on message_jobs;
create policy "org rw message_jobs" on message_jobs
  for all using (organisation_id = current_org());

drop policy if exists "org read xero" on xero_connections;
create policy "org read xero" on xero_connections
  for select using (organisation_id = current_org());
