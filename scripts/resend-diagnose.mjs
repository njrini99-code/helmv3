/**
 * READ-ONLY Resend diagnostics — no email is sent. Checks whether the local
 * RESEND_API_KEY is present/valid and whether the from-domain is verified, to
 * explain a non-delivered test send. Run: node scripts/resend-diagnose.mjs
 */
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
console.log('RESEND_API_KEY present:', Boolean(apiKey));
if (apiKey) {
  console.log('  key prefix:', apiKey.slice(0, 4), '· length:', apiKey.length);
}
console.log('HELM_FROM_EMAIL:', env.HELM_FROM_EMAIL ?? '(default) Helm Sports Labs <admin@helmsportslabs.com>');
if (!apiKey) process.exit(0);

const res = await fetch('https://api.resend.com/domains', {
  headers: { Authorization: `Bearer ${apiKey}` },
});
const text = await res.text();
console.log('\nGET /domains ->', res.status);
try {
  const json = JSON.parse(text);
  const domains = json.data ?? json;
  if (Array.isArray(domains)) {
    for (const d of domains) {
      console.log(`  • ${d.name}  status=${d.status}  region=${d.region ?? '-'}  id=${d.id}`);
    }
    if (domains.length === 0) console.log('  (no domains configured on this key/account)');
  } else {
    console.log('  raw:', text.slice(0, 500));
  }
} catch {
  console.log('  raw:', text.slice(0, 500));
}
