import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Read-only impersonation token. Format: userId.expiresMs.hmac
 * HMAC-SHA256 over `${userId}.${expiresMs}` with ADMIN_IMPERSONATION_SECRET.
 * READ-ONLY BY CONSTRUCTION: this cookie only unlocks /admin view-as pages
 * rendered from gated service-role reads — it is never a session for the
 * target user, so writes as them are impossible.
 *
 * The userId is embedded in PLAIN TEXT (not base64url-encoded) — target ids
 * are Supabase UUIDs, which never contain `.`, so the `.`-delimited 3-part
 * format is unambiguous. This also keeps the token tamper-EVIDENT at the
 * character level: mutating any byte of the id segment changes the exact
 * bytes the HMAC was computed over, so `verifyViewAsToken` rejects it. (An
 * earlier base64url-encoded-id draft was tamper-safe in principle but not
 * in a way a byte-level substitution attack against the encoded id could
 * exercise — this plain-text form is the simpler, equally-safe choice: the
 * HMAC — not encoding — is what makes tampering detectable.)
 */

export const VIEW_AS_COOKIE = 'helm_bridge_view_as';
export const VIEW_AS_TTL_MS = 15 * 60 * 1000;

function hmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signViewAsToken(
  targetUserId: string,
  expiresAtMs: number,
  secret: string,
): string {
  const payload = `${targetUserId}.${expiresAtMs}`;
  return `${payload}.${hmac(payload, secret)}`;
}

export function verifyViewAsToken(
  token: string | undefined,
  secret: string | undefined,
  now: Date,
): { valid: true; targetUserId: string; expiresAtMs: number } | { valid: false } {
  if (!token || !secret) return { valid: false };
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false };
  const [targetUserId, expiresRaw, mac] = parts as [string, string, string];
  const expected = hmac(`${targetUserId}.${expiresRaw}`, secret);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false };
  const expiresAtMs = Number(expiresRaw);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) return { valid: false };
  return { valid: true, targetUserId, expiresAtMs };
}
