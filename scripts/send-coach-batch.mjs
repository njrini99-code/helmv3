/**
 * Send ONE batch of 10 from the cold prospect list using the live
 * "Coach First Touch" template, the exact way the CRM does (per-recipient merge
 * → Resend `text:`), and log each to crm_contact_log + bump last_contacted_at so
 * the CRM's records stay intact. Honors the same exclusions/quality filter as
 * export-coach-prospects.mjs (customers + Piedmont out, valid email, last name,
 * not bounced, not suppressed).
 *
 * Usage: node scripts/send-coach-batch.mjs [size] [--apply]
 *   size     how many of the NEXT unsent coaches to email (default 10). It is a
 *            count, not a batch number: each run takes the next `size` coaches
 *            with no "Coach First Touch" log row, so re-running never repeats.
 *   --apply  actually send through Resend and write the CRM log. Without it the
 *            script is a DRY RUN: it reads the CRM, prints who it would email,
 *            and sends and writes nothing.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { cliGuard } from './lib/cli-guard.mjs';

const cli = cliGuard({
  name: 'scripts/send-coach-batch.mjs',
  summary:
    'Emails the next N unsent cold-outreach coaches with the live "Coach First Touch" template through Resend and logs each send to crm_contact_log. Reads the production CRM.',
  usage: '[size]',
  options: [['size', 'How many of the next unsent coaches to email (default 10, a count and not a batch number)']],
  secrets: 'RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL (.env.local)',
});

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
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
if (cli.apply && !apiKey) { console.error('Missing RESEND_API_KEY'); process.exit(1); }

// Count of coaches to send this run (default 10). Always sends the NEXT unsent
// coaches (those without a prior "Coach First Touch" contact-log row), so
// re-running can never double-email anyone.
const SIZE = parseInt(cli.positional[0] || '10', 10);
if (!Number.isInteger(SIZE) || SIZE < 1 || SIZE > 200) {
  console.error(`size must be a whole number from 1 to 200, got "${cli.positional[0]}".`);
  process.exit(2);
}
const FROM = env.HELM_FROM_EMAIL ?? 'Helm Sports Labs <admin@helmsportslabs.com>';
const CUSTOMER_SCHOOLS = new Set(['Denison University','Guilford College','Hampden-Sydney College','Shenandoah University','University of Lynchburg']);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const { data: tpl, error: tErr } = await supa.from('crm_email_templates')
  .select('id, subject, body, format').eq('name', 'Coach First Touch').single();
if (tErr || !tpl) { console.error('template fetch failed:', tErr?.message); process.exit(1); }
if (tpl.format !== 'text') { console.error(`Expected text format, got ${tpl.format} — aborting`); process.exit(1); }

const { data: coaches } = await supa.from('crm_coaches').select('id, name, email, school, status, email_status, is_archived');
const { data: supp } = await supa.from('crm_email_suppressions').select('email');
const suppressed = new Set((supp ?? []).map(s => (s.email || '').toLowerCase().trim()));
const { data: admin } = await supa.from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle();
const createdBy = admin?.id ?? null;

// Coaches already emailed this campaign (skip them — no double-sends).
const { data: already } = await supa.from('crm_contact_log')
  .select('coach_id').ilike('notes', '%Coach First Touch%');
const alreadySent = new Set((already ?? []).map(r => r.coach_id));

const sendable = (coaches ?? []).filter(c => {
  const s = (c.school || '').trim();
  return s && !CUSTOMER_SCHOOLS.has(s) && !/piedmont/i.test(s) && !c.is_archived
    && EMAIL_RE.test((c.email || '').trim()) && (c.email_status || 'valid') !== 'bounced'
    && !suppressed.has((c.email || '').toLowerCase().trim()) && (c.name || '').trim().includes(' ');
}).sort((a, b) => (a.school || '').localeCompare(b.school || '') || (a.name || '').localeCompare(b.name || ''));

const remaining = sendable.filter(c => !alreadySent.has(c.id));
const slice = remaining.slice(0, SIZE);
if (!slice.length) { console.error('Nothing left to send — all sendable coaches have received this campaign.'); process.exit(0); }

console.log(`${cli.apply ? 'Sending' : '[dry-run] Would send'} next ${slice.length} (${alreadySent.size} already sent, ${remaining.length} unsent remaining)...\n`);
const sub = (str, c) => {
  const parts = (c.name || '').trim().split(/\s+/);
  return str
    .replace(/\{name\}/g, c.name || '')
    .replace(/\{first_name\}/g, parts[0] || '')
    .replace(/\{last_name\}/g, parts.slice(1).join(' ') || parts[0] || '')
    .replace(/\{email\}/g, c.email)
    .replace(/\{school\}/g, c.school || '')
    .replace(/\{title\}/g, '').replace(/\{conference\}/g, '').replace(/\{division\}/g, '')
    .replace(/\{program\}/g, '').replace(/\{team_size\}/g, '').replace(/\{current_software\}/g, '');
};

let sent = 0; const failures = [];
for (const c of slice) {
  const subject = sub(tpl.subject, c);
  const text = sub(tpl.body, c);
  if (!cli.apply) {
    console.log(`  [dry-run] ${c.name} <${c.email}> — ${c.school} — "${subject}"`);
    continue;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: FROM, to: [c.email], subject, text }),
    });
    const data = await res.json();
    if (!res.ok) { failures.push({ c, err: JSON.stringify(data) }); console.log(`  ✗ ${c.name} <${c.email}> — ${res.status}`); continue; }
    const now = new Date().toISOString();
    await supa.from('crm_contact_log').insert({
      coach_id: c.id, contact_type: 'email', subject,
      notes: `Cold outreach: "${subject}" (Coach First Touch)`,
      resend_message_id: data.id, created_by: createdBy,
    });
    await supa.from('crm_coaches').update({ last_contacted_at: now, updated_at: now }).eq('id', c.id);
    sent++;
    console.log(`  ✓ ${c.name} <${c.email}> — ${c.school}  [${data.id}]`);
  } catch (e) {
    failures.push({ c, err: String(e) });
    console.log(`  ✗ ${c.name} <${c.email}> — ${e}`);
  }
  await new Promise(r => setTimeout(r, 600)); // gentle spacing within the batch
}
if (!cli.apply) {
  console.log(`\n[dry-run] ${slice.length} email(s) NOT sent and nothing written. Re-run with --apply to send them.`);
} else {
  console.log(`\nDone: ${sent} sent, ${failures.length} failed. ${remaining.length - sent} unsent remaining.`);
}
