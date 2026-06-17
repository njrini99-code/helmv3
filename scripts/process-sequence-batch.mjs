/**
 * HUMAN-TRIGGERED batch sender for the "Coach First Touch (Cold Outreach)" sequence.
 *
 * Sends the next N FRESH leads — and ONLY when you run it. No cron, no loop.
 *
 * Rules (set by the operator):
 *   - FRESH LEADS ONLY: a coach is eligible only while status='new_lead'. The moment
 *     they're emailed they flip to 'contacted' and leave the cold pool. Already
 *     contacted/engaged/proposal/won/lost coaches are stopped, never cold-emailed.
 *   - ONE EMAIL PER COACH PER WEEK (max): a 7-day frequency cap (built from real
 *     email_events) skips anyone emailed in the last 7 days.
 *   - ONE TOUCH: the enrollment is marked 'completed' on the first send. We do not
 *     auto-follow-up — we move on to fresh leads. (The sequence's later steps are
 *     intentionally not used by this sender.)
 *   - Ranked by customer-fit (see coach-priority.mjs), not alphabetically. Fresh
 *     leads have no prior-engagement signal, so this orders the never-contacted tail.
 *
 * On each send: logs to crm_contact_log (resend_message_id ties events back),
 * sets crm_coaches.status='contacted' + last_contacted_at, completes the enrollment.
 * Re-running can never double-send: sent coaches are 'contacted' + 'completed' + capped.
 *
 * Usage: node scripts/process-sequence-batch.mjs [N=40]
 *   N = how many emails to actually SEND this run (skips/stops don't count toward N).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { scoreCoach, tierOf, byPriority } from './coach-priority.mjs';

const env = {};
for (const file of ['../.env.local', '../.env']) {
  try {
    for (const line of readFileSync(new URL(file, import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* missing */ }
}
const apiKey = env.RESEND_API_KEY;
if (!apiKey) { console.error('Missing RESEND_API_KEY'); process.exit(1); }
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

const SEQUENCE_NAME = 'Coach First Touch (Cold Outreach)';
const FROM = env.HELM_FROM_EMAIL ?? 'Helm Sports Labs <admin@helmsportslabs.com>';
const N = Math.max(1, parseInt(process.argv[2] || '40', 10));
const nowIso = () => new Date().toISOString();

const { data: seq } = await supa.from('crm_sequences').select('id, is_active').eq('name', SEQUENCE_NAME).maybeSingle();
if (!seq) { console.error(`Sequence "${SEQUENCE_NAME}" not found — run setup-coach-sequence.mjs first.`); process.exit(1); }
if (!seq.is_active) { console.error('Sequence is paused (is_active=false) — not sending.'); process.exit(0); }

const { data: steps } = await supa.from('crm_sequence_steps')
  .select('id, step_order, delay_hours, template_id, subject_override, body_override')
  .eq('sequence_id', seq.id).order('step_order', { ascending: true });
const stepByOrder = new Map((steps ?? []).map(s => [s.step_order, s]));
const maxStep = Math.max(0, ...(steps ?? []).map(s => s.step_order));

// templates + suppressions up front
const tplIds = [...new Set((steps ?? []).map(s => s.template_id).filter(Boolean))];
const { data: tpls } = tplIds.length
  ? await supa.from('crm_email_templates').select('id, subject, body, format').in('id', tplIds)
  : { data: [] };
const tplById = new Map((tpls ?? []).map(t => [t.id, t]));
const { data: supp } = await supa.from('crm_email_suppressions').select('email');
const suppressed = new Set((supp ?? []).map(s => (s.email || '').toLowerCase().trim()));

// 7-DAY FREQUENCY CAP — at most one email per coach per week. Built from real send
// events so it holds regardless of which tool/session did the prior send.
const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
const recentlyEmailed = new Set();
for (let from = 0; ; from += 1000) {
  const { data: page } = await supa.from('email_events')
    .select('recipient_email, occurred_at')
    .in('event_type', ['email.sent', 'email.delivered'])
    .gte('occurred_at', sevenDaysAgo)
    .order('occurred_at', { ascending: true }).range(from, from + 999);
  for (const r of page ?? []) if (r.recipient_email) recentlyEmailed.add(r.recipient_email.toLowerCase().trim());
  if (!page || page.length < 1000) break;
}

// All active enrollments, then rank by send-priority (NOT alphabetical):
// warmest/most customer-like first — see coach-priority.mjs. Sending warm coaches
// first also lifts sender reputation for the colder tail.
// Paginate: PostgREST caps a response at 1000 rows, so a plain .select() would
// rank within only the first 1000 active and could skip the warmest coaches.
const active = [];
for (let from = 0; ; from += 1000) {
  const { data: page } = await supa.from('crm_sequence_enrollments')
    .select('id, coach_id, current_step, next_send_at, enrolled_at')
    .eq('sequence_id', seq.id).eq('status', 'active')
    .order('id', { ascending: true }).range(from, from + 999);
  active.push(...(page ?? []));
  if (!page || page.length < 1000) break;
}
const nowMs = Date.now();
const dueEnr = (active ?? []).filter(e => !e.next_send_at || new Date(e.next_send_at).getTime() <= nowMs);
if (!dueEnr.length) { console.log('Nothing due to send. All caught up.'); process.exit(0); }

// bulk-load the coaches for the due enrollments (one query, no per-row fetch)
const dueIds = [...new Set(dueEnr.map(e => e.coach_id))];
const coachById = new Map();
for (let i = 0; i < dueIds.length; i += 300) {
  const { data: rows } = await supa.from('crm_coaches')
    .select('id, name, email, school, title, conference, division, program, team_size, current_software, status, email_status, is_archived, last_email_event_type, last_contacted_at')
    .in('id', dueIds.slice(i, i + 300));
  for (const r of rows ?? []) coachById.set(r.id, r);
}

// score + rank
const ranked = dueEnr.map(en => {
  const c = coachById.get(en.coach_id) ?? null;
  const { score, reasons } = c ? scoreCoach(c) : { score: -1, reasons: ['coach missing'] };
  return { en, c, score, reasons, conference: c?.conference || '', enrolledAt: en.enrolled_at };
}).sort(byPriority);

const sub = (str, c) => {
  const parts = (c.name || '').trim().split(/\s+/);
  return (str || '')
    .replace(/\{name\}/g, c.name || '')
    .replace(/\{first_name\}/g, parts[0] || '')
    .replace(/\{last_name\}/g, parts.slice(1).join(' ') || parts[0] || '')
    .replace(/\{email\}/g, c.email || '')
    .replace(/\{school\}/g, c.school || '')
    .replace(/\{title\}/g, c.title || '').replace(/\{conference\}/g, c.conference || '')
    .replace(/\{division\}/g, c.division || '').replace(/\{program\}/g, c.program || '')
    .replace(/\{team_size\}/g, c.team_size != null ? String(c.team_size) : '')
    .replace(/\{current_software\}/g, c.current_software || '');
};

let sent = 0, stopped = 0, completed = 0, freqSkipped = 0; const failures = []; const sentTiers = {};
console.log(`Sequence "${SEQUENCE_NAME}" — ${dueEnr.length} due, sending up to ${N} FRESH leads (≤1/coach/week)...\n`);

for (const item of ranked) {
  if (sent >= N) break;
  const { en, c, score, reasons } = item;

  // ELIGIBILITY — cold outreach touches FRESH leads only. A coach leaves the cold
  // funnel the moment they're contacted/won/lost/etc. stop_reason must be a DB-allowed
  // value (replied|unsubscribed|bounced|manual|sequence_completed); keep a human label
  // for the console. Suppression list is the source of truth for unsubscribes.
  let stopReason = null, stopLabel = null;
  const st = (c?.status || '').toLowerCase();
  if (!c) { stopReason = 'manual'; stopLabel = 'coach missing'; }
  else if (c.is_archived) { stopReason = 'manual'; stopLabel = 'archived'; }
  else if (['won', 'lost'].includes(st)) { stopReason = 'manual'; stopLabel = 'sold/closed'; }
  else if (st && st !== 'new_lead') { stopReason = 'manual'; stopLabel = `already in pipeline (${st})`; }
  else if (['bounced', 'complained'].includes((c.email_status || '').toLowerCase())) { stopReason = 'bounced'; stopLabel = 'bounced/complained'; }
  else if (suppressed.has((c.email || '').toLowerCase().trim())) { stopReason = 'unsubscribed'; stopLabel = 'suppressed'; }
  if (stopReason) {
    await supa.from('crm_sequence_enrollments').update({ status: 'stopped', stopped_at: nowIso(), stop_reason: stopReason }).eq('id', en.id);
    stopped++; console.log(`  ⏹ ${c?.name ?? en.coach_id} — stopped (${stopLabel})`);
    continue;
  }

  // 7-DAY FREQUENCY CAP — never re-touch a coach within a week. Two independent
  // signals so a lagging/ missing Resend webhook can't let a retouch slip through:
  //   (a) crm_coaches.last_contacted_at (stamped synchronously on every send), and
  //   (b) a real send event in email_events in the last 7 days.
  // Skip (leave active for a later week); don't send, don't count toward N.
  const lastC = c.last_contacted_at ? new Date(c.last_contacted_at).getTime() : 0;
  const within7d = lastC > 0 && (nowMs - lastC) < 7 * 86400_000;
  if (within7d || recentlyEmailed.has((c.email || '').toLowerCase().trim())) { freqSkipped++; continue; }

  const step = stepByOrder.get(en.current_step + 1);
  if (!step) {
    await supa.from('crm_sequence_enrollments').update({ status: 'completed', completed_at: nowIso() }).eq('id', en.id);
    completed++; continue;
  }
  const tpl = step.template_id ? tplById.get(step.template_id) : null;
  const subject = sub(step.subject_override || tpl?.subject || '', c);
  const body = sub(step.body_override || tpl?.body || '', c);
  const isText = (tpl?.format || 'text') === 'text';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: FROM, to: [c.email], subject, ...(isText ? { text: body } : { html: body }) }),
    });
    const data = await res.json();
    if (!res.ok) { failures.push({ c, err: JSON.stringify(data) }); console.log(`  ✗ ${c.name} <${c.email}> — ${res.status}`); continue; }

    const ts = nowIso();
    await supa.from('crm_contact_log').insert({
      coach_id: c.id, contact_type: 'email', subject,
      // structured linkage lives in crm_sequence_enrollments; resend_message_id ties Resend events back here
      notes: `Sequence "${SEQUENCE_NAME}" step ${step.step_order} (Coach First Touch)`,
      resend_message_id: data.id, created_by: null,
    });
    // mark contacted — moves the coach OUT of the fresh-lead pool (the "sent" bucket)
    await supa.from('crm_coaches').update({ status: 'contacted', last_contacted_at: ts, updated_at: ts }).eq('id', c.id);
    // ONE TOUCH: complete the enrollment on first send; no auto-follow-up.
    await supa.from('crm_sequence_enrollments').update({
      current_step: step.step_order, status: 'completed', completed_at: ts, next_send_at: null, stop_reason: 'sequence_completed',
    }).eq('id', en.id);
    recentlyEmailed.add((c.email || '').toLowerCase().trim()); // guard against a same-run duplicate enrollment

    sent++;
    const tier = tierOf(score);
    sentTiers[tier] = (sentTiers[tier] || 0) + 1;
    console.log(`  ✓ [${tier} ${score}] ${c.name} <${c.email}> — ${c.school}  · ${reasons.join(', ')}`);
  } catch (e) {
    failures.push({ c, err: String(e) });
    console.log(`  ✗ ${c?.name} <${c?.email}> — ${e}`);
  }
  await new Promise(r => setTimeout(r, 600));
}

// how many active remain due after this run
const { count: remaining } = await supa.from('crm_sequence_enrollments')
  .select('id', { count: 'exact', head: true }).eq('sequence_id', seq.id).eq('status', 'active');
console.log(`\nDone: ${sent} sent, ${stopped} stopped, ${freqSkipped} skipped (emailed <7d ago), ${completed} auto-completed, ${failures.length} failed.`);
if (sent) console.log(`Tiers sent: ${Object.entries(sentTiers).sort().map(([t, n]) => `${t}=${n}`).join(', ')}`);
console.log(`Active enrollments still in the sequence: ${remaining ?? '?'}.`);
if (failures.length) console.log('Failures left active — they will retry on the next run.');
