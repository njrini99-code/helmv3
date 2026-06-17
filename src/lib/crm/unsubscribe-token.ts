// ============================================================================
// CRM UNSUBSCRIBE TOKEN — shared HMAC signer/verifier + URL builder (RFC 8058)
// ============================================================================
//
// Single source of truth for the one-click List-Unsubscribe token. Extracted
// VERBATIM from src/app/api/crm/unsubscribe/route.ts so:
//   - the endpoint (GET/POST) and any sender produce/validate the SAME token, and
//   - links already in the wild keep working (same URL shape, same param names).
//
// The token is an HMAC-SHA256 of the coach id, keyed by CRM_UNSUB_SECRET (shared
// default 'helm-sports-unsub-v1' so it works out-of-the-box), truncated to the
// first 16 hex chars — exactly matching scripts/process-sequence-batch.mjs.
//
// Node-runtime only (uses node:crypto). Import from API routes / server code.
// ============================================================================
import { createHmac, timingSafeEqual } from 'node:crypto';

// Must match scripts/process-sequence-batch.mjs. Shared default works out-of-the-box; set
// CRM_UNSUB_SECRET in BOTH the local .env AND Vercel to harden (coach ids are already UUIDs).
const SECRET = process.env.CRM_UNSUB_SECRET || 'helm-sports-unsub-v1';

// Base URL for the emailed unsubscribe link. scripts/process-sequence-batch.mjs uses
// NEXT_PUBLIC_APP_URL (default https://helmsportslabs.com); keep that FIRST so existing
// links stay byte-identical, with NEXT_PUBLIC_SITE_URL / HELM_DOMAIN as fallbacks.
const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.HELM_DOMAIN ||
  'https://helmsportslabs.com'
).replace(/\/+$/, '');

/** HMAC token for a coach id — identical to tokenFor()/unsubUrl() elsewhere. */
export function signUnsubToken(coachId: string): string {
  return createHmac('sha256', SECRET).update(String(coachId)).digest('hex').slice(0, 16);
}

/** Constant-time validation of a coach id + token pair. */
export function verifyUnsubToken(coachId: string | null | undefined, token: string | null | undefined): coachId is string {
  if (!coachId || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(signUnsubToken(coachId));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The exact unsubscribe URL emailed today:
 *   {APP_URL}/api/crm/unsubscribe?c=<coachId>&t=<token>
 * (matches scripts/process-sequence-batch.mjs `unsubUrl()` param shape).
 */
export function buildUnsubUrl(coachId: string): string {
  return `${APP_URL}/api/crm/unsubscribe?c=${coachId}&t=${signUnsubToken(coachId)}`;
}
