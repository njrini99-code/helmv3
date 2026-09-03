/**
 * Retry / timeout / commit-outcome model — brief §36–39.
 *
 * "Never assume client timeout == no commit." A client that times out waiting
 * on an RPC has learned NOTHING about whether the transaction committed —
 * Postgres may have finished the COMMIT after the client gave up waiting for
 * the response. Treating a timeout as "the write did not happen" is exactly
 * the class of bug that produces a silent duplicate submit on the user's next
 * retry, or a false "it failed" toast for a round that actually saved.
 *
 * Everything in this file is PURE (no Supabase client, no Sentry, no I/O of
 * its own) except `verifyDurableOutcome`, which takes the caller's read-back
 * function as a parameter rather than knowing how to query anything itself —
 * this file has no opinion on what a "durable row" looks like for any given
 * feature. Nothing here is wired into a production call site yet (brief:
 * "Do NOT wire these into src/app/golf/actions/golf.ts — owned by another
 * session"); the intended call sites are documented in
 * `docs/observability/SUPABASE_SERVICE_OBSERVABILITY.md`.
 */

// ---------------------------------------------------------------------------
// classifyCommitOutcome
// ---------------------------------------------------------------------------

export const COMMIT_OUTCOMES = [
  'TRANSPORT_TIMEOUT',
  'DURABLE_FAILURE',
  'DURABLE_SUCCESS_AFTER_TIMEOUT',
  'UNKNOWN_COMMIT',
] as const;
export type CommitOutcome = (typeof COMMIT_OUTCOMES)[number];

export type ReadBackResult = 'confirmed' | 'not_found' | 'unknown';

export interface ClassifyCommitOutcomeInput {
  /** True when the CLIENT experienced a timeout/network failure and never
   *  received a clean response — the ambiguous case this whole model exists
   *  for. False means the client got a definitive response (an error body
   *  with a SQLSTATE, or a clean success). */
  transportError: boolean;
  /** A SQLSTATE/PostgREST code the client actually received. Presence of a
   *  real code from a clean (non-timeout) response is DEFINITIVE proof of
   *  rollback (brief §2: a transaction that throws rolls back its own
   *  writes) — no read-back is needed to trust it. */
  sqlstate?: string | null;
  /** Read-back verification result, when the caller performed one. Only
   *  meaningful when `transportError` is true — that is the only case where
   *  the client's own signal is insufficient to know what happened. */
  readBack?: ReadBackResult;
}

/**
 * Classifies what a client actually knows about whether a write committed,
 * given what it observed and (when available) a read-back check. Never
 * throws — every branch below returns a value; there is no code path that
 * can reach the end of the function without one.
 *
 * Decision table:
 *   transportError=false, sqlstate present  -> DURABLE_FAILURE
 *     (a clean error response IS the rollback proof; no ambiguity)
 *   transportError=false, sqlstate absent   -> UNKNOWN_COMMIT
 *     (a caller invoking this outside an error/timeout branch is a misuse;
 *      returning UNKNOWN rather than guessing "success" keeps this function
 *      from ever asserting a durable outcome it did not actually observe)
 *   transportError=true,  readBack=confirmed -> DURABLE_SUCCESS_AFTER_TIMEOUT
 *     (the client gave up, but the write DID land — the exact case the
 *      brief's opening sentence warns against mishandling)
 *   transportError=true,  readBack=not_found -> TRANSPORT_TIMEOUT
 *     (verified: nothing committed. Safe to say the transport failed cleanly)
 *   transportError=true,  readBack=unknown/absent -> UNKNOWN_COMMIT
 *     (no read-back was possible/performed — the honest answer is "unknown",
 *      never a guess in either direction)
 */
export function classifyCommitOutcome(input: ClassifyCommitOutcomeInput): CommitOutcome {
  try {
    if (!input.transportError) {
      return input.sqlstate ? 'DURABLE_FAILURE' : 'UNKNOWN_COMMIT';
    }
    if (input.readBack === 'confirmed') return 'DURABLE_SUCCESS_AFTER_TIMEOUT';
    if (input.readBack === 'not_found') return 'TRANSPORT_TIMEOUT';
    return 'UNKNOWN_COMMIT';
  } catch {
    return 'UNKNOWN_COMMIT';
  }
}

// ---------------------------------------------------------------------------
// verifyDurableOutcome
// ---------------------------------------------------------------------------

/**
 * Bounded, fail-open read-back verification. Takes the caller's own "does
 * the expected row/state exist now" check as a function — this file has no
 * idea what a durable row looks like for any given feature — races it
 * against a timeout, and NEVER throws or rejects: any failure (the read-back
 * itself throwing, a timeout, a malformed return) resolves to `'unknown'`,
 * the same honest "I don't know" `classifyCommitOutcome` already treats as
 * non-committal in either direction.
 */
export async function verifyDurableOutcome(
  readBackFn: () => Promise<boolean>,
  options: { timeoutMs?: number } = {},
): Promise<ReadBackResult> {
  const timeoutMs = options.timeoutMs ?? 2_000;
  try {
    const outcome = await Promise.race<ReadBackResult>([
      readBackFn()
        .then((found): ReadBackResult => (found ? 'confirmed' : 'not_found'))
        .catch((): ReadBackResult => 'unknown'),
      new Promise<ReadBackResult>((resolve) => {
        setTimeout(() => resolve('unknown'), timeoutMs);
      }),
    ]);
    return outcome;
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// summarizeAttempts — retry accounting + retry-storm detection
// ---------------------------------------------------------------------------

export interface AttemptRecord {
  /** Same code-first fingerprint the envelope builds (`envelope.ts`) — the
   *  retry-storm window is evaluated PER fingerprint, never globally. */
  fingerprint: string;
  occurredAt: string; // ISO-8601
  /** 1 for the first attempt, 2 for the first retry, etc. */
  attemptNumber: number;
  success: boolean;
  /** True when no further retry will follow this attempt — either it
   *  succeeded, or the caller's retry budget is exhausted. */
  terminal: boolean;
}

export interface AttemptSummary {
  /** Every failed attempt, retries included. */
  attemptFailureCount: number;
  /** Every attempt with `attemptNumber > 1` — i.e. every attempt that IS a
   *  retry, regardless of whether that retry itself succeeded or failed. */
  retryCount: number;
  /** Every terminal attempt that succeeded. */
  finalSuccessCount: number;
  /** Every terminal attempt that failed (budget exhausted, never recovered). */
  terminalFailureCount: number;
  /** True when any one fingerprint amassed >= 5 attempts inside any 60s
   *  window (brief §49–55's retry-storm threshold). */
  retryStorm: boolean;
  /** Which fingerprints tripped the retry-storm threshold, so a caller can
   *  say WHICH mechanism is looping rather than just that one is. */
  retryStormFingerprints: string[];
}

const RETRY_STORM_WINDOW_MS = 60_000;
const RETRY_STORM_THRESHOLD = 5;

/** True when `times` (already sorted ascending) contains >= `threshold`
 *  entries inside any `windowMs`-wide window. Bounded: this file never
 *  receives more than one caller's in-memory attempt list, so the O(n^2)
 *  two-pointer scan below is intentionally simple over a batching structure
 *  that would only pay for itself on inputs this function will never see. */
function hasWindowWithAtLeast(times: number[], windowMs: number, threshold: number): boolean {
  let start = 0;
  for (let end = 0; end < times.length; end++) {
    while ((times[end] as number) - (times[start] as number) > windowMs) start++;
    if (end - start + 1 >= threshold) return true;
  }
  return false;
}

/**
 * Reduces a caller's raw attempt log into the four brief §36–39 counters
 * plus a retry-storm flag. Never throws: a malformed `occurredAt` on one
 * record is skipped from the storm-window calculation (that record still
 * counts toward the four buckets above) rather than aborting the whole
 * summary.
 */
export function summarizeAttempts(attempts: AttemptRecord[]): AttemptSummary {
  const summary: AttemptSummary = {
    attemptFailureCount: 0,
    retryCount: 0,
    finalSuccessCount: 0,
    terminalFailureCount: 0,
    retryStorm: false,
    retryStormFingerprints: [],
  };

  const byFingerprint = new Map<string, number[]>();

  for (const attempt of attempts ?? []) {
    try {
      if (!attempt.success) summary.attemptFailureCount += 1;
      if (attempt.attemptNumber > 1) summary.retryCount += 1;
      if (attempt.terminal && attempt.success) summary.finalSuccessCount += 1;
      if (attempt.terminal && !attempt.success) summary.terminalFailureCount += 1;

      const ts = Date.parse(attempt.occurredAt);
      if (Number.isFinite(ts)) {
        const bucket = byFingerprint.get(attempt.fingerprint) ?? [];
        bucket.push(ts);
        byFingerprint.set(attempt.fingerprint, bucket);
      }
    } catch {
      // A single malformed record must not abort the whole summary.
    }
  }

  for (const [fingerprint, times] of byFingerprint) {
    times.sort((a, b) => a - b);
    if (hasWindowWithAtLeast(times, RETRY_STORM_WINDOW_MS, RETRY_STORM_THRESHOLD)) {
      summary.retryStormFingerprints.push(fingerprint);
    }
  }
  summary.retryStorm = summary.retryStormFingerprints.length > 0;

  return summary;
}

// ---------------------------------------------------------------------------
// compareDurableChildCounts — full-snapshot-replacement shrink detector
// ---------------------------------------------------------------------------

export interface CompareDurableChildCountsInput {
  /** Durable child count BEFORE this write (the baseline — e.g. how many
   *  holes/shots existed durably prior to a full-snapshot save). */
  expected: number;
  /** Durable child count AFTER this write (what a post-write read-back
   *  actually found). */
  durable: number;
  /** True when the caller KNOWS this write is a deliberate edit that may
   *  legitimately remove children (the user deleted a hole/shot) — the one
   *  case a shrink is not, on its own, suspicious. */
  isEdit: boolean;
}

export interface DurableChildCountComparison {
  expected: number;
  durable: number;
  /** durable - expected; negative means children were lost. */
  delta: number;
  shrank: boolean;
  /** shrank && !isEdit — a full-snapshot replacement that reduced durable
   *  children with no caller-declared edit intent. This is the signal brief
   *  §36–39 wants surfaced "without false alarms for legitimate edits" —
   *  `isEdit` is that alarm suppressor, and ONLY that. */
  flagged: boolean;
}

/**
 * Never throws: a non-finite/negative input degrades to a `flagged: true`
 * comparison (fail toward suspicion, not toward silence) rather than
 * throwing into a save path that is already mid-write.
 */
export function compareDurableChildCounts(input: CompareDurableChildCountsInput): DurableChildCountComparison {
  const expected = Number.isFinite(input.expected) ? input.expected : 0;
  const durable = Number.isFinite(input.durable) ? input.durable : 0;
  const delta = durable - expected;
  const shrank = durable < expected;
  return {
    expected,
    durable,
    delta,
    shrank,
    flagged: shrank && !input.isEdit,
  };
}
