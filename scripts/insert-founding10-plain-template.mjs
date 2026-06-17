/**
 * Upsert the "Founding 10 — First Touch (Text)" cold-outreach template into
 * crm_email_templates as a TRUE text/plain template (format='text'): no HTML,
 * no logo shell — the body is sent verbatim as text/plain. Simple, human, and
 * personalized per coach ({last_name}, {school}); this is the version that
 * lands in Gmail Primary and earns replies.
 *
 * Idempotent + migrates the older '(Plain)' row to this one in place (no dupes).
 * Run: node scripts/insert-founding10-plain-template.mjs
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
  } catch { /* missing file */ }
}

// Self-contained plain-text note — its own greeting + sign-off (no shell adds them).
// Short, casual, one bare link (clients auto-link it). Adapts via {last_name}/{school}.
const body = `Hey Coach {last_name},

I'm Nick — I help run GolfHelm, an app built for college golf. Rounds, stats, qualifiers, scheduling, all in one place.

We're only taking on 10 programs this year, and I'd love {school} to be one of them.

If you've got a few minutes, here's my calendar:
https://calendar.app.google/s9DBb3bKD2teLLBT7

Or just reply — happy to answer anything.

Nick`;

const template = {
  name: 'Founding 10 — First Touch (Text)',
  subject: '{school} golf',
  body,
  category: 'cold_outreach',
  format: 'text',
  merge_tags: ['last_name', 'school'],
  is_default: false,
};

const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing Supabase URL / service role key'); process.exit(1); }
const supa = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// Find this row OR the older '(Plain)' row to convert in place.
const { data: rows, error: selErr } = await supa
  .from('crm_email_templates').select('id, name')
  .in('name', ['Founding 10 — First Touch (Text)', 'Founding 10 — First Touch (Plain)']);
if (selErr) { console.error('select failed:', selErr.message); process.exit(1); }

const target = rows?.[0];
if (target) {
  const { error } = await supa.from('crm_email_templates')
    .update({ ...template, updated_at: new Date().toISOString() }).eq('id', target.id);
  if (error) { console.error('update failed:', error.message); process.exit(1); }
  console.log(`✓ Updated template ${target.id} (was "${target.name}") → text/plain`);
  // Drop any leftover duplicate (e.g. both Text + Plain existed)
  for (const r of rows.slice(1)) {
    await supa.from('crm_email_templates').delete().eq('id', r.id);
    console.log(`  removed duplicate ${r.id} ("${r.name}")`);
  }
} else {
  const { data, error } = await supa.from('crm_email_templates')
    .insert(template).select('id').single();
  if (error) { console.error('insert failed:', error.message); process.exit(1); }
  console.log(`✓ Inserted template ${data.id} (text/plain)`);
}

// Local preview: exactly what the recipient sees (text, sample coach).
const preview = body.replace(/\{last_name\}/g, 'Rini').replace(/\{school\}/g, 'Denison');
writeFileSync('/tmp/founding10-text-preview.txt', `Subject: ${template.subject.replace(/\{school\}/g, 'Denison')}\n\n${preview}\n`);
console.log('  preview -> /tmp/founding10-text-preview.txt');
