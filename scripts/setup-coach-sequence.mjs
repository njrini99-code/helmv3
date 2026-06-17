/**
 * Set up the human-triggered "Coach First Touch" safe sequence — PURE DATA, NO SENDS.
 *
 * Creates (idempotently):
 *   1. a crm_sequences row  (trigger_kind 'manual', is_active true)
 *   2. one step             (step_order 1, delay_hours 0, the text template)
 *   3. an enrollment per sendable coach:
 *        - the 10 already emailed in batch 1  -> status 'completed' (current_step 1)
 *        - everyone else still to send         -> status 'active'    (current_step 0, next_send_at now)
 *
 * This NEVER sends email. Sends happen only when you run scripts/process-sequence-batch.mjs.
 * The data lets the CRM's Sequences tab show "sent vs. still-to-send" and lets Resend
 * delivery/bounce/complaint events keep flowing into the same coaches.
 *
 * Safe to re-run: reuses the sequence/step by name, only inserts enrollments for
 * coaches not already enrolled, and promotes any batch-1 coach left 'active' to 'completed'.
 * No deletes anywhere.
 *
 * Run: node scripts/setup-coach-sequence.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { scoreCoach, tierOf } from './coach-priority.mjs';

const env = {};
for (const file of ['../.env.local', '../.env']) {
  try {
    for (const line of readFileSync(new URL(file, import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* missing */ }
}
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

const SEQUENCE_NAME = 'Coach First Touch (Cold Outreach)';
const TEMPLATE_NAME = 'Coach First Touch';
const ADMIN_EMAIL = 'admin@helmsportslabs.com';
const CUSTOMER_SCHOOLS = new Set(['Denison University','Guilford College','Hampden-Sydney College','Shenandoah University','University of Lynchburg']);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const now = new Date().toISOString();

// priority metadata stored on each enrollment (for CRM visibility + ordering)
const metaFor = (c, extra = {}) => {
  const { score, reasons } = scoreCoach(c);
  return { priority_score: score, tier: tierOf(score), conference: c.conference ?? null,
    division: c.division != null ? String(c.division) : null, engagement: c.last_email_event_type ?? null, reasons, ...extra };
};

// --- resolve the operator (enrolled_by / created_by are NOT NULL, no FK) ---
const { data: admin } = await supa.from('users').select('id').eq('email', ADMIN_EMAIL).maybeSingle();
const ADMIN_ID = admin?.id ?? 'b9673959-1c90-405b-93f7-b468a9f4daa3';

// --- template ---
const { data: tpl, error: tErr } = await supa.from('crm_email_templates')
  .select('id, format').eq('name', TEMPLATE_NAME).single();
if (tErr || !tpl) { console.error('template fetch failed:', tErr?.message); process.exit(1); }
if (tpl.format !== 'text') { console.error(`Expected text template, got ${tpl.format} — aborting`); process.exit(1); }

// --- 1. sequence (reuse by name) ---
let { data: seq } = await supa.from('crm_sequences').select('id').eq('name', SEQUENCE_NAME).maybeSingle();
if (!seq) {
  const ins = await supa.from('crm_sequences').insert({
    name: SEQUENCE_NAME,
    description: 'Single-touch cold intro to college golf coaches. Human-triggered — sends fire only via scripts/process-sequence-batch.mjs.',
    trigger_kind: 'manual', is_active: true, created_by: ADMIN_ID,
  }).select('id').single();
  if (ins.error) { console.error('sequence insert failed:', ins.error.message); process.exit(1); }
  seq = ins.data;
  console.log(`✓ created sequence "${SEQUENCE_NAME}"  [${seq.id}]`);
} else {
  console.log(`• reusing sequence "${SEQUENCE_NAME}"  [${seq.id}]`);
}

// --- 2. step 1 (reuse by sequence_id + step_order) ---
let { data: step } = await supa.from('crm_sequence_steps')
  .select('id').eq('sequence_id', seq.id).eq('step_order', 1).maybeSingle();
if (!step) {
  const ins = await supa.from('crm_sequence_steps').insert({
    sequence_id: seq.id, step_order: 1, delay_hours: 0, template_id: tpl.id,
  }).select('id').single();
  if (ins.error) { console.error('step insert failed:', ins.error.message); process.exit(1); }
  step = ins.data;
  console.log(`✓ created step 1 (text template)  [${step.id}]`);
} else {
  console.log(`• reusing step 1  [${step.id}]`);
}

// --- compute the sendable universe (identical filter to export/send scripts) ---
const { data: coaches } = await supa.from('crm_coaches')
  .select('id, name, email, school, email_status, is_archived, conference, division, status, last_email_event_type');
const coachById = new Map((coaches ?? []).map(c => [c.id, c]));
const { data: supp } = await supa.from('crm_email_suppressions').select('email');
const suppressed = new Set((supp ?? []).map(s => (s.email || '').toLowerCase().trim()));
const sendable = (coaches ?? []).filter(c => {
  const s = (c.school || '').trim();
  return s && !CUSTOMER_SCHOOLS.has(s) && !/piedmont/i.test(s) && !c.is_archived
    && !['won', 'lost'].includes((c.status || ''))
    && EMAIL_RE.test((c.email || '').trim()) && (c.email_status || 'valid') !== 'bounced'
    && !suppressed.has((c.email || '').toLowerCase().trim()) && (c.name || '').trim().includes(' ');
});

// already emailed in batch 1 -> these enroll as completed
const { data: already } = await supa.from('crm_contact_log').select('coach_id').ilike('notes', '%Coach First Touch%');
const alreadySent = new Set((already ?? []).map(r => r.coach_id));

// existing enrollments for this sequence (idempotency)
const { data: existing } = await supa.from('crm_sequence_enrollments').select('coach_id, status').eq('sequence_id', seq.id);
const enrolledBy = new Map((existing ?? []).map(e => [e.coach_id, e.status]));

const toInsert = [];
let promoteCompleted = 0;
for (const c of sendable) {
  const sent = alreadySent.has(c.id);
  if (enrolledBy.has(c.id)) {
    // already enrolled — only fix a batch-1 coach still marked active
    if (sent && enrolledBy.get(c.id) === 'active') {
      await supa.from('crm_sequence_enrollments').update({
        status: 'completed', current_step: 1, next_send_at: null, completed_at: now, stop_reason: 'sequence_completed',
      }).eq('sequence_id', seq.id).eq('coach_id', c.id);
      promoteCompleted++;
    }
    continue;
  }
  toInsert.push(sent
    ? { sequence_id: seq.id, coach_id: c.id, status: 'completed', current_step: 1, next_send_at: null,
        completed_at: now, stop_reason: 'sequence_completed', enrolled_by: ADMIN_ID, metadata: metaFor(c, { preenrolled_from: 'batch_1' }) }
    : { sequence_id: seq.id, coach_id: c.id, status: 'active', current_step: 0, next_send_at: now,
        enrolled_by: ADMIN_ID, metadata: metaFor(c) });
}

// chunked insert (no upsert/delete — pure inserts of new rows only)
let inserted = 0;
for (let i = 0; i < toInsert.length; i += 200) {
  const chunk = toInsert.slice(i, i + 200);
  const { error } = await supa.from('crm_sequence_enrollments').insert(chunk);
  if (error) { console.error('enrollment insert failed:', error.message); process.exit(1); }
  inserted += chunk.length;
}

// backfill priority metadata onto enrollments created before scoring existed (idempotent UPDATE)
const { data: activeRows } = await supa.from('crm_sequence_enrollments')
  .select('id, coach_id, metadata').eq('sequence_id', seq.id).eq('status', 'active');
const needScore = (activeRows ?? []).filter(e => e.metadata?.priority_score == null && coachById.has(e.coach_id));
let backfilled = 0;
for (let i = 0; i < needScore.length; i += 25) {
  await Promise.all(needScore.slice(i, i + 25).map(e =>
    supa.from('crm_sequence_enrollments').update({ metadata: metaFor(coachById.get(e.coach_id)) }).eq('id', e.id)));
  backfilled += Math.min(25, needScore.length - i);
}
if (backfilled) console.log(`✓ backfilled priority score onto ${backfilled} existing active enrollment(s)`);

const newCompleted = toInsert.filter(r => r.status === 'completed').length;
const newActive = toInsert.filter(r => r.status === 'active').length;
console.log(`\n✓ enrollments: +${inserted} new (${newActive} active, ${newCompleted} completed)` +
  (promoteCompleted ? `, ${promoteCompleted} promoted active→completed` : ''));
console.log(`  sendable universe: ${sendable.length}  |  already enrolled before this run: ${enrolledBy.size}`);

// final tally + send-order preview straight from the DB
const { data: tally } = await supa.from('crm_sequence_enrollments')
  .select('status, metadata, coach_id').eq('sequence_id', seq.id);
const counts = (tally ?? []).reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
console.log(`\nSequence "${SEQUENCE_NAME}" now holds:`);
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(10)} ${v}`);

const activeScored = (tally ?? []).filter(r => r.status === 'active')
  .map(r => ({ score: r.metadata?.priority_score ?? 0, tier: r.metadata?.tier ?? 'D_cold', coach: coachById.get(r.coach_id) }))
  .sort((a, b) => b.score - a.score);
const tierDist = activeScored.reduce((a, r) => (a[r.tier] = (a[r.tier] || 0) + 1, a), {});
console.log(`\nActive send queue by tier (warmest first): ${Object.entries(tierDist).sort().map(([t, n]) => `${t}=${n}`).join(', ')}`);
console.log('Next up:');
for (const r of activeScored.slice(0, 8)) console.log(`  [${r.tier} ${r.score}] ${r.coach?.name ?? '?'} — ${r.coach?.school ?? '?'} (${r.coach?.conference ?? '?'})`);
console.log(`\nNO emails were sent. To send the next batch:  node scripts/process-sequence-batch.mjs 10`);
