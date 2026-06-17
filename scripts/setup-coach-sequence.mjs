/**
 * Set up the human-triggered "Coach First Touch" safe sequence — PURE DATA, NO SENDS.
 *
 * Creates / maintains (idempotently):
 *   1. a crm_sequences row  (trigger_kind 'manual', is_active true)
 *   2. one step             (step_order 1, delay_hours 0, the text template)
 *   3. an enrollment per TARGET coach (see below):
 *        - the ones already emailed   -> status 'completed' (current_step 1)
 *        - everyone else still to send -> status 'active'    (current_step 0, next_send_at now)
 *
 * TARGET = the HIGHEST-LEVEL coach for the men's slot AND for the women's slot, per school.
 *   Each school has up to two slots: a men's head and a women's head. A coach whose
 *   program is 'both' is eligible for BOTH slots; if the same person wins both, they
 *   are emailed once. The 'both' label is applied inconsistently in the data (sometimes
 *   a genuine combined head, sometimes a single-program head, sometimes an ops/admin
 *   staffer), so we never trust it as its own bucket — we let the real men's/women's
 *   head win each slot. Role precedence within a slot:
 *     head_coach > associate_head_coach > director > unknown > assistant_coach > volunteer
 *   ties break to the program-specific coach over a 'both' coach, then is_primary_contact,
 *   then name. This keeps assistants / directors of operations / untitled extras from ever
 *   displacing a head. If a slot's only coach on file is an assistant, that assistant is
 *   the best available contact and is kept.
 *
 * This NEVER sends email. Sends happen only when you run scripts/process-sequence-batch.mjs.
 *
 * Safe to re-run (no deletes anywhere):
 *   - reuses the sequence/step by name
 *   - inserts enrollments only for target coaches not already enrolled
 *   - promotes any already-emailed coach left 'active' to 'completed'
 *   - DEMOTES active enrollments whose coach is no longer a target (e.g. an assistant
 *     enrolled before this rule existed, or a coach since marked won/lost/suppressed)
 *     to status 'stopped' / stop_reason 'manual' — the row is preserved, just pulled
 *     out of the send queue.
 *
 * Paginates every read: PostgREST caps a single response at 1000 rows regardless of
 * .limit(), so a plain .select() silently saw only the first 1000 coaches.
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
const CUSTOMER_SCHOOLS = new Set(['denison university','guilford college','hampden-sydney college','shenandoah university','university of lynchburg']);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const now = new Date().toISOString();

// Role precedence — lower rank wins as the school/program's primary contact.
const ROLE_RANK = { head_coach: 0, associate_head_coach: 1, director: 2, unknown: 3, assistant_coach: 4, volunteer: 5 };
const rankOf = (c) => (c.role_level != null && c.role_level in ROLE_RANK) ? ROLE_RANK[c.role_level] : 6;

// priority metadata stored on each enrollment (for CRM visibility + ordering)
const metaFor = (c, extra = {}) => {
  const { score, reasons } = scoreCoach(c);
  return { priority_score: score, tier: tierOf(score), conference: c.conference ?? null,
    division: c.division != null ? String(c.division) : null, program: c.program ?? null,
    role_level: c.role_level ?? null, engagement: c.last_email_event_type ?? null, reasons, ...extra };
};

// Paginated fetch — PostgREST hard-caps responses at 1000 rows; page by id range.
async function fetchAll(table, columns, applyFilters) {
  const out = []; const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supa.from(table).select(columns).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) { console.error(`${table} fetch failed:`, error.message); process.exit(1); }
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

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
    description: 'Single-touch cold intro to college golf coaches. Human-triggered — sends fire only via scripts/process-sequence-batch.mjs. Targets the highest-level coach per school+program (no assistants).',
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

// --- compute the sendable universe (paginated) ---
const coaches = await fetchAll('crm_coaches',
  'id, name, email, school, title, email_status, is_archived, conference, division, program, role_level, is_primary_contact, status, last_email_event_type');
const coachById = new Map(coaches.map(c => [c.id, c]));
const suppRows = await fetchAll('crm_email_suppressions', 'id, email');
const suppressed = new Set(suppRows.map(s => (s.email || '').toLowerCase().trim()));

// Cold outreach targets FRESH leads only: status must be 'new_lead'. The instant a
// coach is emailed they flip to 'contacted' (see process-sequence-batch.mjs) and drop
// out of the sendable universe, so re-running this never re-enrolls anyone we've touched.
const isSendable = (c) => {
  const s = (c.school || '').trim();
  return s && !CUSTOMER_SCHOOLS.has(s.toLowerCase()) && !/piedmont/i.test(s) && !c.is_archived
    && (c.status || '') === 'new_lead'
    && EMAIL_RE.test((c.email || '').trim()) && (c.email_status || 'valid') !== 'bounced'
    && !suppressed.has((c.email || '').toLowerCase().trim()) && (c.name || '').trim().includes(' ');
};

// Pick the highest-level contact for the men's slot and the women's slot per school.
// A 'both' coach is eligible for both slots; same winner of both => emailed once.
const bySchool = new Map();
for (const c of coaches) {
  if (!isSendable(c)) continue;
  const k = (c.school || '').trim().toLowerCase();
  if (!bySchool.has(k)) bySchool.set(k, []);
  bySchool.get(k).push(c);
}
const bestForSlot = (cands, slot) => cands.slice().sort((a, b) =>
  rankOf(a) - rankOf(b)                                                  // head beats assistant/ops
  || ((a.program === slot ? 0 : 1) - (b.program === slot ? 0 : 1))       // program-specific beats 'both'
  || ((b.is_primary_contact === true ? 1 : 0) - (a.is_primary_contact === true ? 1 : 0))
  || (a.name || '').localeCompare(b.name || ''))[0];
const targetMap = new Map();
for (const [, list] of bySchool) {
  const mens = list.filter(c => c.program === 'mens' || c.program === 'both');
  const womens = list.filter(c => c.program === 'womens' || c.program === 'both');
  if (mens.length) { const p = bestForSlot(mens, 'mens'); targetMap.set(p.id, p); }
  if (womens.length) { const p = bestForSlot(womens, 'womens'); targetMap.set(p.id, p); }
}
const targets = [...targetMap.values()];
const targetIds = new Set(targetMap.keys());

// already emailed (this campaign) -> these enroll/stay 'completed'
const alreadyRows = await fetchAll('crm_contact_log', 'id, coach_id', q => q.ilike('notes', '%Coach First Touch%'));
const alreadySent = new Set(alreadyRows.map(r => r.coach_id));

// existing enrollments for this sequence (idempotency + reconciliation)
const existing = await fetchAll('crm_sequence_enrollments', 'id, coach_id, status', q => q.eq('sequence_id', seq.id));
const enrolledBy = new Map(existing.map(e => [e.coach_id, e.status]));

// --- inserts: target coaches not yet enrolled ---
const toInsert = [];
let promoteCompleted = 0;
for (const c of targets) {
  const sent = alreadySent.has(c.id);
  if (enrolledBy.has(c.id)) {
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
        completed_at: now, stop_reason: 'sequence_completed', enrolled_by: ADMIN_ID, metadata: metaFor(c, { preenrolled: 'already_emailed' }) }
    : { sequence_id: seq.id, coach_id: c.id, status: 'active', current_step: 0, next_send_at: now,
        enrolled_by: ADMIN_ID, metadata: metaFor(c) });
}
let inserted = 0;
for (let i = 0; i < toInsert.length; i += 200) {
  const chunk = toInsert.slice(i, i + 200);
  const { error } = await supa.from('crm_sequence_enrollments').insert(chunk);
  if (error) { console.error('enrollment insert failed:', error.message); process.exit(1); }
  inserted += chunk.length;
}

// --- reconcile: demote ACTIVE enrollments whose coach is no longer a target ---
// (assistants enrolled before this rule, or coaches since marked won/lost/suppressed/bounced).
// Non-destructive: status -> 'stopped', stop_reason 'manual'. Completed/stopped rows untouched.
const demoteRows = existing.filter(e => e.status === 'active' && !targetIds.has(e.coach_id));
const completeIds = [], stopIds = [];
for (const e of demoteRows) {
  const cs = coachById.get(e.coach_id)?.status || 'new_lead';
  // coach has progressed past new_lead (emailed -> contacted, or worked) => completed;
  // still a fresh new_lead but not the top-of-program contact (assistant/ops) => stopped.
  if (cs !== 'new_lead') completeIds.push(e.id); else stopIds.push(e.id);
}
let completedDemote = 0, demoted = 0;
for (let i = 0; i < completeIds.length; i += 200) {
  const chunk = completeIds.slice(i, i + 200);
  const { error } = await supa.from('crm_sequence_enrollments')
    .update({ status: 'completed', completed_at: now, stop_reason: 'sequence_completed' }).in('id', chunk);
  if (error) { console.error('demote->completed failed:', error.message); process.exit(1); }
  completedDemote += chunk.length;
}
for (let i = 0; i < stopIds.length; i += 200) {
  const chunk = stopIds.slice(i, i + 200);
  const { error } = await supa.from('crm_sequence_enrollments')
    .update({ status: 'stopped', stopped_at: now, stop_reason: 'manual' }).in('id', chunk);
  if (error) { console.error('demotion update failed:', error.message); process.exit(1); }
  demoted += chunk.length;
}

// backfill priority metadata onto active enrollments created before scoring existed
const activeRows = await fetchAll('crm_sequence_enrollments', 'id, coach_id, metadata', q => q.eq('sequence_id', seq.id).eq('status', 'active'));
const needScore = activeRows.filter(e => e.metadata?.priority_score == null && coachById.has(e.coach_id));
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
  (promoteCompleted ? `, ${promoteCompleted} promoted active→completed` : '') +
  (completedDemote ? `, ${completedDemote} active→completed (already contacted)` : '') +
  (demoted ? `, ${demoted} active→stopped (not top-of-program)` : ''));
console.log(`  target (men's-head + women's-head per school): ${targets.length}  |  schools: ${bySchool.size}  |  enrolled before run: ${enrolledBy.size}`);

// final tally + send-order preview straight from the DB
const tally = await fetchAll('crm_sequence_enrollments', 'id, status, metadata, coach_id', q => q.eq('sequence_id', seq.id));
const counts = tally.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
console.log(`\nSequence "${SEQUENCE_NAME}" now holds:`);
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(10)} ${v}`);

const activeScored = tally.filter(r => r.status === 'active')
  .map(r => ({ score: r.metadata?.priority_score ?? 0, tier: r.metadata?.tier ?? 'D_cold', coach: coachById.get(r.coach_id) }))
  .sort((a, b) => b.score - a.score);
const tierDist = activeScored.reduce((a, r) => (a[r.tier] = (a[r.tier] || 0) + 1, a), {});
console.log(`\nActive send queue by tier (warmest first): ${Object.entries(tierDist).sort().map(([t, n]) => `${t}=${n}`).join(', ')}`);
console.log('Next up:');
for (const r of activeScored.slice(0, 10)) console.log(`  [${r.tier} ${r.score}] ${r.coach?.name ?? '?'} — ${r.coach?.title ?? '?'} · ${r.coach?.school ?? '?'} (${r.coach?.program ?? '?'})`);
console.log(`\nNO emails were sent. To send the next batch:  node scripts/process-sequence-batch.mjs 10`);
