#!/usr/bin/env node
/**
 * notify-drift.mjs — one owner-only alert for a failed DB drift/advisor
 * check, sent through the SAME transport and SAME env var names as the
 * admin ops-digest (`src/lib/admin/digest/transport.ts`:
 * OPS_DIGEST_RESEND_API_KEY, OPS_DIGEST_TO, OPS_DIGEST_FROM).
 *
 * A tiny standalone script rather than importing the TS transport module
 * directly: this runs as a plain `node` step in a GitHub Actions workflow
 * (no tsx/ts-node in that job), and the transport module's own contract
 * (fail-soft: unconfigured -> skipped, never throws) is small enough to
 * reproduce here without duplicating meaningful logic — one Resend call.
 *
 * CUSTOMER MAIL: NEVER. This only ever reads OPS_DIGEST_* — the customer
 * notification path (a completely different set of tables/secrets) is not
 * imported, referenced, or reachable from this file.
 *
 * Fail-soft by design: if OPS_DIGEST_RESEND_API_KEY or OPS_DIGEST_TO is
 * unset, this exits 0 having sent nothing — the GitHub issue the workflow
 * also opens is the alert in that case, not a hard failure of the
 * notification step itself.
 *
 * Usage:
 *   OPS_DIGEST_RESEND_API_KEY=... OPS_DIGEST_TO=owner@x.com \
 *     node scripts/db/notify-drift.mjs "<subject>" "<body text>"
 */
import { Resend } from 'resend';

const DEFAULT_FROM = 'Cup of Helm <bridge@helmsportslabs.com>';

async function main() {
  const [subject, text] = process.argv.slice(2);
  if (!subject || !text) {
    console.error('usage: node scripts/db/notify-drift.mjs "<subject>" "<body text>"');
    process.exit(2);
  }

  const apiKey = process.env.OPS_DIGEST_RESEND_API_KEY;
  const to = (process.env.OPS_DIGEST_TO ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!apiKey || to.length === 0) {
    console.log(
      'notify-drift: OPS_DIGEST_RESEND_API_KEY and/or OPS_DIGEST_TO not configured in this environment — skipping email. The GitHub issue this workflow opens is the alert.',
    );
    process.exit(0);
  }

  const client = new Resend(apiKey);
  const { data, error } = await client.emails.send({
    from: process.env.OPS_DIGEST_FROM || DEFAULT_FROM,
    to,
    subject,
    text,
  });

  if (error) {
    console.error(`notify-drift: send failed — ${error.message ?? String(error)}`);
    // Non-fatal: the GitHub issue is the alert of record. A flaky email
    // provider must not fail the workflow that is reporting a real problem.
    process.exit(0);
  }
  console.log(`notify-drift: sent to ${to.join(', ')} (id ${data?.id ?? 'unknown'})`);
}

main();
