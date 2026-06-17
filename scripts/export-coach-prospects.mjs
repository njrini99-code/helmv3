/**
 * Export the clean cold-outreach prospect list: every coach NOT at a current
 * customer school (Denison/Guilford/Hampden-Sydney/Shenandoah/Lynchburg) and
 * NOT Piedmont, with a deliverable email + a last name, excluding bounced and
 * suppressed addresses. Batched into 10s. Writes /tmp/coach-prospects.csv and
 * prints batch 1. Read-only. Run: node scripts/export-coach-prospects.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

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

const CUSTOMER_SCHOOLS = new Set([
  'Denison University', 'Guilford College', 'Hampden-Sydney College',
  'Shenandoah University', 'University of Lynchburg',
]);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const { data: coaches, error } = await supa
  .from('crm_coaches')
  .select('id, name, email, school, status, email_status, is_archived');
if (error) { console.error('fetch failed:', error.message); process.exit(1); }

const { data: supp } = await supa.from('crm_email_suppressions').select('email');
const suppressed = new Set((supp ?? []).map(s => (s.email || '').toLowerCase().trim()));

const sendable = (coaches ?? []).filter(c => {
  const school = (c.school || '').trim();
  if (!school) return false;
  if (CUSTOMER_SCHOOLS.has(school)) return false;
  if (/piedmont/i.test(school)) return false;
  if (c.is_archived) return false;
  if (!EMAIL_RE.test((c.email || '').trim())) return false;
  if ((c.email_status || 'valid') === 'bounced') return false;
  if (suppressed.has((c.email || '').toLowerCase().trim())) return false;
  if (!(c.name || '').trim().includes(' ')) return false; // need a last name
  return true;
}).sort((a, b) => (a.school || '').localeCompare(b.school || '') || (a.name || '').localeCompare(b.name || ''));

const rows = [['batch', 'name', 'email', 'school', 'status']];
sendable.forEach((c, i) => {
  rows.push([String(Math.floor(i / 10) + 1), c.name, c.email, c.school, c.status]);
});
const csv = rows.map(r => r.map(f => `"${String(f ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
writeFileSync('/tmp/coach-prospects.csv', csv);

console.log(`Sendable prospects: ${sendable.length}  (${Math.ceil(sendable.length / 10)} batches of 10)`);
console.log('CSV -> /tmp/coach-prospects.csv\n');
console.log('=== BATCH 1 ===');
sendable.slice(0, 10).forEach((c, i) => console.log(`${String(i + 1).padStart(2)}. ${c.name}  <${c.email}>  — ${c.school}`));
