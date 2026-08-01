import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { isDemoCoachEmail } from '@/lib/demo/config.server';

/**
 * GolfHelm Demo — shared-account write guard.
 *
 * Every prospect who enters the public golf demo signs into the SAME Supabase
 * account. Without a guard, one visitor's mutation is visible to — and
 * destroys the tour for — every other concurrent visitor. BaseballHelm solves
 * this inside `withBaseballAction` (`demoSafe` opt-in, fail closed); golf has
 * no equivalent action wrapper, so this module provides the same protection as
 * a one-line assertion that a mutating server action can adopt incrementally.
 *
 * Usage, at the top of a mutating action, after the auth check:
 *
 *   const { data: { user } } = await supabase.auth.getUser();
 *   if (!user) throw new Error('Unauthorized');
 *   await assertGolfDemoWritable(user.email);
 *
 * Read paths need no change — this only guards writes.
 *
 * Companion to `./baseball-config.server`. Client-safe constants live in
 * `./config`; credential reads live in `./config.server`.
 */

/**
 * Thrown when the shared golf demo account attempts a mutation.
 *
 * This is an EXPECTED control-flow outcome, not a defect — callers should
 * surface it as a friendly "the demo is read-only" message and must not report
 * it to Sentry. Mirrors `BaseballDemoReadOnlyError`.
 */
export class GolfDemoReadOnlyError extends Error {
  /** Discriminator so callers can branch without `instanceof` across bundles. */
  readonly code = 'GOLF_DEMO_READ_ONLY' as const;

  constructor(
    message = 'This is a shared read-only demo — sign up for a free account to save changes.',
  ) {
    super(message);
    this.name = 'GolfDemoReadOnlyError';
  }
}

/** True when `err` is a GolfDemoReadOnlyError, robust across bundle boundaries. */
export function isGolfDemoReadOnlyError(err: unknown): err is GolfDemoReadOnlyError {
  return (
    err instanceof GolfDemoReadOnlyError ||
    (typeof err === 'object' &&
      err !== null &&
      (err as { code?: unknown }).code === 'GOLF_DEMO_READ_ONLY')
  );
}

/**
 * Resolve whether the CURRENT session is the shared golf demo coach.
 *
 * Two call shapes, mirroring `isCurrentSessionBaseballDemo`:
 *   - `isCurrentSessionGolfDemo(user.email)` — pass an already-resolved email
 *     to avoid a redundant auth round-trip (the common case: the caller just
 *     ran `supabase.auth.getUser()` for its own auth check).
 *   - `isCurrentSessionGolfDemo()` — resolves the session itself.
 *
 * Fails CLOSED on error: if the session cannot be resolved we report `true`
 * ("treat as demo") so an uncertain caller never accidentally grants a write.
 *
 * Note this is NOT the same as the demo being unconfigured. When
 * `DEMO_COACH_EMAIL` is unset there is no reachable demo account at all — the
 * gate cannot sign anyone in — so `isDemoCoachEmail` correctly returns false
 * and real users are unaffected. Only a genuine *failure* fails closed.
 */
export async function isCurrentSessionGolfDemo(knownEmail?: string | null): Promise<boolean> {
  if (knownEmail !== undefined) {
    return isDemoCoachEmail(knownEmail);
  }
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return isDemoCoachEmail(user?.email ?? null);
  } catch {
    return true;
  }
}

/**
 * Throw `GolfDemoReadOnlyError` when the current session is the shared demo
 * account. No-op for every real user, so it is safe to add to any mutating
 * action unconditionally.
 *
 * Pass the already-resolved email when the caller has one — it skips an auth
 * round-trip and keeps the guard on the same user the action body will act as.
 */
export async function assertGolfDemoWritable(knownEmail?: string | null): Promise<void> {
  if (await isCurrentSessionGolfDemo(knownEmail)) {
    throw new GolfDemoReadOnlyError();
  }
}
