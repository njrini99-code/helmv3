/**
 * One-off: insert (or update) the "College Programs — 2026 / 2027" HTML email
 * template into crm_email_templates so it shows in the CRM TemplatePicker.
 * Body is read verbatim from public/email/college-programs-2026-27.html.
 * Idempotent: upserts by template name. Run: node scripts/insert-college-programs-template.mjs
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
  } catch { /* file may not exist */ }
}

const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing Supabase URL / service role key in env'); process.exit(1); }

const supa = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const body = readFileSync(new URL('../public/email/college-programs-2026-27.html', import.meta.url), 'utf8');

const template = {
  name: 'College Programs — 2026 / 2027 (HTML)',
  subject: '{school} — one of 10 college programs we’re onboarding for 2026 / 2027',
  body,
  category: 'cold_outreach',
  format: 'html',
  merge_tags: ['first_name', 'school', 'email'],
  is_default: false,
};

const { data: existing, error: selErr } = await supa
  .from('crm_email_templates')
  .select('id')
  .eq('name', template.name)
  .maybeSingle();
if (selErr) { console.error('select failed:', selErr.message); process.exit(1); }

if (existing) {
  const { error } = await supa
    .from('crm_email_templates')
    .update({ ...template, updated_at: new Date().toISOString() })
    .eq('id', existing.id);
  if (error) { console.error('update failed:', error.message); process.exit(1); }
  console.log(`✓ Updated existing template ${existing.id} (${body.length} bytes of HTML)`);
} else {
  const { data, error } = await supa
    .from('crm_email_templates')
    .insert(template)
    .select('id')
    .single();
  if (error) { console.error('insert failed:', error.message); process.exit(1); }
  console.log(`✓ Inserted template ${data.id} (${body.length} bytes of HTML)`);
}
