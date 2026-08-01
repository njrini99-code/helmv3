import { describe, it, expect } from 'vitest';
import {
  classifyInboundAutomation,
  extractBouncedRecipients,
  isAutomatedSenderAddress,
  parseAddress,
  parseAddressPreserveCase,
  readContactLogGmailId,
  resolveLookbackWindow,
  DEFAULT_LOOKBACK_DAYS,
  MAX_LOOKBACK_DAYS,
  MIN_LOOKBACK_DAYS,
  MAX_MESSAGES,
  type InboundAutomationSignals,
} from '@/lib/crm/gmail-read';
import type { Json } from '@/lib/types';

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

  it('raises the manual-backfill ceiling far enough to reach a March campaign from today', () => {
    expect(MAX_LOOKBACK_DAYS).toBeGreaterThanOrEqual(150);
  });

  it('keeps the default at 7 regardless of the raised ceiling — the scheduled tick must not slow down', () => {
    expect(resolveLookbackWindow(null).days).toBe(7);
  });
});

describe('extractBouncedRecipients — transient DSNs must never suppress', () => {
  // A delay warning carries BOTH a null Return-Path and X-Failed-Recipients,
  // so without an Action/Status gate it reads as a hard bounce and
  // permanently blacklists a coach whose mail delivers minutes later.
  it('ignores an Action: delayed report even with X-Failed-Recipients set', () => {
    expect(
      extractBouncedRecipients({
        failedRecipients: 'coach@school.edu',
        deliveryStatusText:
          'Reporting-MTA: dns; googlemail.com\nAction: delayed\nStatus: 4.2.2\nFinal-Recipient: rfc822; coach@school.edu',
        bodyText: null,
      }),
    ).toEqual([]);
  });

  it('ignores a 4.x.x transient status', () => {
    expect(
      extractBouncedRecipients({
        failedRecipients: null,
        deliveryStatusText: 'Status: 4.7.1\nFinal-Recipient: rfc822; coach@school.edu',
        bodyText: null,
      }),
    ).toEqual([]);
  });

  it('ignores Action: relayed / expanded', () => {
    for (const action of ['relayed', 'expanded']) {
      expect(
        extractBouncedRecipients({
          failedRecipients: 'coach@school.edu',
          deliveryStatusText: `Action: ${action}\nFinal-Recipient: rfc822; coach@school.edu`,
          bodyText: null,
        }),
      ).toEqual([]);
    }
  });

  it('still suppresses on a genuine Action: failed report', () => {
    expect(
      extractBouncedRecipients({
        failedRecipients: null,
        deliveryStatusText:
          'Action: failed\nStatus: 5.1.1\nFinal-Recipient: rfc822; gone@school.edu',
        bodyText: null,
      }),
    ).toEqual(['gone@school.edu']);
  });

  it('accepts a 5.x.x status when the MTA omits Action entirely', () => {
    expect(
      extractBouncedRecipients({
        failedRecipients: null,
        deliveryStatusText: 'Status: 5.1.1\nFinal-Recipient: rfc822; gone@school.edu',
        bodyText: null,
      }),
    ).toEqual(['gone@school.edu']);
  });

  it('fails closed on a DSN carrying neither Action nor Status', () => {
    expect(
      extractBouncedRecipients({
        failedRecipients: 'coach@school.edu',
        deliveryStatusText: 'Reporting-MTA: dns; example.com\nFinal-Recipient: rfc822; coach@school.edu',
        bodyText: null,
      }),
    ).toEqual([]);
  });
});

describe('extractBouncedRecipients', () => {
  it('reads a single address from X-Failed-Recipients', () => {
    expect(
      extractBouncedRecipients({
        failedRecipients: 'coach@school.edu',
        deliveryStatusText: null,
        bodyText: null,
      }),
    ).toEqual(['coach@school.edu']);
  });

  it('splits X-Failed-Recipients on comma AND semicolon, lowercases, and dedupes', () => {
    expect(
      extractBouncedRecipients({
        failedRecipients: 'Coach@School.edu, other@school.edu; coach@school.edu',
        deliveryStatusText: null,
        bodyText: null,
      }),
    ).toEqual(['coach@school.edu', 'other@school.edu']);
  });

  it('falls back to a single RFC 3464 Final-Recipient field in the DSN', () => {
    const dsn = [
      'Reporting-MTA: dns; mail.school.edu',
      'Final-Recipient: rfc822; coach@school.edu',
      'Action: failed',
      'Status: 5.1.1',
    ].join('\n');
    expect(
      extractBouncedRecipients({ failedRecipients: null, deliveryStatusText: dsn, bodyText: null }),
    ).toEqual(['coach@school.edu']);
  });

  it('collects every Final-Recipient field on a multi-recipient bounce', () => {
    const dsn = [
      'Final-Recipient: rfc822; coach1@school.edu',
      'Action: failed',
      '',
      'Final-Recipient: rfc822; coach2@school.edu',
      'Action: failed',
    ].join('\n');
    expect(
      extractBouncedRecipients({ failedRecipients: null, deliveryStatusText: dsn, bodyText: null }),
    ).toEqual(['coach1@school.edu', 'coach2@school.edu']);
  });

  it('prefers X-Failed-Recipients over the DSN when both are present', () => {
    // Fixture carries `Action: failed` because the permanence gate now runs
    // first: a report with neither Action nor Status is refused outright
    // (covered by its own test above). The precedence contract under test
    // here is unchanged — the header still wins over the DSN body.
    const dsn = 'Action: failed\nStatus: 5.1.1\nFinal-Recipient: rfc822; wrong@school.edu';
    expect(
      extractBouncedRecipients({
        failedRecipients: 'right@school.edu',
        deliveryStatusText: dsn,
        bodyText: null,
      }),
    ).toEqual(['right@school.edu']);
  });

  it('falls back to a scoped prose paragraph when neither structured source is present', () => {
    const bodyText = [
      'Delivery to the following recipient failed permanently:',
      '',
      '    coach@school.edu',
      '',
      'Technical details of permanent failure:',
      'The recipient server did not accept our requests.',
    ].join('\n');
    expect(
      extractBouncedRecipients({ failedRecipients: null, deliveryStatusText: null, bodyText }),
    ).toEqual(['coach@school.edu']);
  });

  it('does NOT leak an address from a quoted original-message block below the paragraph break', () => {
    const bodyText = [
      "Delivery to the following recipient failed permanently:",
      '',
      '    coach@school.edu',
      '',
      '----- Original message -----',
      'From: nick@helmsportslabs.com',
      'To: unrelated-cc@otherschool.edu',
      'Subject: Following up',
    ].join('\n');
    expect(
      extractBouncedRecipients({ failedRecipients: null, deliveryStatusText: null, bodyText }),
    ).toEqual(['coach@school.edu']);
  });

  it('returns [] when nothing could be extracted', () => {
    expect(
      extractBouncedRecipients({ failedRecipients: null, deliveryStatusText: null, bodyText: null }),
    ).toEqual([]);
    expect(
      extractBouncedRecipients({ failedRecipients: '   ', deliveryStatusText: null, bodyText: 'no addresses here' }),
    ).toEqual([]);
  });
});

describe('readContactLogGmailId', () => {
  it('reads the id from the exact shape crm-gmail-send.ts writes', () => {
    const metadata: Json = { channel: 'gmail_api', gmail_message_id: '19f7d02ccba7813f' };
    expect(readContactLogGmailId(metadata)).toBe('19f7d02ccba7813f');
  });

  it('returns null when the key is absent', () => {
    expect(readContactLogGmailId({ channel: 'gmail_api' } as Json)).toBeNull();
    expect(readContactLogGmailId({} as Json)).toBeNull();
  });

  it('is safe on null, an array, and a non-string value', () => {
    expect(readContactLogGmailId(null)).toBeNull();
    expect(readContactLogGmailId(['gmail_message_id'] as unknown as Json)).toBeNull();
    expect(readContactLogGmailId({ gmail_message_id: 12345 } as unknown as Json)).toBeNull();
  });
});
