/**
 * Free, pre-send email hygiene check for crm_coaches — catches the bounces you can
 * predict BEFORE you send (and before they hurt sender reputation), without a paid
 * verification service.
 *
 * What it checks per address:
 *   - syntax (RFC-ish regex)
 *   - the domain actually resolves mail (MX records, or an A record as fallback)
 *   - obvious disposable/typo domains (small blocklist)
 * It does NOT ping the mailbox (that needs a paid SMTP-probe service like ZeroBounce);
 * it only flags addresses that will almost certainly bounce (bad syntax / dead domain).
 *
 * DEFAULT = DRY RUN (reports, changes nothing). Pass --apply to add the
 * definitively-bad addresses to crm_email_suppressions (reason 'mx_precheck'), which
 * the sequence sender + setup already honor — so they're skipped, not deleted, and
 * email_status is left untouched. Non-destructive.
 *
 * Run: node scripts/verify-coach-emails.mjs            (dry run)
 *      node scripts/verify-coach-emails.mjs --apply    (suppress the bad ones)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolveMx, resolve4 } from 'node:dns/promises';

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

const APPLY = process.argv.includes('--apply');
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DISPOSABLE = new Set(['mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com','trashmail.com','yopmail.com']);

const { data: coaches } = await supa.from('crm_coaches')
  .select('id, email, email_status, is_archived')
  .neq('email_status', 'bounced');
const { data: supp } = await supa.from('crm_email_suppressions').select('email');
const alreadySuppressed = new Set((supp ?? []).map(s => (s.email || '').toLowerCase().trim()));

const candidates = (coaches ?? []).filter(c =>
  !c.is_archived && (c.email || '').trim() && !alreadySuppressed.has((c.email || '').toLowerCase().trim()));

// classify syntax + collect unique domains for one MX lookup each
const byDomain = new Map();
const badSyntax = [];
for (const c of candidates) {
  const email = c.email.trim();
  if (!EMAIL_RE.test(email)) { badSyntax.push(c); continue; }
  const domain = email.split('@')[1].toLowerCase();
  if (!byDomain.has(domain)) byDomain.set(domain, []);
  byDomain.get(domain).push(c);
}

console.log(`Checking ${candidates.length} addresses across ${byDomain.size} domains${APPLY ? '  [APPLY MODE]' : '  [dry run]'}...\n`);

// resolve each unique domain once (concurrency-limited)
const domains = [...byDomain.keys()];
const deadDomains = new Set();
const dispDomains = new Set();
for (let i = 0; i < domains.length; i += 20) {
  await Promise.all(domains.slice(i, i + 20).map(async (d) => {
    if (DISPOSABLE.has(d)) { dispDomains.add(d); return; }
    try {
      const mx = await resolveMx(d).catch(() => []);
      if (mx && mx.length) return; // has mail servers — good
      const a = await resolve4(d).catch(() => []);
      if (a && a.length) return; // A-record fallback — acceptable
      deadDomains.add(d);
    } catch { deadDomains.add(d); }
  }));
}

const badDomainCoaches = [];
for (const d of [...deadDomains, ...dispDomains]) for (const c of byDomain.get(d) || []) badDomainCoaches.push(c);

const bad = [...badSyntax, ...badDomainCoaches];
console.log(`Results:`);
console.log(`  ✓ deliverable-looking: ${candidates.length - bad.length}`);
console.log(`  ✗ bad syntax:          ${badSyntax.length}`);
console.log(`  ✗ dead/disposable domain: ${badDomainCoaches.length} (${deadDomains.size} dead + ${dispDomains.size} disposable domains)`);
if (deadDomains.size) console.log(`\n  Dead domains: ${[...deadDomains].slice(0, 30).join(', ')}${deadDomains.size > 30 ? ' …' : ''}`);
if (badSyntax.length) console.log(`  Bad-syntax sample: ${badSyntax.slice(0, 10).map(c => c.email).join(', ')}`);

if (!bad.length) { console.log('\nNothing to flag — list is clean.'); process.exit(0); }

if (!APPLY) {
  console.log(`\n[dry run] ${bad.length} address(es) would be suppressed (reason 'mx_precheck'). Re-run with --apply to suppress them.`);
  process.exit(0);
}

const rows = bad.map(c => ({ email: c.email.toLowerCase().trim(), reason: 'invalid', source: 'system',
  metadata: { coach_id: c.id, note: 'mx_precheck: no MX/A record or bad syntax — predicted bounce' } }));
let inserted = 0;
for (let i = 0; i < rows.length; i += 100) {
  // pre-filtered against existing suppressions above, so a plain insert is safe (no unique index on email)
  const { error } = await supa.from('crm_email_suppressions').insert(rows.slice(i, i + 100));
  if (error) { console.error('suppression insert failed:', error.message); process.exit(1); }
  inserted += rows.slice(i, i + 100).length;
}
console.log(`\n✓ Suppressed ${inserted} predicted-bounce address(es). They'll be skipped on the next setup + send (no rows deleted).`);
