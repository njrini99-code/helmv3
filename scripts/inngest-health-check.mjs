#!/usr/bin/env node
// scripts/inngest-health-check.mjs — prove Inngest is accepting events AND
// executing the jobs behind them, against production, harmlessly.
//
// Usage:
//   node --env-file=/Users/ricknini/Downloads/helmv3/.env.local \
//     scripts/inngest-health-check.mjs
//
// `--env-file` on purpose (same reason as run-selfheal-repair.mjs): the keys
// are USED by this process and never copied into a file.
//
// WHY THIS EXISTS, AND WHY "the keys are set" IS NOT THE SAME ANSWER.
//
// `isInngestConfigured()` returns true when both variables EXIST. Production
// satisfied that for weeks while both credentials were being rejected:
//
//   INNGEST_EVENT_KEY    outbound. Rejected from 2026-07-27 with
//                        "Inngest API Error: 404 Event key not found".
//   INNGEST_SIGNING_KEY  inbound. Inngest calls /api/inngest to RUN a
//                        function; signature validation has failed since
//                        2026-08-07 (skew 1s, so key mismatch, not clock).
//
// The two fail INDEPENDENTLY, and this is the point: a successful send proves
// only the first. If the signing key is wrong the send still returns 200, the
// event is accepted, and the job never runs — which is exactly how scheduled
// reminders, coach insights and post-round processing went quiet while score
// entry (synchronous, through Supabase) kept working.
//
// So this reports the two halves SEPARATELY and never collapses them.
//
// Harmless: one event, one admin_events/error_logs row. No user data touched.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const EVENT_KEY = process.env.INNGEST_EVENT_KEY;
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WAIT_SECONDS = Number(process.env.PROBE_WAIT_SECONDS ?? 90);

function line(label, verdict, detail) {
  console.log(`  ${verdict.padEnd(12)} ${label.padEnd(22)} ${detail}`);
}

if (!EVENT_KEY) {
  console.error('\nINNGEST_EVENT_KEY is not set in the environment given to this script.');
  console.error('That is itself the finding: with no event key the app skips Inngest');
  console.error('entirely (isInngestConfigured() is false) and every durable job runs');
  console.error('inline with no retry and no crash recovery.\n');
  process.exit(2);
}
if (!SUPA_URL || !SUPA_KEY) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to read back the result.');
  process.exit(2);
}

const probeId = randomUUID();
const sentAt = new Date().toISOString();

console.log(`\nInngest health probe  ${probeId}\n`);

// ---- HALF 1: does Inngest ACCEPT an event from us? (INNGEST_EVENT_KEY) -----
let accepted = false;
try {
  const res = await fetch(`https://inn.gs/e/${EVENT_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'helm/health.ping', data: { probeId, sentAt } }),
  });
  const body = await res.text();
  accepted = res.ok;
  line('event accepted', accepted ? 'PASS' : 'FAIL',
    `HTTP ${res.status} ${body.slice(0, 160)}`);
  if (!accepted) {
    console.log('\n  -> INNGEST_EVENT_KEY is not valid for the Inngest app that serves this');
    console.log('     deployment. Copy the CURRENT event key from app.inngest.com into Vercel');
    console.log('     Production and REDEPLOY (Vercel bakes env vars in at build time).\n');
    process.exit(1);
  }
} catch (err) {
  line('event accepted', 'FAIL', String(err));
  process.exit(1);
}

// ---- HALF 2: did Inngest EXECUTE the job? (INNGEST_SIGNING_KEY) ------------
// The row can only exist if Inngest called back into /api/inngest and the
// signature validated. Nothing else writes this action.
const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
const deadline = Date.now() + WAIT_SECONDS * 1000;
let executed = false;

while (Date.now() < deadline) {
  const { data, error } = await supa
    .from('error_logs')
    .select('id, created_at, context')
    .eq('context->>action', 'inngest.health-probe')
    .gte('created_at', sentAt)
    .limit(50);

  if (error) { line('job executed', 'UNKNOWN', `read-back failed: ${error.message}`); process.exit(3); }

  if ((data ?? []).some((r) => r?.context?.metadata?.probeId === probeId)) { executed = true; break; }
  await new Promise((r) => setTimeout(r, 5000));
}

line('job executed', executed ? 'PASS' : 'FAIL',
  executed ? 'probe row written by the Inngest function'
           : `no row after ${WAIT_SECONDS}s`);

if (!executed) {
  console.log('\n  -> The event was ACCEPTED but the job did NOT run. That is the inbound');
  console.log('     half: Inngest calls /api/inngest to execute, and the signature is being');
  console.log('     rejected. Check error_logs for action=inngest.signatureValidation, then');
  console.log('     copy the CURRENT signing key from app.inngest.com into Vercel Production');
  console.log('     and REDEPLOY. This is the state that leaves score entry working while');
  console.log('     every background job silently does nothing.\n');
  process.exit(1);
}

console.log('\n  Inngest is accepting events AND executing jobs. Background work is live.\n');
