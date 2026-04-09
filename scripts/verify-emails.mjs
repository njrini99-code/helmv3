/**
 * Verify all CRM coach emails:
 * 1. Format validation (regex)
 * 2. MX record lookup (does the domain accept email?)
 * 3. Flag bad ones in the database
 */
import { createClient } from '@supabase/supabase-js';
import { promises as dns } from 'dns';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

async function checkMX(domain) {
  try {
    const records = await dns.resolveMx(domain);
    return records && records.length > 0;
  } catch {
    return false;
  }
}

async function main() {
  const { data: coaches, error } = await supabase
    .from('crm_coaches')
    .select('id, name, school, email, email_status')
    .eq('is_archived', false)
    .not('email', 'is', null)
    .order('school');

  if (error) { console.error(error); process.exit(1); }
  console.log(`Verifying ${coaches.length} emails...\n`);

  const issues = [];
  const domainCache = new Map();
  let valid = 0, invalid = 0, alreadyBounced = 0;

  for (const coach of coaches) {
    const email = coach.email.trim().toLowerCase();
    
    // Skip already-bounced
    if (coach.email_status === 'bounced' || coach.email_status === 'complained') {
      alreadyBounced++;
      continue;
    }

    // 1. Format check
    if (!EMAIL_REGEX.test(email)) {
      issues.push({ id: coach.id, name: coach.name, school: coach.school, email, reason: 'Invalid format' });
      invalid++;
      continue;
    }

    // 2. MX check (cached per domain)
    const domain = email.split('@')[1];
    if (!domainCache.has(domain)) {
      domainCache.set(domain, await checkMX(domain));
    }
    
    if (!domainCache.get(domain)) {
      issues.push({ id: coach.id, name: coach.name, school: coach.school, email, reason: `No MX records for ${domain}` });
      invalid++;
      continue;
    }

    valid++;
  }

  console.log(`Results:`);
  console.log(`  ✓ Valid: ${valid}`);
  console.log(`  ✗ Invalid: ${invalid}`);
  console.log(`  ⚠ Already bounced: ${alreadyBounced}`);
  console.log(`  Unique domains checked: ${domainCache.size}`);

  if (issues.length > 0) {
    console.log(`\n━━━ INVALID EMAILS ━━━`);
    for (const issue of issues) {
      console.log(`  ${issue.name} (${issue.school}): ${issue.email} → ${issue.reason}`);
    }

    // Mark invalid emails in DB
    console.log(`\nMarking ${issues.length} emails as bounced in database...`);
    for (const issue of issues) {
      await supabase
        .from('crm_coaches')
        .update({ email_status: 'bounced', updated_at: new Date().toISOString() })
        .eq('id', issue.id);
    }
    console.log('Done.');
  } else {
    console.log('\n✅ All emails passed verification!');
  }

  // Also list domains with no MX
  const badDomains = [...domainCache.entries()].filter(([, ok]) => !ok).map(([d]) => d);
  if (badDomains.length > 0) {
    console.log(`\nDomains with no MX records: ${badDomains.join(', ')}`);
  }
}

main();
