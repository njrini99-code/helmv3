import { describe, it, expect } from 'vitest';
import { collapseEmbeddedHtml } from '@/lib/utils/describe-error';

/**
 * The real payload from 2026-07-29: cron.refresh-engagement interpolated a raw
 * `error.message` that turned out to be a Cloudflare error page, so ~6KB of
 * markup landed in admin_events.
 *
 * Size was the lesser problem. That markup carries a unique Ray ID, client IP
 * and to-the-second timestamp, and admin_events fingerprints hash the message —
 * so every occurrence of one outage minted a NEW incident group. These tests
 * pin the two properties that matter: the caller's prefix survives (so you know
 * WHICH call failed), and the output is byte-stable across occurrences (so an
 * outage is one incident with a count).
 */
const cloudflarePage = (rayId: string, ip: string, when: string) => `<!DOCTYPE html>
<html class="no-js" lang="en-US">
<head><title>supabase.co | 522: Connection timed out</title></head>
<body>
  <h1>Error 522</h1>
  <p>Ray ID: ${rayId}</p>
  <p>Your IP: ${ip}</p>
  <p>Timestamp: ${when}</p>
</body></html>`;

describe('collapseEmbeddedHtml', () => {
  it('keeps the caller prefix and collapses only the HTML', () => {
    const msg = `[cron.refresh-engagement] RPC failed: ${cloudflarePage('8a1', '1.2.3.4', '10:00:01')}`;
    const out = collapseEmbeddedHtml(msg);

    expect(out).toContain('[cron.refresh-engagement] RPC failed:');
    expect(out).toContain('522');
    expect(out!.length).toBeLessThan(200);
    expect(out).not.toContain('<html');
  });

  it('is byte-stable across occurrences of the same outage', () => {
    // Different Ray ID, IP and timestamp — the three things that made every
    // occurrence a distinct fingerprint.
    const a = collapseEmbeddedHtml(`x failed: ${cloudflarePage('AAA', '1.1.1.1', '10:00:01')}`);
    const b = collapseEmbeddedHtml(`x failed: ${cloudflarePage('ZZZ', '9.9.9.9', '23:59:59')}`);

    expect(a).toBe(b);
  });

  it('returns null for a message with no embedded HTML, so callers pass through', () => {
    expect(collapseEmbeddedHtml('plain failure: column does not exist')).toBeNull();
    expect(collapseEmbeddedHtml('')).toBeNull();
  });

  it('handles HTML at the very start (no prefix) without a leading space', () => {
    const out = collapseEmbeddedHtml(cloudflarePage('b2', '2.2.2.2', '11:11:11'));
    expect(out).not.toBeNull();
    expect(out!.startsWith(' ')).toBe(false);
    expect(out).toContain('522');
  });

  it('does not fire on prose that merely mentions html', () => {
    // Guard against over-eager matching turning a normal message into a
    // "gateway error page" summary.
    expect(collapseEmbeddedHtml('failed to parse html response body')).toBeNull();
  });
});
