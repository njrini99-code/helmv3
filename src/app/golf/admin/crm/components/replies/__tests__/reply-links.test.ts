import { describe, expect, it } from 'vitest';
import { buildGmailSearchUrl, extractGmailId, buildReplyMailto } from '../reply-links';

describe('buildGmailSearchUrl', () => {
  it('returns null for a null searchId', () => {
    expect(buildGmailSearchUrl(null)).toBeNull();
  });

  it('returns null for an empty-string searchId', () => {
    expect(buildGmailSearchUrl('')).toBeNull();
  });

  it('builds an rfc822msgid search deep-link', () => {
    expect(buildGmailSearchUrl('abc123@mail.gmail.com')).toBe(
      'https://mail.google.com/mail/u/0/#search/rfc822msgid:abc123%40mail.gmail.com',
    );
  });

  it('URL-encodes special characters in the search id', () => {
    expect(buildGmailSearchUrl('<id with spaces>')).toBe(
      'https://mail.google.com/mail/u/0/#search/rfc822msgid:%3Cid%20with%20spaces%3E',
    );
  });
});

describe('extractGmailId', () => {
  it('returns null for a null payload', () => {
    expect(extractGmailId(null)).toBeNull();
  });

  it('returns null when gmail_id is absent', () => {
    expect(extractGmailId({ other_key: 'value' })).toBeNull();
  });

  it('returns null when gmail_id is not a string', () => {
    expect(extractGmailId({ gmail_id: 12345 })).toBeNull();
  });

  it('returns null when gmail_id is an empty string', () => {
    expect(extractGmailId({ gmail_id: '' })).toBeNull();
  });

  it('returns the gmail_id when present as a non-empty string', () => {
    expect(extractGmailId({ gmail_id: 'gmail-abc-123' })).toBe('gmail-abc-123');
  });
});

describe('buildReplyMailto', () => {
  it('prefixes the subject with "Re: " when a subject exists', () => {
    expect(buildReplyMailto('coach@example.com', 'Interested in demo')).toBe(
      'mailto:coach@example.com?subject=Re%3A%20Interested%20in%20demo',
    );
  });

  it('falls back to a bare "Re:" when there is no subject', () => {
    expect(buildReplyMailto('coach@example.com', null)).toBe(
      'mailto:coach@example.com?subject=Re%3A',
    );
  });
});
