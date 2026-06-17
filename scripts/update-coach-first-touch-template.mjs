/**
 * Set the cold first-touch template ("Coach First Touch") to TRUE text/plain
 * (format='text', no logo, no HTML shell) — the version that lands in Gmail
 * Primary. Same casual personalized copy + calendar link, text-only signature.
 * Idempotent. Writes /tmp/coach-first-touch-text-preview.txt.
 * Run: node scripts/update-coach-first-touch-template.mjs
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

// Self-contained plain text (own greeting + sign-off). Straight apostrophes,
// no em-dashes, one bare link (clients auto-link), text-only signature.
const body = `Hi Coach {last_name},

Wanted to reach out. We just welcomed our 10th coach onto GolfHelm, so we now have programs across every level of the NCAA since launching last week.

The biggest thing coaches keep telling us is how convenient it is having team management, shot tracking, and stats all in one place instead of spread across a few different tools.

We'd love to show you what these coaches saw in a short demo, and how it could work for {school}.

If you're up for it, grab a time that works here:
https://calendar.app.google/s9DBb3bKD2teLLBT7

Thanks Coach,
Nick

GolfHelm
helmsportslabs.com
1537 Yarborough Park Dr, Raleigh, NC`;

const template = {
  name: 'Coach First Touch',
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

const { data: rows, error: selErr } = await supa
  .from('crm_email_templates').select('id, name').eq('name', 'Coach First Touch');
if (selErr) { console.error('select failed:', selErr.message); process.exit(1); }

if (rows?.length) {
  const { error } = await supa.from('crm_email_templates')
    .update({ ...template, updated_at: new Date().toISOString() }).eq('id', rows[0].id);
  if (error) { console.error('update failed:', error.message); process.exit(1); }
  console.log(`✓ Updated ${rows[0].id} "Coach First Touch" → text/plain (${body.length} bytes)`);
} else {
  const { data, error } = await supa.from('crm_email_templates').insert(template).select('id').single();
  if (error) { console.error('insert failed:', error.message); process.exit(1); }
  console.log(`✓ Inserted ${data.id} "Coach First Touch" (text/plain)`);
}

const preview = body.replace(/\{last_name\}/g, 'Smith').replace(/\{school\}/g, 'Maryville');
writeFileSync('/tmp/coach-first-touch-text-preview.txt', `Subject: Maryville golf\n\n${preview}\n`);
console.log('  preview -> /tmp/coach-first-touch-text-preview.txt');
