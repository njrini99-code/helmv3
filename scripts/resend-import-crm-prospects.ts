/**
 * Import GolfHelm CRM coaches into a dedicated Resend audience — but ONLY the
 * ones who are not already registered users.
 *
 * Target rule (matches the audited counts):
 *   crm_coaches WHERE email present
 *               AND email_status = 'valid'   (excludes bounced)
 *               AND is_archived = false
 *               AND lower(email) NOT IN (every registered users.email)
 *
 * Registered-user match is done by paginating the full `users` table (beats the
 * PostgREST 1000-row cap) and lowercasing both sides.
 *
 * Run:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/resend-import-crm-prospects.ts --dry-run
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/resend-import-crm-prospects.ts
 *
 * Prints the new/!reused audience id at the end — point the broadcast at it with
 * resend-coach-broadcast.ts (RESEND_SEGMENT_ID=<id>). This script NEVER sends email.
 */
import { Resend } from 'resend';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const AUDIENCE_NAME = 'GolfHelm Coach Demo — CRM prospects';

function splitName(raw: string | null): { firstName: string; lastName: string } {
  const name = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { firstName: '', lastName: '' };
  const parts = name.split(' ');
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '' };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function allUserEmails(supabase: SupabaseClient): Promise<Set<string>> {
  const emails = new Set<string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('users')
      .select('email')
      .not('email', 'is', null)
      .order('email', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const u of data) {
      const e = (u.email as string | null)?.toLowerCase().trim();
      if (e) emails.add(e);
    }
    if (data.length < PAGE) break;
  }
  return emails;
}

async function main() {
  const resendKey = (process.env.RESEND_API_KEY ?? '').trim();
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!resendKey || !supabaseUrl || !serviceKey) {
    throw new Error('Missing RESEND_API_KEY / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }
  const dryRun = process.argv.includes('--dry-run');
  const resend = new Resend(resendKey);
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // 1. Registered users (for exclusion).
  const sys = await allUserEmails(supabase);
  console.log(`Registered users: ${sys.size}`);

  // 2. CRM candidates: valid, not archived, with an email.
  const { data: rows, error } = await supabase
    .from('crm_coaches')
    .select('email, name, email_status, is_archived')
    .not('email', 'is', null)
    .eq('email_status', 'valid')
    .or('is_archived.is.null,is_archived.eq.false');
  if (error) throw error;

  // 3. Dedupe by lowercased email + exclude registered users.
  const seen = new Set<string>();
  const targets: Array<{ email: string; firstName: string; lastName: string }> = [];
  for (const r of rows ?? []) {
    const email = (r.email as string).toLowerCase().trim();
    if (!email || seen.has(email)) continue;
    if (sys.has(email)) continue; // already in the system
    seen.add(email);
    targets.push({ email, ...splitName(r.name as string | null) });
  }

  console.log(`CRM valid+active rows: ${rows?.length ?? 0}`);
  console.log(`Target (not already a user): ${targets.length}`);
  console.log('Sample:', targets.slice(0, 5).map((t) => `${t.email} (${t.firstName || '—'})`));

  if (dryRun) {
    console.log('\n[DRY RUN] no audience created, no contacts imported.');
    return;
  }

  // 4. Create or reuse the audience.
  let audienceId: string | undefined;
  const existing = await resend.audiences.list();
  audienceId = existing.data?.data?.find((a) => a.name === AUDIENCE_NAME)?.id;
  if (audienceId) {
    console.log(`Reusing audience "${AUDIENCE_NAME}" → ${audienceId}`);
  } else {
    const created = await resend.audiences.create({ name: AUDIENCE_NAME });
    audienceId = created.data?.id;
    if (!audienceId) throw new Error(`audiences.create failed: ${JSON.stringify(created.error)}`);
    console.log(`Created audience "${AUDIENCE_NAME}" → ${audienceId}`);
  }

  // 5. Import contacts (throttled; idempotent — duplicates are skipped).
  let created = 0, skipped = 0, failed = 0;
  for (const t of targets) {
    try {
      const res = await resend.contacts.create({
        audienceId,
        email: t.email,
        firstName: t.firstName || undefined,
        lastName: t.lastName || undefined,
        unsubscribed: false,
      });
      if (res.error) {
        const msg = JSON.stringify(res.error);
        if (/exist/i.test(msg)) skipped++;
        else { failed++; console.error(`  fail ${t.email}: ${msg}`); }
      } else {
        created++;
      }
    } catch (e) {
      failed++;
      console.error(`  throw ${t.email}: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(130); // ~7-8/sec, under Resend's rate limit
  }

  console.log(`\nDone. created=${created} skipped(existing)=${skipped} failed=${failed}`);
  console.log(`\nAUDIENCE_ID=${audienceId}`);
  console.log('Next: point the broadcast at it →');
  console.log(`  BROADCAST_ID=648592a9-94d9-4138-a8c2-294446ad08e2 RESEND_SEGMENT_ID=${audienceId} \\`);
  console.log('    DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/resend-coach-broadcast.ts');
}

main().catch((err) => { console.error(err); process.exit(1); });
