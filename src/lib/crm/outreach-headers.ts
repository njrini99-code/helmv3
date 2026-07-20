// ============================================================================
// CRM OUTREACH EXTRAS — RFC 8058 unsubscribe headers + reply-to + Resend tags
// ============================================================================
//
// The shared "deliverability envelope" every cold-outreach send attaches to a
// Resend message: the one-click List-Unsubscribe header pair (the #1 free
// Gmail-Primary signal), a reply-to, and sanitized per-cohort segmentation tags.
//
// Mirrors scripts/process-sequence-batch.mjs exactly:
//   - List-Unsubscribe: '<https URL>, <mailto:...?subject=unsubscribe>'
//   - List-Unsubscribe-Post: 'List-Unsubscribe=One-Click'
//   - reply_to from HELM_REPLY_TO (default the from-address)
//   - Resend tag names/values restricted to ^[A-Za-z0-9_-]+$
//
// Node-runtime only (imports unsubscribe-token.ts which uses node:crypto).
// ============================================================================
import { buildUnsubUrl } from './unsubscribe-token';

// Defaults match scripts/process-sequence-batch.mjs (FROM / REPLY_TO / UNSUB_MAILTO).
const FROM_EMAIL = process.env.HELM_FROM_EMAIL ?? 'Helm Sports Labs <admin@helmsportslabs.com>';
const REPLY_TO = process.env.HELM_REPLY_TO ?? FROM_EMAIL;
const UNSUB_MAILTO = process.env.HELM_UNSUB_EMAIL ?? 'admin@helmsportslabs.com';

/** Resend tags accept [A-Za-z0-9_-] only — sanitize, cap length, drop if empty. */
function sanitizeTag(value: string | null | undefined): string {
  return String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60);
}

export interface OutreachExtras {
  reply_to?: string;
  headers: Record<string, string>;
  tags: { name: string; value: string }[];
}

/**
 * The one-click List-Unsubscribe header pair for a coach. Shared by BOTH send
 * transports — Resend (via buildOutreachExtras) and the Gmail API direct-send
 * path (gmail-send.ts buildMime) — so no cold-outreach email can ship without
 * an unsubscribe mechanism regardless of whether the template body carries
 * {unsubscribe_url}.
 */
export function buildListUnsubscribeHeaders(coachId: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${buildUnsubUrl(coachId)}>, <mailto:${UNSUB_MAILTO}?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/**
 * Build the unsubscribe headers, reply-to, and segmentation tags for a single
 * cold-outreach send. Tag values are sanitized to Resend's allowed charset;
 * empty values are dropped (a tag with an empty value would be rejected).
 */
export function buildOutreachExtras(args: {
  coachId: string;
  format: string;
  campaign: string;
  division?: string | null;
}): OutreachExtras {
  const { coachId, format, campaign, division } = args;

  const headers = buildListUnsubscribeHeaders(coachId);

  const rawTags: { name: string; value: string }[] = [
    { name: 'campaign', value: sanitizeTag(campaign) },
    { name: 'format', value: sanitizeTag(format) },
    { name: 'division', value: sanitizeTag(division) },
  ];
  const tags = rawTags.filter((t) => t.value.length > 0);

  return { reply_to: REPLY_TO, headers, tags };
}
