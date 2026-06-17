/**
 * One-off TEST SEND: renders the College Programs HTML template exactly the way
 * the CRM bulk-send route does (same merge-tag substitution + Resend `html`
 * send) and delivers ONE copy to the operator's own inbox so Gmail / Apple Mail
 * rendering can be eyeballed before real outreach. Sends to a single hard-coded
 * self address only. Run: node scripts/test-send-college-template.mjs
 */
import { readFileSync } from 'node:fs';

const env = {};
for (const file of ['../.env.local', '../.env']) {
  try {
    for (const line of readFileSync(new URL(file, import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* file may not exist */ }
}

const apiKey = env.RESEND_API_KEY;
if (!apiKey) { console.error('Missing RESEND_API_KEY in env'); process.exit(1); }

const TO = 'njrini99@gmail.com';            // operator self-test inbox only
const FROM = env.HELM_FROM_EMAIL ?? 'Helm Sports Labs <admin@helmsportslabs.com>';

// Realistic sample recipient (mirrors the CRM route's personalization fields).
const r = {
  name: 'Nick Rini', first_name: 'Nick', last_name: 'Rini', email: TO,
  title: 'Head Coach', school: 'Denison', conference: 'NCAC', division: 'III',
  program: "Men's Golf", team_size: 9, current_software: '',
};

const subjectTpl = '{school} — one of 10 college programs we’re onboarding for 2026 / 2027';
let html = readFileSync(new URL('../public/email/college-programs-2026-27.html', import.meta.url), 'utf8');

// Same substitution set + order as src/app/api/admin/crm/send-email/route.ts
const sub = (s) => s
  .replace(/\{name\}/g, r.name)
  .replace(/\{first_name\}/g, r.first_name)
  .replace(/\{last_name\}/g, r.last_name)
  .replace(/\{email\}/g, r.email)
  .replace(/\{title\}/g, r.title)
  .replace(/\{school\}/g, r.school)
  .replace(/\{conference\}/g, r.conference)
  .replace(/\{division\}/g, r.division)
  .replace(/\{program\}/g, r.program)
  .replace(/\{team_size\}/g, String(r.team_size))
  .replace(/\{current_software\}/g, r.current_software);

const subject = '[TEST] ' + sub(subjectTpl);
html = sub(html)
  // Resend substitutes this token at real send time; point it somewhere sane for the test.
  .replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, 'https://helmsportslabs.com');

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({ from: FROM, to: [TO], subject, html }),
});

const text = await res.text();
if (!res.ok) { console.error(`Resend ${res.status}:`, text); process.exit(1); }
console.log(`✓ Sent to ${TO} from ${FROM}`);
console.log(`  subject: ${subject}`);
console.log(`  resend:  ${text}`);
