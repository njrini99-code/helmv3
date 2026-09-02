// ============================================================================
// CRM UNSUBSCRIBE TOKEN — shared HMAC signer/verifier + URL builder (RFC 8058)
// ============================================================================
//
// Single source of truth for the one-click List-Unsubscribe token. Extracted
// VERBATIM from src/app/api/crm/unsubscribe/route.ts so:
//   - the endpoint (GET/POST) and any sender produce/validate the SAME token, and
//   - links already in the wild keep working (same URL shape, same param names).
//
// The token is an HMAC-SHA256 of the coach id, keyed by CRM_UNSUB_SECRET,
// truncated to the first 16 hex chars — exactly matching
// scripts/process-sequence-batch.mjs.
//
// Node-runtime only (uses node:crypto). Import from API routes / server code.
// ============================================================================
import { createHmac, timingSafeEqual } from 'node:crypto';

// CRM_UNSUB_SECRET is the whole authorization on this endpoint (see route.ts
// header) -- a hardcoded fallback here IS the production key the moment the
// env var is unset, which is exactly what happened (found 2026-08-01, see
// scripts/check-env-secret-fallbacks.mjs). Fail closed on SIGNING instead,
// mirroring createAdminClient()'s missing-key behaviour. Must be set in BOTH
// Vercel and whatever env scripts/process-sequence-batch.mjs runs under -- the
// two must produce byte-identical tokens.
//
// Resolved LAZILY, per call. Reading it at module scope made the throw happen at
// IMPORT time, which took down every importer (the unsubscribe GET/POST route,
// the admin send route, the process-sequences cron, crm-gmail-send,
// outreach-headers) and even `next build`, because Next imports route modules to
// read their segment config. Worse, a module that cannot load cannot run the
// legacy dual-verify path below, so in-flight unsubscribe links 500 -- and RFC
// 8058 one-click POSTs from Gmail/Yahoo retry a non-2xx and then penalise the
// sender. Signing fails closed; verification must always stay loadable.
function resolveUnsubSecret(): string | null {
  return process.env.CRM_UNSUB_SECRET || null;
}

/** Signing key. Throws (fail closed) when unset -- never sign with a source-visible key. */
function requireUnsubSecret(): string {
  const value = resolveUnsubSecret();
  if (!value) {
    throw new Error(
      'CRM_UNSUB_SECRET is not set -- refusing to sign unsubscribe tokens with a hardcoded key.',
    );
  }
  return value;
}

// VERIFY-ONLY dated dual-verify window: links emailed before this fix was
// deployed were signed with the old key. Accept those too so in-flight
// unsubscribe links keep working, without letting any NEW link use the weak key
// (nothing signs with it -- signUnsubToken() only ever uses CRM_UNSUB_SECRET,
// and scripts/process-sequence-batch.mjs fails closed too).
//
// 2026-08-27 (security scan finding F6, CWE-798): the legacy key used to be a
// PLAINTEXT LITERAL right here, and the window runs until November — so it was
// live, in source, today. The original trade-off was sound
// and is preserved: breaking a live unsubscribe link is worse than a forgeable
// suppression for a coach id someone already knows. What was wrong was WHERE the
// key lived. Anyone who could read this file could forge suppressions; now it is
// an env var like every other secret, and this file names none.
//
// FAIL-CLOSED: if CRM_UNSUB_LEGACY_SECRET is unset, the legacy branch is simply
// not consulted. That is the safe default, and it means the behaviour is now the
// owner's explicit choice rather than a literal nobody revisits. To keep
// pre-fix links working until the cutoff, set CRM_UNSUB_LEGACY_SECRET to the old
// value in production; leaving it unset retires the weak key immediately.
//
// TODO(2026-11-01): delete this block and the env var — past LEGACY_VERIFY_UNTIL
// the fallback stops being consulted regardless of whether the var is set.
const LEGACY_VERIFY_UNTIL = Date.parse('2026-11-01T00:00:00Z');

function resolveLegacyUnsubSecret(): string | null {
  const raw = process.env.CRM_UNSUB_LEGACY_SECRET?.trim();
  return raw ? raw : null;
}

// Base URL for the emailed unsubscribe link. scripts/process-sequence-batch.mjs uses
// NEXT_PUBLIC_APP_URL (default https://helmsportslabs.com); keep that FIRST so existing
// links stay byte-identical, with NEXT_PUBLIC_SITE_URL / HELM_DOMAIN as fallbacks.
const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.HELM_DOMAIN ||
  'https://helmsportslabs.com'
).replace(/\/+$/, '');

function hmacToken(coachId: string, secret: string): string {
  return createHmac('sha256', secret).update(String(coachId)).digest('hex').slice(0, 16);
}

/**
 * HMAC token for a coach id — identical to tokenFor()/unsubUrl() elsewhere. New links only.
 * Throws when CRM_UNSUB_SECRET is unset: signing fails closed.
 */
function signUnsubToken(coachId: string): string {
  return hmacToken(coachId, requireUnsubSecret());
}

function constantTimeMatch(token: string, expected: string): boolean {
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Constant-time validation of a coach id + token pair. Accepts a token signed
 * with either the current CRM_UNSUB_SECRET or — until LEGACY_VERIFY_UNTIL — the
 * legacy hardcoded key, so unsubscribe links already emailed before the
 * fail-closed fix keep working. Deliberately does NOT throw when the env var is
 * missing: an unset secret must not turn a one-click unsubscribe into a 5xx.
 * The legacy key is now read from CRM_UNSUB_LEGACY_SECRET and this branch is a
 * no-op when that is unset — see the note above it.
 */
export function verifyUnsubToken(coachId: string | null | undefined, token: string | null | undefined): coachId is string {
  if (!coachId || !token) return false;
  const secret = resolveUnsubSecret();
  if (secret && constantTimeMatch(token, hmacToken(coachId, secret))) return true;
  if (Date.now() >= LEGACY_VERIFY_UNTIL) return false;
  // Absent env var => the legacy key is retired and this branch does nothing.
  const legacy = resolveLegacyUnsubSecret();
  if (!legacy) return false;
  return constantTimeMatch(token, hmacToken(coachId, legacy));
}

/**
 * The exact unsubscribe URL emailed today:
 *   {APP_URL}/api/crm/unsubscribe?c=<coachId>&t=<token>
 * (matches scripts/process-sequence-batch.mjs `unsubUrl()` param shape).
 *
 * Throws when CRM_UNSUB_SECRET is unset — a send path must fail rather than mail
 * a link signed with a key that is readable in source. Callers are send paths, so
 * the failure surfaces as "this email did not go out", never as a broken opt-out.
 */
export function buildUnsubUrl(coachId: string): string {
  return `${APP_URL}/api/crm/unsubscribe?c=${coachId}&t=${signUnsubToken(coachId)}`;
}

/**
 * Replace the `{unsubscribe_url}` template tag with the recipient's real
 * one-click unsubscribe URL. Server-only (the token is an HMAC keyed by
 * CRM_UNSUB_SECRET), which is why mergeTags() — importable client-side for
 * previews — deliberately does NOT handle this tag. Every send path calls this
 * after mergeTags(). Templates without the tag pass through unchanged.
 */
export function applyUnsubTag(text: string, coachId: string): string {
  if (!text.includes('{unsubscribe_url}')) return text;
  return text.replace(/\{unsubscribe_url\}/g, buildUnsubUrl(coachId));
}
