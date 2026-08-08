import 'server-only';

import { createHmac, createHash, timingSafeEqual, randomBytes } from 'crypto';

/**
 * GolfHelm — coach-issued staff invitations.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A JOIN CODE
 * ----------------------------------------------
 * The first attempt at staff invitation let someone become a coach — or a
 * program administrator — by submitting a team's JOIN CODE together with the
 * role they wanted. That is unsafe: the join code is deliberately handed to
 * every player on the roster so they can sign up. Any athlete could have made
 * themselves head coach of the whole program.
 *
 * So a staff invite is a different kind of thing entirely:
 *
 *   • it is MINTED by someone who already holds head_coach on that team, and
 *   • the ROLE travels inside the signed token, never in the request.
 *
 * A player cannot produce one, and a recipient cannot upgrade one — flipping
 * "coach" to "admin" invalidates the signature.
 *
 * KEY MATERIAL
 * ------------
 * Derived by domain-separated hashing from COACHHELM_INTERNAL_SECRET — a
 * purpose-made server secret that already exists in every environment, so this
 * needs no deploy-time configuration (a missing secret fails closed, which
 * would silently disable staff invites in production).
 *
 * Deliberately NOT the service-role key. An earlier draft keyed the HMAC off
 * SUPABASE_SERVICE_ROLE_KEY and the Review Gate's `no-service-role-key` rule
 * rejected it — correctly. That key is a database credential whose blast
 * radius is the whole database, it is allowlisted to the admin client alone,
 * and reusing a credential as a signing key couples two rotations that should
 * stay independent. The derivation is one-way either way.
 *
 * KNOWN LIMIT — deliberately accepted
 * -----------------------------------
 * The token is bearer, expiry-bounded, and NOT single-use: anyone the link is
 * forwarded to can redeem it until it expires. That is the same trade every
 * emailed invite link makes, and it is bounded to 72 hours. Making it strictly
 * single-use needs a redemption table; if that becomes necessary, store the
 * nonce (`n`) below and reject a replay.
 */

/** Invites expire 72h after minting. */
export const STAFF_INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export type StaffInviteRole = 'coach' | 'admin';

export interface StaffInvitePayload {
  /** Team the invite was minted against. */
  t: string;
  /** Organization that team belongs to. */
  o: string;
  /** Role being granted — the ONLY source of truth for it. */
  r: StaffInviteRole;
  /** Expiry, epoch ms. */
  e: number;
  /** Nonce, so two invites for the same team+role are distinguishable. */
  n: string;
}

function inviteKey(): Buffer | null {
  const secret = process.env.COACHHELM_INTERNAL_SECRET?.trim();
  if (!secret) return null;
  // Domain-separated derivation — this key signs staff invites and nothing
  // else, and cannot be reversed into the source secret.
  return createHash('sha256').update(`golf-staff-invite:v1:${secret}`).digest();
}

const b64u = (b: Buffer) => b.toString('base64url');

/** Mint a signed invite token. Callers MUST gate on head-coach first. */
export function signStaffInvite(
  teamId: string,
  organizationId: string,
  role: StaffInviteRole,
  now: number = Date.now(),
): string | null {
  const key = inviteKey();
  if (!key) return null;
  const payload: StaffInvitePayload = {
    t: teamId,
    o: organizationId,
    r: role,
    e: now + STAFF_INVITE_TTL_MS,
    n: randomBytes(9).toString('base64url'),
  };
  const body = b64u(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = b64u(createHmac('sha256', key).update(body).digest());
  return `${body}.${sig}`;
}

export type StaffInviteFailure =
  | 'unconfigured'
  | 'malformed'
  | 'bad-signature'
  | 'expired';

export type StaffInviteVerification =
  | { ok: true; payload: StaffInvitePayload }
  | { ok: false; reason: StaffInviteFailure };

/**
 * Verify a token and recover its payload.
 *
 * The signature is checked BEFORE the payload is trusted for anything, and
 * compared in constant time so the check cannot be probed byte by byte.
 */
export function verifyStaffInvite(
  token: string | null | undefined,
  now: number = Date.now(),
): StaffInviteVerification {
  const key = inviteKey();
  if (!key) return { ok: false, reason: 'unconfigured' };

  const raw = (token ?? '').trim();
  const dot = raw.indexOf('.');
  if (dot <= 0 || dot === raw.length - 1) return { ok: false, reason: 'malformed' };

  const body = raw.slice(0, dot);
  const provided = Buffer.from(raw.slice(dot + 1), 'base64url');
  const expected = createHmac('sha256', key).update(body).digest();
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: 'bad-signature' };
  }

  let payload: StaffInvitePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StaffInvitePayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (
    typeof payload?.t !== 'string' || !payload.t ||
    typeof payload?.o !== 'string' || !payload.o ||
    (payload?.r !== 'coach' && payload?.r !== 'admin') ||
    typeof payload?.e !== 'number'
  ) {
    return { ok: false, reason: 'malformed' };
  }

  if (payload.e <= now) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}
