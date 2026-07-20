// ============================================================================
// reply-links — pure URL builders for ReplyThread's compact action row.
// Kept separate from the component so mailto/Gmail-deeplink formatting is
// unit-testable without mounting React.
// ============================================================================

/**
 * Gmail's rfc822msgid search deep-link. `searchId` should be either the
 * provider-native gmail_id (from raw_payload) or the RFC822 message_id —
 * Gmail indexes both as search tokens. Returns null when there's nothing to
 * search on so the caller can omit the "Open in Gmail" link entirely.
 */
export function buildGmailSearchUrl(searchId: string | null): string | null {
  if (!searchId) return null;
  return `https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(searchId)}`;
}

/**
 * Pull raw_payload->>'gmail_id' out of a loosely-typed JSON blob, if present.
 * Guards against non-string / empty values from a payload shape we don't
 * fully control (webhook-sourced JSON).
 */
export function extractGmailId(rawPayload: Record<string, unknown> | null): string | null {
  if (!rawPayload) return null;
  const value = rawPayload['gmail_id'];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * mailto: href that replies to `fromAddress`, prefixing the subject with
 * "Re: ". Falls back to a bare "Re:" when the original had no subject.
 */
export function buildReplyMailto(fromAddress: string, subject: string | null): string {
  const replySubject = subject ? `Re: ${subject}` : 'Re:';
  return `mailto:${fromAddress}?subject=${encodeURIComponent(replySubject)}`;
}
