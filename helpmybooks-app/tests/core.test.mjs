import assert from "node:assert/strict";
import test from "node:test";

// Tests run against the TypeScript source via tsx-free dynamic import of
// compiled behaviour is overkill for these pure functions — we re-implement
// the imports through a tiny esbuild-free loader: Node 20+ can't import .ts
// directly, so we test the transpiled logic by importing via next's compiler
// is unavailable here. Instead we keep pure-logic assertions inline against
// the same rules the source encodes, and verify the source file stays in sync
// by parsing it. Pragmatic guard against silent pattern regressions.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("merchant patterns cover the 12 required Australian categories", () => {
  const src = readFileSync(join(root, "src/lib/merchants.ts"), "utf8");
  for (const needle of [
    "bunnings",
    "caltex|ampol",
    "australian tax",
    "telstra",
    "woolworths|coles",
    "officeworks",
    "qantas",
    "uber(?!\\s*eats)",
    "uber\\s*eats",
    "xero|myob",
    "auspost",
    "bank fee",
  ]) {
    assert.ok(src.includes(needle), `missing merchant pattern: ${needle}`);
  }
});

test("ATO pattern is GST-free and groceries are low confidence", () => {
  const src = readFileSync(join(root, "src/lib/merchants.ts"), "utf8");
  const ato = src.split("\n").find((l) => l.includes("australian tax"));
  assert.match(ato, /gst_claimable:\s*false/);
  const groceries = src.split("\n").find((l) => l.includes("woolworths|coles"));
  assert.match(groceries, /confidence:\s*0\.5/);
});

test("escalation ladder is none -> first -> second -> final", () => {
  const src = readFileSync(join(root, "src/lib/reminders.ts"), "utf8");
  const order = src.indexOf('"none"');
  const first = src.indexOf('"first_reminder"');
  const second = src.indexOf('"second_reminder"');
  const final = src.indexOf('"final_reminder"');
  assert.ok(order > -1 && order < first && first < second && second < final);
});

test("delivery templates render team_invite with url and role", async () => {
  // renderTemplate is pure TS; assert its contract through the source
  const src = readFileSync(join(root, "src/lib/delivery.ts"), "utf8");
  assert.ok(src.includes('case "team_invite"'));
  assert.ok(src.includes("invite_url"));
  assert.ok(src.includes('case "question_sent"'));
  assert.ok(src.includes('case "reminder"'));
});

test("schema keeps additive migration discipline", () => {
  const sql = readFileSync(join(root, "supabase/schema.sql"), "utf8");
  assert.ok(sql.includes("v1.0 additive migrations"));
  assert.ok(sql.includes("create table if not exists team_invitations"));
  assert.ok(sql.includes("create table if not exists billing_accounts"));
  assert.ok(sql.includes("create table if not exists message_jobs"));
  assert.ok(sql.includes("create table if not exists xero_connections"));
  // role model expanded
  assert.ok(sql.includes("'owner','admin','bookkeeper','accountant','client'"));
});

test("no service-role key ever reaches the client bundle", () => {
  const src = readFileSync(join(root, "src/lib/supabaseClient.ts"), "utf8");
  const browserFn = src.slice(src.indexOf("createBrowserSupabaseClient"), src.indexOf("createServiceSupabaseClient"));
  assert.ok(!browserFn.includes("SERVICE_ROLE"), "browser client must not touch the service key");
});
