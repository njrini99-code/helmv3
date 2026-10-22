import { describe, it, expect } from 'vitest';
import { collapseHtmlErrorPages } from '@/lib/utils/describe-error';

/**
 * 2026-10-22 15:31Z (/admin/errors/fae748c7): a Supabase 502 made
 * `pattern-miner.savePatterns` log `metadata: { dbError: error }`, and the
 * PostgrestError's `message` was the whole Cloudflare page. The trace message
 * and stack are collapsed on the way in; `metadata` was stored verbatim, so
 * the row carried 6.8KB of markup including the Ray ID and the egress IP.
 */
const cloudflarePage = (rayId: string, ip: string) => `<!DOCTYPE html>
<!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]-->
<!--[if gt IE 8]><!--> <html class="no-js" lang="en-US"> <!--<![endif]-->
<head>
<title>supabase.co | 502: Bad gateway</title>
</head>
<body>
  <span>Error code 502</span>
  <p>Cloudflare Ray ID: ${rayId}</p>
  <p>Your IP: ${ip}</p>
</body></html>`;

const COLLAPSED = 'upstream returned an HTML error page (HTTP 502): supabase.co | 502: Bad gateway';

describe('collapseHtmlErrorPages', () => {
  it('collapses a gateway page nested in metadata to one stable line', () => {
    const out = collapseHtmlErrorPages({
      dbError: { message: cloudflarePage('9a1b', '203.0.113.7'), code: null },
    });
    expect(out).toEqual({ dbError: { message: COLLAPSED, code: null } });
    expect(JSON.stringify(out)).not.toContain('203.0.113.7');
  });

  it('is byte-stable across occurrences of the same outage', () => {
    const a = collapseHtmlErrorPages({ m: cloudflarePage('ray-1', '203.0.113.7') });
    const b = collapseHtmlErrorPages({ m: cloudflarePage('ray-2', '198.51.100.4') });
    expect(a).toEqual(b);
  });

  it('collapses pages inside arrays too', () => {
    expect(collapseHtmlErrorPages({ errors: [cloudflarePage('r', '203.0.113.7'), 'plain'] })).toEqual({
      errors: [COLLAPSED, 'plain'],
    });
  });

  it('leaves a string that merely contains HTML untouched', () => {
    const value = { body: 'reply text <html><body>quoted message</body></html>', note: 'failed to parse <html> in user input' };
    expect(collapseHtmlErrorPages(value)).toEqual(value);
  });

  it('keeps non-string values and does not mutate its input', () => {
    const input = { n: 3, ok: true, nil: null, nested: { page: cloudflarePage('r', '203.0.113.7') } };
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = collapseHtmlErrorPages(input);
    expect(out).toEqual({ n: 3, ok: true, nil: null, nested: { page: COLLAPSED } });
    expect(input).toEqual(snapshot);
  });
});
