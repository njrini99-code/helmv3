// =============================================================================
// Make Promise.allSettled rejections visible to the Bridge.
//
// INC-2026-08-27: `event-reminders` fanned sends out through allSettled and
// kept only a COUNT of failures. The rejection reason — the one place the cause
// existed — was discarded. Nothing threw, so the route returned 200, so
// `recordJobRun` recorded `completed`, so `admin_events` learned nothing, and
// for two days every Bridge surface reported a cron healthy while it threw on
// every run. Sentry saw it only because the Supabase driver instruments itself.
//
// A count answers "how many". Only the reason answers "what is wrong".
//
// That route was repaired in place, and the incident's follow-up 2 is to audit
// the other allSettled sites for the same shape. This is the shared helper they
// use, rather than a hand-copied idiom — the SSRF guard in this repo was
// hand-copied into two files and stayed broken in both, which is the failure
// mode a second copy invites.
//
// PURE except for the logServerError write in `reportSettledFailures`.
// =============================================================================

import { logServerError } from '@/lib/server-error-logger';

/** Bounded so one systemic failure cannot write a reason per recipient. */
export const MAX_FAILURE_REASONS = 5;

/** Longest single reason retained — enough to identify a cause, not a novel. */
const MAX_REASON_CHARS = 300;

function describeRejection(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === 'string') return reason;
  try {
    return JSON.stringify(reason) ?? String(reason);
  } catch {
    return String(reason);
  }
}

/** Collapse rejections to distinct, bounded, human-readable causes. */
export function summarizeSettledFailures(
  results: readonly PromiseSettledResult<unknown>[],
): { failed: number; reasons: string[] } {
  const seen: string[] = [];
  let failed = 0;
  for (const result of results) {
    if (result.status !== 'rejected') continue;
    failed += 1;
    if (seen.length >= MAX_FAILURE_REASONS) continue;
    const trimmed = describeRejection(result.reason).trim().slice(0, MAX_REASON_CHARS);
    if (trimmed && !seen.includes(trimmed)) seen.push(trimmed);
  }
  return { failed, reasons: seen };
}

/**
 * Await a fan-out, then write each DISTINCT rejection cause to `admin_events`
 * via logServerError so the Bridge can see it. Returns the same settled array
 * the caller would have got from Promise.allSettled, so this is a drop-in.
 *
 * Deliberately does NOT throw or change the caller's control flow: every site
 * this replaces chose allSettled because one failed recipient must not abort
 * the rest. The bug was never the control flow — it was that the cause was
 * invisible.
 */
export async function reportSettledFailures<T>(
  results: PromiseSettledResult<T>[],
  context: { action: string; featureArea?: string; label?: string },
): Promise<PromiseSettledResult<T>[]> {
  const { failed, reasons } = summarizeSettledFailures(results);
  if (failed === 0) return results;

  const scope = context.label ? `${context.action} (${context.label})` : context.action;
  for (const reason of reasons) {
    await logServerError(
      `[${scope}] ${failed} of ${results.length} failed: ${reason}`,
      { action: context.action, featureArea: context.featureArea ?? null },
    );
  }
  return results;
}

/**
 * Convenience: run the fan-out and report in one call.
 *
 * Typed on `unknown` rather than a generic on purpose. A fan-out array is
 * usually built from a conditional (`email ? sendEmail(...) : Promise.resolve()`),
 * which infers a UNION of promise types; a generic `Array<Promise<T>>` binds T
 * to the first branch and then rejects every other branch. Callers that need
 * the settled values should call Promise.allSettled themselves and pass the
 * result to `reportSettledFailures`, which keeps its generic.
 */
export async function allSettledReported(
  promises: ReadonlyArray<PromiseLike<unknown>>,
  context: { action: string; featureArea?: string; label?: string },
): Promise<PromiseSettledResult<unknown>[]> {
  return reportSettledFailures(await Promise.allSettled(promises), context);
}
