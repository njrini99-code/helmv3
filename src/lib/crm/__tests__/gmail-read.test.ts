import { describe, it, expect } from 'vitest';
import {
  classifyInboundAutomation,
  isAutomatedSenderAddress,
  parseAddress,
  parseAddressPreserveCase,
  resolveLookbackWindow,
  DEFAULT_LOOKBACK_DAYS,
  MAX_LOOKBACK_DAYS,
  MIN_LOOKBACK_DAYS,
  MAX_MESSAGES,
  type InboundAutomationSignals,
} from '@/lib/crm/gmail-read';

/**
 * Pure-function coverage for the Gmail ingest fix (crm_replies had 0 rows
 * all-time). The network paths — getReadToken / listInboundMessages — are not
 * exercised here; these are the decisions that made mail disappear.
 */

/** A message that should sail through every automation check. */
const HUMAN: InboundAutomationSignals = {
  fromAddress: 'christopher.jones@lr.edu',
  autoSubmitted: null,
  precedence: null,
  returnPath: '<christopher.jones@lr.edu>',
  hasAutoReplyHeader: false,
  failedRecipients: null,
};

describe('parseAddressPreserveCase / parseAddress', () => {
  it('pulls the address out of a display-name header', () => {
    expect(parseAddressPreserveCase('Nick Rini <nick@x.com>')).toBe('nick@x.com');
    expect(parseAddress('Nick Rini <nick@x.com>')).toBe('nick@x.com');
  });

  it('accepts a bare address', () => {
    expect(parseAddressPreserveCase('nick@x.com')).toBe('nick@x.com');
  });

  it('KEEPS original casing, while parseAddress lowercases', () => {
    // This pair is the whole point: crm_coaches.email is stored with import
    // casing, so the raw form is what makes a missed match diagnosable.
    const header = 'Christopher Jones <Christopher.Jones@LR.edu>';
    expect(parseAddressPreserveCase(header)).toBe('Christopher.Jones@LR.edu');
    expect(parseAddress(header)).toBe('christopher.jones@lr.edu');
  });

  it('returns null for null, empty, and whitespace-only headers', () => {
    expect(parseAddressPreserveCase(null)).toBeNull();
    expect(parseAddress(null)).toBeNull();
    expect(parseAddressPreserveCase('')).toBeNull();
    expect(parseAddressPreserveCase('   ')).toBeNull();
    expect(parseAddress('   ')).toBeNull();
  });
});

describe('isAutomatedSenderAddress', () => {
  it('flags the conventional machine mailboxes', () => {
    for (const address of [
      'mailer-daemon@googlemail.com',
      'mailerdaemon@school.edu',
      'postmaster@school.edu',
      'no-reply@vendor.com',
      'noreply@vendor.com',
      'donotreply@vendor.com',
      'do-not-reply@vendor.com',
      'bounces@vendor.com',
    ]) {
      expect(isAutomatedSenderAddress(address)).toBe(true);
    }
  });

  it('is case-insensitive on the local-part', () => {
    expect(isAutomatedSenderAddress('NoReply@Vendor.com')).toBe(true);
    expect(isAutomatedSenderAddress('POSTMASTER@SCHOOL.EDU')).toBe(true);
  });

  it('strips a +tag before matching', () => {
    expect(isAutomatedSenderAddress('noreply+abc123@vendor.com')).toBe(true);
  });

  it('catches the per-send suffix form', () => {
    expect(isAutomatedSenderAddress('noreply-a83f21@mail.vendor.com')).toBe(true);
    expect(isAutomatedSenderAddress('mailer-daemon-2@googlemail.com')).toBe(true);
    expect(isAutomatedSenderAddress('noreply2@vendor.com')).toBe(true);
  });

  it('does not treat an ordinary local-part that merely starts similarly as automated', () => {
    expect(isAutomatedSenderAddress('noreplycoach@school.edu')).toBe(false);
  });

  it('does NOT flag shared human mailboxes — a coach really replies from these', () => {
    // Deliberate: a false positive here silently discards a buying signal,
    // which is the exact failure this module exists to stop.
    for (const address of [
      'coach@school.edu',
      'info@school.edu',
      'support@school.edu',
      'athletics@school.edu',
      'notifications@school.edu',
      'replies@school.edu',
    ]) {
      expect(isAutomatedSenderAddress(address)).toBe(false);
    }
  });

  it('is safe on null and malformed addresses', () => {
    expect(isAutomatedSenderAddress(null)).toBe(false);
    expect(isAutomatedSenderAddress('')).toBe(false);
    expect(isAutomatedSenderAddress('noreply')).toBe(false); // no @
    expect(isAutomatedSenderAddress('@vendor.com')).toBe(false); // empty local-part
  });
});

describe('classifyInboundAutomation — bounces', () => {
  it('flags the null reverse path', () => {
    expect(classifyInboundAutomation({ ...HUMAN, returnPath: '<>' })).toBe('null_return_path');
  });

  it('tolerates whitespace inside the null reverse path', () => {
    expect(classifyInboundAutomation({ ...HUMAN, returnPath: ' < > ' })).toBe('null_return_path');
  });

  it('leaves a normal Return-Path alone', () => {
    expect(classifyInboundAutomation({ ...HUMAN, returnPath: '<coach@school.edu>' })).toBeNull();
  });

  it('flags X-Failed-Recipients', () => {
    expect(
      classifyInboundAutomation({ ...HUMAN, failedRecipients: 'coach@school.edu' }),
    ).toBe('failed_recipients');
  });

  it('ignores an empty X-Failed-Recipients', () => {
    expect(classifyInboundAutomation({ ...HUMAN, failedRecipients: '   ' })).toBeNull();
  });
});

describe('classifyInboundAutomation — RFC 3834 headers', () => {
  it('flags auto-generated and auto-replied', () => {
    expect(classifyInboundAutomation({ ...HUMAN, autoSubmitted: 'auto-generated' })).toBe(
      'auto_submitted',
    );
    expect(classifyInboundAutomation({ ...HUMAN, autoSubmitted: 'auto-replied' })).toBe(
      'auto_submitted',
    );
  });

  it('treats `Auto-Submitted: no` as human — it is the RFC\'s explicit opt-out', () => {
    expect(classifyInboundAutomation({ ...HUMAN, autoSubmitted: 'no' })).toBeNull();
    expect(classifyInboundAutomation({ ...HUMAN, autoSubmitted: ' No ' })).toBeNull();
  });

  it('ignores an empty Auto-Submitted', () => {
    expect(classifyInboundAutomation({ ...HUMAN, autoSubmitted: '' })).toBeNull();
  });

  it('flags the non-standard vacation-responder headers', () => {
    expect(classifyInboundAutomation({ ...HUMAN, hasAutoReplyHeader: true })).toBe(
      'auto_reply_header',
    );
  });
});

describe('classifyInboundAutomation — Precedence', () => {
  it('flags bulk, auto_reply and junk', () => {
    expect(classifyInboundAutomation({ ...HUMAN, precedence: 'bulk' })).toBe('bulk_precedence');
    expect(classifyInboundAutomation({ ...HUMAN, precedence: 'auto_reply' })).toBe(
      'bulk_precedence',
    );
    expect(classifyInboundAutomation({ ...HUMAN, precedence: 'JUNK' })).toBe('bulk_precedence');
  });

  it('compares only the token, ignoring parameters', () => {
    expect(classifyInboundAutomation({ ...HUMAN, precedence: 'bulk; version=1' })).toBe(
      'bulk_precedence',
    );
  });

  it('does NOT flag `Precedence: list`', () => {
    // Deliberate omission: university aliases stamp `list` on ordinary staff
    // mail, and dropping those loses real coach replies.
    expect(classifyInboundAutomation({ ...HUMAN, precedence: 'list' })).toBeNull();
  });

  it('leaves an ordinary Precedence alone', () => {
    expect(classifyInboundAutomation({ ...HUMAN, precedence: 'normal' })).toBeNull();
  });
});

describe('classifyInboundAutomation — sender fallback and ordering', () => {
  it('falls back to the sender local-part', () => {
    expect(classifyInboundAutomation({ ...HUMAN, fromAddress: 'noreply@vendor.com' })).toBe(
      'automated_sender',
    );
  });

  it('reports the most specific reason when several apply', () => {
    // A real bounce is both a null reverse path AND a mailer-daemon sender;
    // the recorded counter should say which, not just "some machine".
    expect(
      classifyInboundAutomation({
        ...HUMAN,
        fromAddress: 'mailer-daemon@googlemail.com',
        returnPath: '<>',
        precedence: 'bulk',
      }),
    ).toBe('null_return_path');
  });

  it('passes a clean human message through', () => {
    expect(classifyInboundAutomation(HUMAN)).toBeNull();
  });

  it('passes a human message with no headers at all through', () => {
    expect(
      classifyInboundAutomation({
        fromAddress: 'coach@school.edu',
        autoSubmitted: null,
        precedence: null,
        returnPath: null,
        hasAutoReplyHeader: false,
        failedRecipients: null,
      }),
    ).toBeNull();
  });
});

describe('resolveLookbackWindow', () => {
  it('defaults when no value is supplied — the scheduled invocation passes none', () => {
    const { days, maxMessages } = resolveLookbackWindow(null);
    expect(days).toBe(DEFAULT_LOOKBACK_DAYS);
    expect(maxMessages).toBe(DEFAULT_LOOKBACK_DAYS * 50);
  });

  it('defaults on an unparseable value rather than erroring', () => {
    expect(resolveLookbackWindow('abc').days).toBe(DEFAULT_LOOKBACK_DAYS);
    expect(resolveLookbackWindow('').days).toBe(DEFAULT_LOOKBACK_DAYS);
  });

  it('honours a value inside the clamp', () => {
    expect(resolveLookbackWindow('14').days).toBe(14);
  });

  it('clamps above the ceiling instead of rejecting — a typo must not become an unbounded scan', () => {
    expect(resolveLookbackWindow('3000').days).toBe(MAX_LOOKBACK_DAYS);
    expect(resolveLookbackWindow(String(MAX_LOOKBACK_DAYS + 1)).days).toBe(MAX_LOOKBACK_DAYS);
  });

  it('clamps at or below the floor', () => {
    expect(resolveLookbackWindow('0').days).toBe(MIN_LOOKBACK_DAYS);
    expect(resolveLookbackWindow('-5').days).toBe(MIN_LOOKBACK_DAYS);
  });

  it('never exceeds Gmail\'s own maxResults cap', () => {
    expect(resolveLookbackWindow(String(MAX_LOOKBACK_DAYS)).maxMessages).toBe(MAX_MESSAGES);
  });

  it('scales the message budget with a small window', () => {
    expect(resolveLookbackWindow('1')).toEqual({ days: 1, maxMessages: 50 });
  });

  it('raises the default well above the old hard-coded 2 days', () => {
    // The 2-day window is what made a >48h outage unrecoverable.
    expect(DEFAULT_LOOKBACK_DAYS).toBeGreaterThan(2);
  });
});
