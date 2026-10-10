/**
 * The Bridge all-clear verdict: may a screen say "All clear" right now?
 *
 * `canClaimAllClear` (`./sources.ts`) answers a narrower question, "is any
 * source blind or unknown", and deliberately lets a PARTIAL source through,
 * so an empty list over a half-read source can still say "Nothing needs
 * attention". That is right for one list's empty state and too weak for a
 * page-level headline, which is a stronger claim and needs stronger evidence:
 *
 *   1. Every source READING. `blindnessNote` is null only when no source is
 *      blind, partial or unknown (`describeBlindness`), which also makes the
 *      all-clear banner and the `BlindnessBeacon` mutually exclusive by
 *      construction: the beacon renders exactly when this check fails.
 *   2. Nothing open in the window: zero actionable, regressed, repairable and
 *      stalled incidents. A calm posture alone is NOT enough, because
 *      `selectAttention` returns no row for a fresh, actionable error that is
 *      still inside its triage window. Posture can read healthy while the
 *      Incidents tab lists a real defect; this check is what stops the
 *      headline from saying otherwise (pinned in `all-clear.test.ts`).
 *   3. Where a posture and an attention list exist (the Overview), posture
 *      healthy and an empty attention list. Those cover what the incident
 *      counts cannot: briefing checks, dead self-heal stages, an unreadable
 *      self-heal board and an unknown release watch.
 *   4. No release alarm. Posture only refuses an UNKNOWN release watch; a
 *      `degraded` or `regression-detected` watch (any new or regressed
 *      incident since the deploy, actionable or not) leaves posture calm. A
 *      headline reading "All clear" above a release pill reading DEGRADED
 *      would contradict itself, so an alarm state refuses here.
 *   5. The older backlog was READ. Unresolved errors that went quiet before
 *      the window (`staleUnresolved`) never fold into the window's counts, so
 *      they are checked on their own. Readable and empty is a full
 *      `all-clear`; readable with items is a `window-clear`, which names them
 *      and never says "All clear"; unreadable makes no claim at all.
 *
 * Pure and I/O-free (structural inputs only, no server-only imports), so the
 * same rule serves the Overview and the Incidents tab. A refused verdict
 * carries the first failing check as `blockedBy`, so a test can say exactly
 * why a board was refused.
 */

import type { CoverageSummary } from './sources';
import type { IncidentLensCounts } from './types';
import type { ReleaseWatchState } from './release-context';

export type AllClearBlocker =
  | 'no-sources'
  | 'coverage'
  | 'posture'
  | 'attention'
  | 'release'
  | 'open-incidents'
  | 'backlog-unreadable';

/** Release Watch states that are an alarm about the current deploy. `unknown`
 *  is not one of them: it is a missing reading, which posture already refuses
 *  where a posture exists, and which the Incidents tab states in its own
 *  Release Watch panel. */
const RELEASE_ALARM: ReadonlySet<ReleaseWatchState> = new Set([
  'degraded',
  'regression-detected',
  'rollback-recommended',
]);

export interface AllClearInput {
  /** `IncidentBoard.blindnessNote`: null only when every source is reading. */
  blindnessNote: string | null;
  coverage: Pick<CoverageSummary, 'reading' | 'total'>;
  /** Board-level lens counts, the same four the Incidents summary line shows. */
  lensCounts: Pick<IncidentLensCounts, 'actionable' | 'regressions' | 'repairable' | 'stalled'>;
  /** `IncidentBoard.staleUnresolved`, reduced to what the verdict needs. */
  staleUnresolved: { readable: boolean; count: number };
  windowHours: number;
  /** ISO time the board was computed; the banner shows it as "checked". */
  checkedAt: string;
  /** Overview only: `derivePostureSentence(...).tone === 'healthy'`. Omit on
   *  a screen that computes no posture. */
  postureHealthy?: boolean;
  /** Overview only: every `selectAttention` row, not the displayed slice. */
  attentionTotal?: number;
  /** The Release Watch state the same screen renders, when it renders one. */
  releaseWatch?: ReleaseWatchState;
}

export interface AllClearClaim {
  /** `all-clear`: nothing open anywhere we can read. `window-clear`: nothing
   *  in the window, but `olderOpenCount` older errors are still open. */
  state: 'all-clear' | 'window-clear';
  windowHours: number;
  sourcesReading: number;
  sourcesTotal: number;
  checkedAt: string;
  /** Unresolved errors quiet for longer than the window. 0 for `all-clear`. */
  olderOpenCount: number;
}

export type AllClearVerdict = AllClearClaim | { state: 'none'; blockedBy: AllClearBlocker };

function refuse(blockedBy: AllClearBlocker): AllClearVerdict {
  return { state: 'none', blockedBy };
}

export function deriveAllClear(input: AllClearInput): AllClearVerdict {
  const { coverage, lensCounts } = input;

  if (coverage.total <= 0) return refuse('no-sources');
  // Both, not either: the note is the screen's own wording of the same fact,
  // and a caller that ever passes the two out of step must still be refused.
  if (input.blindnessNote !== null || coverage.reading !== coverage.total) return refuse('coverage');
  if (input.postureHealthy === false) return refuse('posture');
  if ((input.attentionTotal ?? 0) > 0) return refuse('attention');
  if (input.releaseWatch !== undefined && RELEASE_ALARM.has(input.releaseWatch)) return refuse('release');

  const open = lensCounts.actionable + lensCounts.regressions + lensCounts.repairable + lensCounts.stalled;
  if (open > 0) return refuse('open-incidents');

  if (!input.staleUnresolved.readable) return refuse('backlog-unreadable');

  const olderOpenCount = Math.max(0, input.staleUnresolved.count);
  return {
    state: olderOpenCount > 0 ? 'window-clear' : 'all-clear',
    windowHours: input.windowHours,
    sourcesReading: coverage.reading,
    sourcesTotal: coverage.total,
    checkedAt: input.checkedAt,
    olderOpenCount,
  };
}

/** "72 hours", "24 hours", "7 days": the window in words, for the headline. */
export function describeWindow(hours: number): string {
  if (hours > 0 && hours % 24 === 0 && hours >= 168) {
    const days = hours / 24;
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}
