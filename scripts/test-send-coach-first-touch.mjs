/**
 * TEST SEND: pulls the live "Coach First Touch" template from crm_email_templates,
 * substitutes a sample coach, and sends ONE copy to the operator's own inbox the
 * exact way the CRM does for that format (text → Resend `text:`, html → `html:`).
 * Single hard-coded self address. Run: node scripts/test-send-coach-first-touch.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = {};
for (const file of ['../.env.local', '../.env']) {
  try {
    for (const line of readFileSync(new URL(file, import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* missing file */ }
}

const apiKey = env.RESEND_API_KEY;
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!apiKey || !url || !key) { console.error('Missing env (RESEND_API_KEY / Supabase)'); process.exit(1); }

const supa = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: tpl, error } = await supa.from('crm_email_templates')
  .select('subject, body, format').eq('name', 'Coach First Touch').single();
if (error || !tpl) { console.error('template fetch failed:', error?.message); process.exit(1); }

const TO = 'njrini99@gmail.com';
const FROM = env.HELM_FROM_EMAIL ?? 'Helm Sports Labs <admin@helmsportslabs.com>';
const r = { name: 'John Smith', first_name: 'John', last_name: 'Smith', email: TO,
  title: 'Head Coach', school: 'Maryville', conference: 'GLVC', division: 'II',
  program: "Men's Golf", team_size: 10, current_software: '' };
const sub = (s) => s
  .replace(/\{name\}/g, r.name).replace(/\{first_name\}/g, r.first_name)
  .replace(/\{last_name\}/g, r.last_name).replace(/\{email\}/g, r.email)
  .replace(/\{title\}/g, r.title).replace(/\{school\}/g, r.school)
  .replace(/\{conference\}/g, r.conference).replace(/\{division\}/g, r.division)
  .replace(/\{program\}/g, r.program).replace(/\{team_size\}/g, String(r.team_size))
  .replace(/\{current_software\}/g, r.current_software);

const subject = sub(tpl.subject);
const bodyOut = sub(tpl.body);
const payload = { from: FROM, to: [TO], subject };
if (tpl.format === 'text') payload.text = bodyOut; else payload.html = bodyOut;

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify(payload),
});
const text = await res.text();
if (!res.ok) { console.error(`Resend ${res.status}:`, text); process.exit(1); }
console.log(`✓ Sent "${subject}" (${tpl.format}) to ${TO}`);
console.log(`  resend: ${text}`);
