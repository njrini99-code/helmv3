/**
 * A single, narrow entry point for adding Sentry breadcrumbs to critical
 * client interactions (round autosave, shot save, submit outcomes, auth,
 * CoachHelm, navigation) — so every call site shares one allow-list instead
 * of each one deciding for itself what's safe to attach.
 *
 * WHY AN ALLOW-LIST INSTEAD OF A BLOCK-LIST. This repo's roster/recruiting
 * data is exactly what `src/lib/observability/redact-pii.ts` and
 * `instrumentation-client.ts`'s `beforeSend` already scrub defensively —
 * emails, cookies, auth headers, URL tokens. A breadcrumb helper that takes
 * an arbitrary `data` bag and hopes callers remember not to pass a player
 * name or id is the same shape of mistake `beforeSend` exists to catch
 * downstream. Restricting the TYPE to five known-safe keys means a caller
 * cannot pass an id/name/email without an explicit `as` cast — and the
 * runtime filter strips anything else anyway, in case one shows up.
 *
 * Never throws: a breadcrumb helper is best-effort observability wired into
 * save/submit outcome handlers, and a bug in *this* file must never break
 * the outcome handling it was added next to.
 */

import * as Sentry from '@sentry/nextjs';

export type HelmBreadcrumbCategory =
  | 'golf.round'
  | 'golf.shot'
  | 'coachhelm'
  | 'auth'
  | 'navigation';

/**
 * Every key this helper will ever forward to Sentry. Deliberately excludes
 * anything identifying — no round id, player id, name, or email has a slot
 * here. `count` and `round_ordinal` are numeric/positional only (e.g. "3rd
 * autosave retry", "hole 7 of 18"), never a database id.
 */
const ALLOWED_DATA_KEYS = ['feature', 'action', 'result', 'count', 'round_ordinal'] as const;

type AllowedDataKey = (typeof ALLOWED_DATA_KEYS)[number];

export type HelmBreadcrumbData = Partial<Record<AllowedDataKey, string | number | boolean>>;

/**
 * Add a breadcrumb for a critical Helm interaction. Silently strips any key
 * outside the allow-list (defense in depth against an `as` cast bypassing
 * the type) and never throws — a failure inside Sentry's own `addBreadcrumb`
 * (e.g. the SDK not yet initialized) is swallowed, not surfaced.
 */
export function recordHelmBreadcrumb(
  category: HelmBreadcrumbCategory,
  message: string,
  data?: HelmBreadcrumbData,
): void {
  try {
    const filtered: Record<string, string | number | boolean> = {};
    if (data) {
      for (const key of ALLOWED_DATA_KEYS) {
        const value = data[key];
        if (value !== undefined) {
          filtered[key] = value;
        }
      }
    }
    Sentry.addBreadcrumb({
      category,
      message,
      level: 'info',
      ...(Object.keys(filtered).length > 0 ? { data: filtered } : {}),
    });
  } catch {
    // Best-effort only — never let a breadcrumb failure break the
    // save/submit outcome handler it was added next to.
  }
}
