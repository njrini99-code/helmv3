import { describe, it, expect } from 'vitest';
import {
  maskEmails,
  redactPiiDeep,
  redactEventPii,
  collapseEmailsForGrouping,
} from '@/lib/observability/redact-pii';

/**
 * Both Sentry `beforeSend` hooks were named for PII and scrubbed only the
 * request envelope — cookies, auth headers, query string. `message`, `extra`,
 * `contexts` and exception values were untouched, and those are exactly where
 * this app puts email addresses.
 *
 * The cases below use the REAL message shapes from the real call sites rather
 * than invented ones, so a regression is caught in the form it would actually
 * take.
 */

describe('maskEmails', () => {
  it('keeps the domain and the first character', () => {
    expect(maskEmails('nick@example.com')).toBe('n***@example.com');
  });

  it('handles plus-addressing and multi-label TLDs', () => {
    expect(maskEmails('nick.rini+recruiting@mail.example.co.uk')).toBe(
      'n***@mail.example.co.uk',
    );
  });

  it('masks every address in a string, not just the first', () => {
    const out = maskEmails('from alice@a.com to bob@b.org');
    expect(out).toBe('from a***@a.com to b***@b.org');
  });

  it('leaves text with no address untouched', () => {
    const s = 'createGolfEvent email notification failed for 3/12 recipients';
    expect(maskEmails(s)).toBe(s);
  });

  it('does not mangle an @ that is not an address', () => {
    expect(maskEmails('cost @ 12 per unit')).toBe('cost @ 12 per unit');
  });
});

describe('redactPiiDeep', () => {
  it('reaches nested objects and arrays', () => {
    const v = redactPiiDeep({ a: [{ b: 'x@y.com' }], c: 'z@w.net' });
    expect(v).toEqual({ a: [{ b: 'x***@y.com' }], c: 'z***@w.net' });
  });

  it('survives a self-referential object', () => {
    // `extra` carries caller-supplied objects; one being cyclic must not hang
    // the reporter.
    const cyc: Record<string, unknown> = { email: 'a@b.com' };
    cyc.self = cyc;
    expect(() => redactPiiDeep(cyc)).not.toThrow();
    expect(cyc.email).toBe('a***@b.com');
  });

  it('stops at the depth bound instead of recursing forever', () => {
    let deep: Record<string, unknown> = { email: 'deep@x.com' };
    for (let i = 0; i < 12; i++) deep = { next: deep };
    expect(() => redactPiiDeep(deep)).not.toThrow();
  });
});

describe('redactEventPii — the real shapes that were leaking', () => {
  it('masks the password-reset message (send-password-reset.ts)', () => {
    const e = redactEventPii({
      message: 'password reset send failed for coach@lynchburg.edu: unknown',
    });
    expect(e.message).toBe('password reset send failed for c***@lynchburg.edu: unknown');
  });

  it('masks the task-reminder message (task-reminders.ts:905)', () => {
    const e = redactEventPii({
      message: '[TaskReminders] Failed to send email to player@school.edu: 502',
    });
    expect(e.message).not.toContain('player@school.edu');
    expect(e.message).toContain('@school.edu');
  });

  it('masks the email+IP pair in metadata (baseball/actions/auth.ts:320)', () => {
    // The pair is the sensitive part: either alone is ordinary telemetry.
    const e = redactEventPii({
      extra: { metadata: { email: 'someone@gmail.com', ip: '203.0.113.9' } },
    });
    const meta = (e.extra as { metadata: { email: string; ip: string } }).metadata;
    expect(meta.email).toBe('s***@gmail.com');
    // The IP is deliberately NOT masked — on its own it is operational data,
    // and losing it would remove the ability to investigate credential
    // stuffing. Masking the address is what breaks the pair.
    expect(meta.ip).toBe('203.0.113.9');
  });

  it('masks addresses inside exception values', () => {
    const e = redactEventPii({
      exception: { values: [{ value: 'duplicate key: bounced@x.io' }] },
    });
    expect((e.exception as { values: Array<{ value: string }> }).values[0]!.value).toBe(
      'duplicate key: b***@x.io',
    );
  });

  it('masks breadcrumbs and contexts', () => {
    const e = redactEventPii({
      breadcrumbs: [{ message: 'looked up who@where.com' }],
      contexts: { app: { note: 'for me@here.org' } },
    });
    expect(JSON.stringify(e)).not.toContain('who@where.com');
    expect(JSON.stringify(e)).not.toContain('me@here.org');
  });

  it('leaves an event with no PII structurally unchanged', () => {
    const before = { message: 'boom', extra: { count: 3 }, tags: { sport: 'golf' } };
    expect(redactEventPii({ ...before, extra: { count: 3 } })).toEqual(before);
  });
});

describe('collapseEmailsForGrouping — the fingerprint form', () => {
  it('collapses DIFFERENT addresses to the same string', () => {
    // This is the whole reason it exists. maskEmails cannot do this job: it
    // keeps the first character and the domain, so two recipients still hash
    // to two incident groups.
    const a = collapseEmailsForGrouping('password reset send failed for alice@school.edu');
    const b = collapseEmailsForGrouping('password reset send failed for bob@school.edu');

    expect(a).toBe(b);
    expect(a).toBe('password reset send failed for <email>');
  });

  it('is NOT what maskEmails does — the two forms must stay distinct', () => {
    // Guards against someone "simplifying" these into one function later.
    const masked = [
      maskEmails('failed for alice@school.edu'),
      maskEmails('failed for bob@school.edu'),
    ];
    expect(masked[0]).not.toBe(masked[1]);

    const grouped = [
      collapseEmailsForGrouping('failed for alice@school.edu'),
      collapseEmailsForGrouping('failed for bob@school.edu'),
    ];
    expect(grouped[0]).toBe(grouped[1]);
  });

  it('leaves a message with no address alone, so grouping is unchanged for it', () => {
    const s = 'createGolfEvent email notification failed for 3/12 recipients';
    expect(collapseEmailsForGrouping(s)).toBe(s);
  });
});
