import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, getClientIdentifier, type RateLimitConfig } from '@/lib/rate-limit';
import { logServerError } from '@/lib/server-error-logger';

/**
 * The read-only door for Claude Duet (plan §9.2, owner decision D9): GET routes under /api/admin/clubhouse/duet that
 * return packs and drift as JSON, authenticated by a bearer token only Duet holds.
 *
 * Off by default. With BRIDGE_DUET_TOKEN unset (or shorter than 32 characters) every route answers 404 and does
 * nothing else: no graph read, no database read, no audit row. The owner turns it on by adding the token on the
 * server; nothing in the repo sets it.
 *
 * Names never leave by default. A request's `names=1` is honoured only when BRIDGE_DUET_ALLOW_NAMES is "1" as well;
 * otherwise people come back as pseudonymous ids (D7).
 */
export const DUET_TOKEN_ENV = 'BRIDGE_DUET_TOKEN';
export const DUET_NAMES_ENV = 'BRIDGE_DUET_ALLOW_NAMES';
/** A token shorter than this is treated as unset: a short secret is a guessable one. */
export const DUET_TOKEN_MIN_LENGTH = 32;
/** Per caller address, counted before the token is checked, so a guesser is slowed as much as Duet. */
export const DUET_RATE_LIMIT: RateLimitConfig = { maxRequests: 60, windowSeconds: 60 };

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

const digest = (s: string) => createHash('sha256').update(s).digest();

export type DuetAccess = { ok: true; namesAllowed: boolean; caller: string } | { ok: false; response: NextResponse };

/** Is the door on at all? */
export function duetEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env[DUET_TOKEN_ENV]?.length ?? 0) >= DUET_TOKEN_MIN_LENGTH;
}

/**
 * 404 when the door is off, 429 past the rate limit, 401 without the exact bearer token. The comparison is over
 * SHA-256 digests with timingSafeEqual, so neither the token's bytes nor its length leak through timing.
 */
export function duetAccess(request: Pick<Request, 'headers'>, env: Record<string, string | undefined> = process.env): DuetAccess {
  if (!duetEnabled(env)) {
    return { ok: false, response: NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE }) };
  }
  const caller = createHash('sha256').update(getClientIdentifier(request.headers as Headers)).digest('hex').slice(0, 16);
  const limit = checkRateLimit(`bridge-duet:${caller}`, DUET_RATE_LIMIT);
  if (!limit.success) {
    const retry = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
    return { ok: false, response: NextResponse.json({ error: 'rate limited' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(retry) } }) };
  }
  const provided = request.headers.get('authorization') ?? '';
  const matches = timingSafeEqual(digest(provided), digest(`Bearer ${env[DUET_TOKEN_ENV]}`));
  if (!matches) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { ...NO_STORE, 'WWW-Authenticate': 'Bearer realm="helm-bridge-duet"' } }),
    };
  }
  return { ok: true, namesAllowed: env[DUET_NAMES_ENV] === '1', caller };
}

/** Names only when the request asks AND the owner's switch allows it. */
export function namesFor(request: { nextUrl: URL }, access: Extract<DuetAccess, { ok: true }>): boolean {
  return access.namesAllowed && request.nextUrl.searchParams.get('names') === '1';
}

export function duetJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * Every successful read is written to audit_log (plan §9.2), best effort: a failed audit write is logged as a
 * warning and never fails the read. No user is behind the token, so user_id is null and the caller is a hash.
 */
export async function auditDuetRead(path: string, target: string | null, names: boolean, caller: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('audit_log').insert({
      user_id: null,
      action: 'bridge.duet.read',
      table_name: 'bridge_duet',
      record_id: target,
      new_data: { path, names, caller },
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    await logServerError(
      `[bridge-duet] audit_log write failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'admin.bridge_duet.audit_write_failed', featureArea: 'admin', metadata: { path } },
      'warning',
    ).catch(() => {});
  }
}
