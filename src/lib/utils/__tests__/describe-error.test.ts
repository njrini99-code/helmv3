import { describe, it, expect } from 'vitest';
import { describeError, collapseHtmlErrorBody } from '@/lib/utils/describe-error';

describe('describeError', () => {
  // ── The safety net had the original bug inside it ────────────────────────
  // Production, 2026-07-29: `[recurring_events.editRecurringEvent]
  // [editRecurringEvent Error]: [object Object]`, logged twice while a coach
  // failed to edit a recurring event — from a call site that DOES use
  // describeError. The circular-reference catch fell back to `String(err)`,
  // which is exactly the value this module exists to eliminate.

  it('never returns "[object Object]" for a CIRCULAR object', () => {
    const circular: Record<string, unknown> = { code: '', message: '' };
    circular.self = circular;

    const described = describeError(circular);

    expect(described).not.toBe('[object Object]');
    expect(described).toContain('keys=');
  });

  it('never returns "[object Object]" when a BigInt makes the value unserializable', () => {
    // JSON.stringify throws TypeError on BigInt, same catch, same old outcome.
    const described = describeError({ attempted: BigInt(10), retries: BigInt(3) });
    expect(described).not.toBe('[object Object]');
    expect(described).toContain('attempted');
  });

  it('does not return the string "undefined" when JSON.stringify yields undefined', () => {
    // A function/symbol serializes to `undefined`, which never reached the
    // catch at all — so a try/catch alone would not have fixed this one.
    const described = describeError({ handler: () => {} } as unknown);
    expect(described).not.toBe('undefined');
    expect(described).not.toBe('[object Object]');
    expect(described).toContain('handler');
  });

  it('surfaces a message field even when the value cannot be serialized', () => {
    const circular: Record<string, unknown> = { message: 'update failed' };
    circular.self = circular;
    expect(describeError(circular)).toContain('update failed');
  });

  it('names the constructor when it falls through to the shape describer', () => {
    // No message/code/details/hint, so it does NOT take the Postgrest branch —
    // an earlier draft of this test gave the class a `message` and then
    // asserted the constructor name, which fails correctly: a value WITH a
    // message should report the message, not its shape.
    class WeirdTransportError {
      retries = BigInt(10);
      self?: unknown;
    }
    const e = new WeirdTransportError();
    e.self = e;
    expect(describeError(e)).toContain('WeirdTransportError');
  });

  it('unwraps a real Error instance to its message', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('returns a plain string unchanged', () => {
    expect(describeError('already a string')).toBe('already a string');
  });

  it('serializes a Supabase PostgrestError-shaped object into code/msg/details/hint — never "[object Object]"', () => {
    // This is the exact incident shape: PostgrestError is a plain object,
    // NOT an Error instance, so `error instanceof Error ? error.message :
    // String(error)` used to fall through to String(error) === "[object Object]".
    const postgrestError = {
      code: '42P01',
      message: 'relation "crm_coach_engagement" does not exist',
      details: 'matview missing',
      hint: 'run the refresh job',
    };

    const described = describeError(postgrestError);

    expect(described).not.toBe('[object Object]');
    expect(described).toContain('42P01');
    expect(described).toContain('relation "crm_coach_engagement" does not exist');
    expect(described).toContain('matview missing');
    expect(described).toContain('run the refresh job');
  });

  it('serializes a partial Postgrest-shaped object (missing hint/details) without dropping what is present', () => {
    const described = describeError({ code: '23505', message: 'duplicate key value' });
    expect(described).not.toBe('[object Object]');
    expect(described).toContain('23505');
    expect(described).toContain('duplicate key value');
  });

  it('falls back to JSON.stringify for a plain object with no code/message/details/hint', () => {
    const described = describeError({ foo: 'bar', n: 1 });
    expect(described).not.toBe('[object Object]');
    expect(described).toBe('{"foo":"bar","n":1}');
  });

  it('never throws on a circular object, even without a code/message to fall back on', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => describeError(circular)).not.toThrow();
    expect(typeof describeError(circular)).toBe('string');
  });

  it('prefers the code/message/details/hint summary over JSON.stringify even when the object is otherwise circular', () => {
    const circular: Record<string, unknown> = { code: '500', message: 'circular but diagnosable' };
    circular.self = circular;
    expect(describeError(circular)).toBe('code=500 msg=circular but diagnosable');
  });

  it('handles null/undefined without throwing', () => {
    expect(describeError(null)).toBe('unknown');
    expect(describeError(undefined)).toBe('unknown');
  });

  it('stringifies non-object primitives (number/boolean)', () => {
    expect(describeError(404)).toBe('404');
    expect(describeError(false)).toBe('false');
  });

  /**
   * A gateway that fails before reaching the origin answers with an HTML PAGE,
   * and the whole page lands in `error.message`.
   *
   * Real production text, 2026-07-29 (two cron routes, /api/cron/integrity-check
   * and /api/cron/log-retention). The harm is not verbosity — it is that the page
   * carries a unique Cloudflare Ray ID, a unique client IP and a to-the-second
   * timestamp, and `admin_events` fingerprints hash the message. Every 522
   * therefore minted a NEW incident group, which is how the 9.4-hour database
   * wedge never presented as one event.
   */
  describe('HTML gateway error bodies', () => {
    const cloudflare522 = (rayId: string, ip: string, when: string) =>
      [
        '<!DOCTYPE html>',
        '<html class="no-js" lang="en-US">',
        '<head>',
        '<title>supabase.co | 522: Connection timed out</title>',
        '</head><body>',
        '<h1><span class="inline-block">Connection timed out</span>',
        '<span class="code-label">Error code 522</span></h1>',
        `<div class="mt-3">${when}</div>`,
        `<span>Cloudflare Ray ID: <strong>${rayId}</strong></span>`,
        `<span id="cf-footer-ip">${ip}</span>`,
        '</body></html>',
      ].join('\n');

    it('collapses a Cloudflare 522 page to one short line', () => {
      const out = describeError(
        new Error(cloudflare522('a22a42d3dbe0d4c1', '35.175.113.239', '2026-07-29 07:03:17 UTC')),
      );
      expect(out).toBe(
        'upstream returned an HTML error page (HTTP 522): supabase.co | 522: Connection timed out',
      );
      expect(out.length).toBeLessThan(120);
    });

    /** The property that actually fixes incident grouping. */
    it('produces BYTE-IDENTICAL output for two occurrences of the same outage', () => {
      const first = describeError(
        new Error(cloudflare522('a22a42d3dbe0d4c1', '35.175.113.239', '2026-07-29 07:03:17 UTC')),
      );
      const second = describeError(
        new Error(cloudflare522('bb3b91e0ffff2c77', '34.204.13.189', '2026-07-29 07:30:48 UTC')),
      );
      expect(first).toBe(second);
    });

    it('leaks no Ray ID, IP or timestamp into the message the fingerprint hashes', () => {
      const out = describeError(
        new Error(cloudflare522('a22a42d3dbe0d4c1', '35.175.113.239', '2026-07-29 07:03:17 UTC')),
      );
      expect(out).not.toContain('a22a42d3dbe0d4c1');
      expect(out).not.toContain('35.175.113.239');
      expect(out).not.toContain('07:03:17');
      expect(out).not.toContain('<');
    });

    it('handles the Supabase plain-object shape, keeping the pg code', () => {
      expect(
        describeError({ code: 'PGRST000', message: cloudflare522('r', '1.2.3.4', 'now') }),
      ).toBe(
        'code=PGRST000 msg=upstream returned an HTML error page (HTTP 522): supabase.co | 522: Connection timed out',
      );
    });

    it('falls back gracefully when the page has no title', () => {
      const out = describeError(new Error('<!DOCTYPE html><html><body>502 Bad Gateway</body></html>'));
      expect(out).toContain('upstream returned an HTML error page');
      expect(out).toContain('no <title>');
    });

    /** Must not hijack ordinary messages that merely mention markup. */
    it('leaves non-HTML messages completely alone', () => {
      for (const plain of [
        'canceling statement due to statement timeout',
        'new row violates row-level security policy for table "golf_rounds"',
        'Unexpected token < in JSON at position 0',
        'value <= 0 is not allowed',
      ]) {
        expect(describeError(new Error(plain))).toBe(plain);
      }
    });
  });

  /**
   * postgrest-js's OTHER fallback for an unparseable 2xx body: when
   * `JSON.parse(body)` throws (a truncated/malformed response), it sets
   * `error = { message: body }` — the RAW response text, not a real error.
   * For a row-returning query that body is a JSON array of near-complete rows.
   *
   * Real production text, 2026-08-03 (`insight-delivery.getInsightsForCoach`):
   * `getInsightsForCoach failed: [{"id":"0138a7f6-8015-465c-93a6-0c1781ee6c70",
   * "player_id":"faced578-…` — a coach's entire insight feed, including a
   * player's putting percentages and coaching evidence, landed in
   * `error_logs.message` because the response simply failed to finish
   * streaming. Every occurrence carries different row content, so — same harm
   * as the HTML gateway page above — each one would mint its own incident
   * group instead of collapsing into one.
   */
  describe('raw JSON response-body dumps', () => {
    const rowDump = (n: number) =>
      '[' +
      Array.from({ length: n }, (_, i) =>
        `{"id":"0138a7f6-8015-465c-93a6-0c1781ee6c${i}","player_id":"faced578-b271-416f-b757-ac3aee5bd9e5","category":"putting","content":"padding-to-simulate-a-real-row-payload"}`,
      ).join(',') +
      ']';

    it('collapses a large JSON row dump to one stable summary line', () => {
      // describeError is called directly on the caught error object — its
      // `.message` IS the raw payload, with no caller-added prefix (a manual
      // prefix only exists once a caller interpolates the result into its own
      // template string, which is what collapseEmbeddedRawJsonDump below
      // handles). Matches collapseHtmlErrorBody's existing behavior here.
      const out = describeError(new Error(rowDump(5)));
      expect(out).toBe(
        'upstream response body could not be parsed as JSON — looks like a truncated row dump, not an error message',
      );
    });

    it('leaks no row content (player/insight data) into the collapsed message', () => {
      const out = describeError(new Error(rowDump(5)));
      expect(out).not.toContain('faced578');
      expect(out).not.toContain('putting');
      expect(out).not.toContain('"id"');
    });

    it('produces BYTE-IDENTICAL output for two occurrences with a DIFFERENT number of rows', () => {
      // Real occurrences of this failure never truncate at the same row count —
      // a length- or content-bearing summary would still mint a new incident
      // group per occurrence, exactly the fragmentation this fix exists to stop.
      const first = describeError(new Error(rowDump(3)));
      const second = describeError(new Error(rowDump(40)));
      expect(first).toBe(second);
    });

    it('handles the Supabase plain-object shape — postgrest-js\'s actual `{ message: body }` fallback', () => {
      const out = describeError({ message: rowDump(5) });
      expect(out).toBe(
        'upstream response body could not be parsed as JSON — looks like a truncated row dump, not an error message',
      );
    });

    it('does not fire on a short, genuine jsonb-detail error message', () => {
      const short = 'Key (metadata)=({"a":1}) already exists.';
      expect(describeError(new Error(short))).toBe(short);
    });

    it('leaves non-dump messages completely alone', () => {
      for (const plain of [
        'canceling statement due to statement timeout',
        'new row violates row-level security policy for table "golf_rounds"',
        'duplicate key value violates unique constraint "golf_events_pkey"',
      ]) {
        expect(describeError(new Error(plain))).toBe(plain);
      }
    });
  });
});

describe('collapseHtmlErrorBody', () => {
  it('extracts the <title> from a real gateway error page', () => {
    const body =
      '<!doctype html><html><head><title>supabase.co | 522: Connection timed out</title></head><body>Cloudflare Ray ID: a22a42d3dbe0d4c1 Your IP: 35.175.113.239</body></html>';
    const collapsed = collapseHtmlErrorBody(body);
    expect(collapsed).toContain('522');
    expect(collapsed).not.toContain('Ray ID');
    expect(collapsed).not.toContain('35.175.113.239');
  });

  it('returns null for non-HTML text', () => {
    expect(collapseHtmlErrorBody('canceling statement due to statement timeout')).toBeNull();
  });

  /**
   * js/polynomial-redos (#551): the title regex used to run against the
   * FULL response body, unbounded. A run of unclosed `<title` substrings
   * drove its backtracking to quadratic time on that unbounded input. Now it
   * only ever sees the first 2000 characters, so this must stay fast
   * regardless of how large `text` is — proven here with a genuinely large,
   * pathological body rather than asserted from reading the fix.
   */
  it('stays fast on a large body with many unclosed <title substrings (ReDoS regression)', () => {
    const evil = '<html><head>' + '<title'.repeat(50_000) + '</head></html>';
    const started = performance.now();
    collapseHtmlErrorBody(evil);
    const elapsedMs = performance.now() - started;
    expect(elapsedMs).toBeLessThan(500);
  });
});
