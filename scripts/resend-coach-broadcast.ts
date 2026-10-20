/**
 * Push the branded coach demo invite into a Resend broadcast.
 *
 * Two modes:
 *   UPDATE an existing draft (recommended): create the broadcast in the Resend
 *     dashboard first (pick audience + from + subject there), copy its id, then:
 *       BROADCAST_ID=<id> DOTENV_CONFIG_PATH=.env.local \
 *         npx tsx -r dotenv/config scripts/resend-coach-broadcast.ts
 *
 *   CREATE a new draft from code: set your audience/segment id, then:
 *       RESEND_SEGMENT_ID=<id> DOTENV_CONFIG_PATH=.env.local \
 *         npx tsx -r dotenv/config scripts/resend-coach-broadcast.ts
 *
 * Reads RESEND_API_KEY from the environment (e.g. .env.local). The HTML body is
 * the single source of truth at public/email/coach-demo-invite.html — edit there,
 * re-run, and the draft updates. This script NEVER sends; it only writes the draft.
 * Review it in the dashboard, send yourself a test, then click Send.
 */
import { Resend } from 'resend';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cliGuard } from './lib/cli-guard.mjs';

const cli = cliGuard({
  name: 'scripts/resend-coach-broadcast.ts',
  summary:
    'Writes the coach demo invite HTML into a Resend broadcast DRAFT (updates BROADCAST_ID, or creates one in RESEND_SEGMENT_ID). It never sends; sending stays a dashboard click.',
  usage: '[broadcast-id]',
  options: [['BROADCAST_ID / RESEND_SEGMENT_ID', 'Environment: draft to update, or segment to create a new draft in']],
  secrets: 'RESEND_API_KEY (.env.local via dotenv)',
});

const SUBJECT = 'See your whole golf program in one place — live demo inside';
const FROM = 'Helm Sports Labs <admin@helmsportslabs.com>';
const HTML_PATH = 'public/email/coach-demo-invite.html';

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY (run with DOTENV_CONFIG_PATH=.env.local … -r dotenv/config)');
  }

  const resend = new Resend(apiKey);
  const html = readFileSync(resolve(HTML_PATH), 'utf8');

  const broadcastId = (process.env.BROADCAST_ID ?? cli.positional[0] ?? '').trim();
  const segmentId = (process.env.RESEND_SEGMENT_ID ?? '').trim();

  if (!cli.apply) {
    console.log(
      `[dry-run] would ${broadcastId ? `update broadcast ${broadcastId}` : segmentId ? `create a draft broadcast in segment ${segmentId}` : 'fail: set BROADCAST_ID or RESEND_SEGMENT_ID'} with ${html.length} chars of HTML from ${HTML_PATH}. Re-run with --apply to write the draft.`,
    );
    return;
  }

  if (broadcastId) {
    // Update an existing draft. The API requires from + audienceId; we set
    // subject + html too. Audience comes from RESEND_AUDIENCE_ID (or reuse
    // whatever the draft already had by leaving it unset once valid).
    const updatePayload: Record<string, unknown> = { from: FROM, subject: SUBJECT, html };
    if (segmentId) updatePayload.audienceId = segmentId;
    const { data, error } = await resend.broadcasts.update(broadcastId, updatePayload);
    if (error) {
      console.error('broadcasts.update failed:', error);
      process.exit(1);
    }
    console.log('✓ Updated broadcast HTML:', data?.id ?? broadcastId);
    console.log('  Review + send: https://resend.com/broadcasts/' + (data?.id ?? broadcastId));
  } else if (segmentId) {
    // Create a fresh draft from code.
    const { data, error } = await resend.broadcasts.create({
      segmentId,
      from: FROM,
      subject: SUBJECT,
      html,
    });
    if (error) {
      console.error('broadcasts.create failed:', error);
      process.exit(1);
    }
    console.log('✓ Created broadcast draft:', data?.id);
    console.log('  Review + send: https://resend.com/broadcasts/' + data?.id);
  } else {
    throw new Error(
      'Set BROADCAST_ID=<id> to update an existing draft, or RESEND_SEGMENT_ID=<id> to create a new one.',
    );
  }

  console.log('\nThis script did NOT send anything — open the link, send a test, then Send from the dashboard.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
