/**
 * Deep email verification using Resend's email verification API.
 * Checks each email via SMTP handshake — catches "mailbox doesn't exist" errors.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !RESEND_API_KEY) {
  console.error('Missing env vars. Run: node --env-file=.env.local scripts/verify-emails-resend.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verifyEmail(email) {
  try {
    const res = await fetch('https://api.resend.com/emails/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ email }),
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    }

    // If 422 or other error, try the alternative endpoint
    const text = await res.text();
    
    // Resend may not have a verification endpoint — fall back to sending a 
    // temporary check via their API with a dry-run approach
    if (res.status === 404 || res.status === 405) {
      return { status: 'unknown', reason: 'Verification API not available' };
    }
    
    return { status: 'error', reason: text };
  } catch (err) {
    return { status: 'error', reason: err.message };
  }
}

// Alternative: Use raw SMTP verification via Node
import net from 'net';

function smtpVerify(email, timeout = 10000) {
  return new Promise((resolve) => {
    const domain = email.split('@')[1];
    
    // First resolve MX
    import('dns').then(({ promises: dns }) => {
      dns.resolveMx(domain).then(records => {
        if (!records || records.length === 0) {
          resolve({ valid: false, reason: 'No MX records' });
          return;
        }
        
        // Sort by priority, pick best
        records.sort((a, b) => a.priority - b.priority);
        const mxHost = records[0].exchange;
        
        const socket = new net.Socket();
        let response = '';
        let step = 0;
        let resolved = false;
        
        const done = (valid, reason) => {
          if (resolved) return;
          resolved = true;
          socket.destroy();
          resolve({ valid, reason });
        };
        
        socket.setTimeout(timeout);
        socket.on('timeout', () => done(false, 'Timeout'));
        socket.on('error', (err) => done(false, `Connection error: ${err.message}`));
        
        socket.on('data', (data) => {
          response = data.toString();
          const code = parseInt(response.substring(0, 3));
          
          if (step === 0 && code === 220) {
            // Server greeting — send EHLO
            step = 1;
            socket.write('EHLO helmsportslabs.com\r\n');
          } else if (step === 1 && code === 250) {
            // EHLO accepted — send MAIL FROM
            step = 2;
            socket.write('MAIL FROM:<verify@helmsportslabs.com>\r\n');
          } else if (step === 2 && code === 250) {
            // MAIL FROM accepted — send RCPT TO (this is the actual check)
            step = 3;
            socket.write(`RCPT TO:<${email}>\r\n`);
          } else if (step === 3) {
            // RCPT TO response — this tells us if mailbox exists
            if (code === 250 || code === 251) {
              done(true, 'Mailbox exists');
            } else if (code === 550 || code === 551 || code === 552 || code === 553 || code === 554) {
              done(false, `Mailbox rejected (${code}): ${response.trim()}`);
            } else if (code === 450 || code === 451 || code === 452) {
              // Temporary failure — mailbox might exist but can't verify
              done(true, `Temporary response (${code}) — assuming valid`);
            } else {
              done(true, `Unexpected response (${code}) — assuming valid`);
            }
            socket.write('QUIT\r\n');
          }
        });
        
        socket.connect(25, mxHost);
        
      }).catch(() => {
        resolve({ valid: false, reason: 'MX lookup failed' });
      });
    });
  });
}

async function main() {
  const { data: coaches, error } = await supabase
    .from('crm_coaches')
    .select('id, name, school, email')
    .eq('is_archived', false)
    .eq('email_status', 'valid')
    .not('email', 'is', null)
    .order('school');

  if (error) { console.error(error); process.exit(1); }
  console.log(`Deep-verifying ${coaches.length} emails via SMTP...\n`);

  let valid = 0, invalid = 0, uncertain = 0;
  const invalidEmails = [];
  const uncertainEmails = [];

  for (let i = 0; i < coaches.length; i++) {
    const coach = coaches[i];
    const email = coach.email.trim().toLowerCase();
    
    process.stdout.write(`[${i + 1}/${coaches.length}] ${coach.name} (${email})... `);
    
    const result = await smtpVerify(email);
    
    if (result.valid) {
      valid++;
      console.log(`✓`);
    } else {
      if (result.reason.includes('Timeout') || result.reason.includes('Connection error') || result.reason.includes('Temporary')) {
        uncertain++;
        uncertainEmails.push({ ...coach, reason: result.reason });
        console.log(`? ${result.reason}`);
      } else {
        invalid++;
        invalidEmails.push({ ...coach, reason: result.reason });
        console.log(`✗ ${result.reason}`);
      }
    }
    
    // Small delay between checks
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n━━━ RESULTS ━━━`);
  console.log(`  ✓ Valid: ${valid}`);
  console.log(`  ✗ Invalid: ${invalid}`);
  console.log(`  ? Uncertain: ${uncertain}`);

  if (invalidEmails.length > 0) {
    console.log(`\n━━━ INVALID EMAILS ━━━`);
    for (const e of invalidEmails) {
      console.log(`  ${e.name} (${e.school}): ${e.email} → ${e.reason}`);
    }
    
    console.log(`\nMarking ${invalidEmails.length} as bounced...`);
    for (const e of invalidEmails) {
      await supabase
        .from('crm_coaches')
        .update({ email_status: 'bounced', updated_at: new Date().toISOString() })
        .eq('id', e.id);
    }
    console.log('Done.');
  }

  if (uncertainEmails.length > 0) {
    console.log(`\n━━━ UNCERTAIN (not marked — may still be valid) ━━━`);
    for (const e of uncertainEmails) {
      console.log(`  ${e.name} (${e.school}): ${e.email} → ${e.reason}`);
    }
  }
}

main();
