import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

type CronAuthRequest = Pick<Request, 'headers'>;

/**
 * Constant-time check of the Vercel-cron bearer secret.
 *
 * `!==` on strings short-circuits at the first differing byte, so response
 * latency leaks a prefix-match oracle. Buffer lengths must be compared FIRST —
 * timingSafeEqual THROWS on a length mismatch rather than returning false.
 */
export function cronSecretMatches(request: CronAuthRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;                    // unset secret fails closed, as before
  const provided = request.headers.get('authorization');
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireCronAuth(request: CronAuthRequest): Response | null {
  if (!cronSecretMatches(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
