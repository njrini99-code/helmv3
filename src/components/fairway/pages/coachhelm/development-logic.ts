/**
 * ============================================================================
 * Player development, pure derivations (player-development.v3.md)
 * ----------------------------------------------------------------------------
 * Every rollup the development screen renders is computed here so the
 * components read rather than derive, per IMPLEMENTING.md. Nothing in this
 * file reads a clock, formats against an unpinned locale, or invents a value
 * that was never logged.
 *
 * The load-bearing piece is `explainProgress`. `getProgressPercent`
 * (areaTypes.ts:361-387) answers "how far along" with a number or `null`, and
 * that single `null` covers six different real situations: no target, no
 * starting value, nothing logged yet, a metric whose direction is unknown, a
 * target equal to the starting value, and a target on the wrong side of it.
 * A screen that prints one caption for all six lies about five of them, and a
 * screen that re-derives its own parallel condition list drifts from the
 * shipped function the first time either changes. `explainProgress` mirrors
 * that function's branches exactly and names which one fired;
 * `progressPctOf` collapses it back to the identical number, and a test pins
 * the two in agreement over a table of cases so the mirror cannot rot.
 * ========================================================================== */

import { getProgressPercent, resolveMetricDirection } from './areaTypes';
import { focusAreaTrendEntries, type FocusAreaCardData } from './FocusAreaCard';
import { pickLeadArea } from './development-parts';
import type { CausalRelationshipRow } from '@/app/golf/actions/causal-relationships';

/** One clause of the masthead verdict; `href` makes it a link. */
export interface VerdictPart {
  text: string;
  href?: string;
}

/* ── Progress, with the reason ──────────────────────────────────────────── */

export type ProgressRead =
  /** A real position on the journey. `raw` is un-floored (see below). */
  | { kind: 'ok'; pct: number; raw: number }
  /** The target has been reached; every screen prints 100. */
  | { kind: 'met'; pct: 100; raw: 100 }
  | { kind: 'no-target' }
  | { kind: 'no-baseline' }
  | { kind: 'no-current' }
  | { kind: 'unknown-direction' }
  | { kind: 'target-is-start' }
  | { kind: 'target-wrong-way' };

/**
 * `getProgressPercent`'s own branches, in its own order, each one named.
 *
 * `raw` differs from `pct` in exactly one way: it drops the `Math.max(0, …)`
 * floor on the last line of `getProgressPercent`. That floor is right for a
 * printed percentage (a player has not travelled a negative share of their
 * journey) but wrong for a plotted mark, because it renders a player who has
 * slipped past their own starting point at the same pixel as one who has not
 * moved at all. The stage plots `raw` and prints `pct`.
 */
export function explainProgress(
  current: number | null | undefined,
  target: number | null | undefined,
  targetMetric: string | null | undefined,
  baseline: number | null | undefined,
): ProgressRead {
  // getProgressPercent guards all three together; they are separated here
  // only to name the one that is actually absent. Order is by what the player
  // can act on first: set a target, then record a starting value, then log.
  if (target == null) return { kind: 'no-target' };
  if (baseline == null) return { kind: 'no-baseline' };
  if (current == null) return { kind: 'no-current' };

  const direction = resolveMetricDirection(targetMetric);
  if (direction === 'unknown') return { kind: 'unknown-direction' };

  // Checked BEFORE the span guards, exactly as the shipped function does: a
  // satisfied objective is 100 even when a late-stamped baseline puts the
  // target on the "wrong" side of it.
  const met = direction === 'lower' ? current <= target : current >= target;
  if (met) return { kind: 'met', pct: 100, raw: 100 };

  const span = target - baseline;
  if (span === 0) return { kind: 'target-is-start' };
  if (direction === 'lower' && span > 0) return { kind: 'target-wrong-way' };
  if (direction === 'higher' && span < 0) return { kind: 'target-wrong-way' };

  const travelled = current - baseline;
  const raw = Math.round((travelled / span) * 100);
  return { kind: 'ok', pct: Math.max(0, Math.min(100, raw)), raw: Math.min(100, raw) };
}

/** The number `getProgressPercent` would return for the same inputs. */
export function progressPctOf(read: ProgressRead): number | null {
  return read.kind === 'ok' || read.kind === 'met' ? read.pct : null;
}

/** The caption a row shows instead of a track, or null when it has a track. */
export function progressCaption(read: ProgressRead): string | null {
  switch (read.kind) {
    case 'no-target':
      return 'No target set.';
    case 'no-baseline':
      return 'No starting value on record.';
    case 'no-current':
      return 'Nothing logged yet.';
    case 'unknown-direction':
      return 'No direction known for this metric.';
    case 'target-is-start':
      return 'Target is where you started.';
    case 'target-wrong-way':
      return 'Target points away from the starting value.';
    default:
      return null;
  }
}

/** `explainProgress` for a focus area's own current value. */
export function areaProgressRead(fa: FocusAreaCardData): ProgressRead {
  return explainProgress(fa.current_value, fa.target_value, fa.target_metric, fa.baseline_value);
}

/** `explainProgress` for ONE dated reading of a focus area. */
export function readingProgressRead(fa: FocusAreaCardData, value: number): ProgressRead {
  return explainProgress(value, fa.target_value, fa.target_metric, fa.baseline_value);
}

/* ── The plottable row ──────────────────────────────────────────────────── */

export interface FieldMark {
  day: string;
  value: number;
  /** Un-floored percent: below 0 is a slip past the starting value. */
  raw: number;
  pct: number;
}

export type FieldRowState =
  | { kind: 'plot'; marks: FieldMark[] }
  /** Exactly one reading: a mark, never a line, never a trend. */
  | { kind: 'single'; mark: FieldMark }
  | { kind: 'no-readings' }
  | { kind: 'caption'; caption: string };

/**
 * What one stage row can honestly draw. A row is plottable only when the
 * shipped progress function returns a number for its readings; anything else
 * is a named caption, never a mark at a guessed position.
 */
export function fieldRowState(fa: FocusAreaCardData): FieldRowState {
  const areaRead = areaProgressRead(fa);
  // The row-level reasons (no target, unknown direction, bad span) hold for
  // every reading, so they are settled once, before touching the series. A
  // missing CURRENT value is not one of them: the series may still carry
  // readings even when the denormalized current_value is absent.
  if (areaRead.kind !== 'ok' && areaRead.kind !== 'met' && areaRead.kind !== 'no-current') {
    return { kind: 'caption', caption: progressCaption(areaRead) as string };
  }

  const marks: FieldMark[] = [];
  for (const entry of focusAreaTrendEntries(fa)) {
    const read = readingProgressRead(fa, entry.value);
    if (read.kind !== 'ok' && read.kind !== 'met') continue;
    marks.push({ day: entry.day, value: entry.value, raw: read.raw, pct: read.pct });
  }

  if (marks.length === 0) return { kind: 'no-readings' };
  if (marks.length === 1) return { kind: 'single', mark: marks[0]! };
  return { kind: 'plot', marks };
}

/**
 * A mark's hue, read against the BASELINE rule, never against the mark
 * before it. Colouring each mark against its predecessor would turn a noisy
 * series into alternating confetti and would make the hue mean "the last
 * step" rather than "where you are"; against a fixed reference the row reads
 * as a shape, the way ScoreField's bars read against par. It also makes the
 * un-floored mark self-explanatory: a mark below the rule is amber because it
 * is below the rule, not because of a separate rule about backslides.
 */
export function markTone(raw: number): 'good' | 'warn' | 'neutral' {
  if (raw > 0) return 'good';
  if (raw < 0) return 'warn';
  return 'neutral';
}

export type RowReadout =
  | { kind: 'pct'; pct: number }
  /** Below the starting value: print the value and the phrase, no percent. */
  | { kind: 'below-start' }
  | { kind: 'caption'; caption: string };

/**
 * What the row prints beside its track.
 *
 * The clamped `getProgressPercent` return stays the number every other screen
 * agrees with, but it must not sit next to the one mark it disagrees with: a
 * reading below the baseline plots below the rule while the clamped percent
 * reads 0, and a reader seeing a point below the line labelled zero has to
 * decide which of the two is lying. Neither is, and they cannot know that. So
 * below the baseline the row prints its value and says it is below where the
 * player started, and the percent simply is not in that eyeline.
 */
export function rowReadout(state: FieldRowState): RowReadout {
  const latest =
    state.kind === 'plot' ? state.marks[state.marks.length - 1]! : state.kind === 'single' ? state.mark : null;
  if (latest) return latest.raw < 0 ? { kind: 'below-start' } : { kind: 'pct', pct: latest.pct };
  const caption = thinRowCaption(state);
  return { kind: 'caption', caption: caption ?? '' };
}

/** Copy for the below-baseline readout. */
export const BELOW_START_PHRASE = 'Below where you started.';

/** The caption under a row that cannot draw a trend yet. */
export function thinRowCaption(state: FieldRowState): string | null {
  if (state.kind === 'no-readings') return 'No readings yet. Log one to start the line.';
  if (state.kind === 'single') return 'One reading. Log a second to see movement.';
  if (state.kind === 'caption') return state.caption;
  return null;
}

/* ── The shared date axis ───────────────────────────────────────────────── */

export interface FieldDomain {
  start: string;
  end: string;
}

/**
 * The x domain every row shares: the earliest reading or start date on the
 * page, to `todayIso`. The caller supplies today rather than this module
 * reading a clock, so the same input always renders the same markup.
 */
export function fieldDomain(
  areas: readonly FocusAreaCardData[],
  todayIso: string,
): FieldDomain | null {
  // Collected in a plain loop rather than a closure: a value assigned only
  // inside a callback is invisible to control-flow analysis, which then
  // narrows the comparison operand to `never`.
  const days: string[] = [];
  for (const fa of areas) {
    if (fa.started_at) days.push(fa.started_at.slice(0, 10));
    for (const entry of focusAreaTrendEntries(fa)) {
      if (entry.day) days.push(entry.day.slice(0, 10));
    }
  }
  const first = days[0];
  if (first === undefined) return null;
  let start = first;
  for (const day of days) if (day < start) start = day;
  const end = todayIso.slice(0, 10);
  // A start date in the future would otherwise draw a backwards axis.
  return { start, end: end > start ? end : start };
}

/* ── Movement, only where direction is legible ──────────────────────────── */

export interface MovementCounts {
  improving: number;
  declining: number;
  flat: number;
  /** Areas with two or more readings AND a resolved metric direction. */
  legible: number;
}

/**
 * Counted ONLY over areas whose direction resolves and which carry at least
 * two readings. An area with one reading is not moving or sliding, it is
 * unread, and counting it either way would be a claim the data cannot make.
 */
export function movementCounts(areas: readonly FocusAreaCardData[]): MovementCounts {
  let improving = 0;
  let declining = 0;
  let flat = 0;
  for (const fa of areas) {
    const direction = resolveMetricDirection(fa.target_metric);
    if (direction === 'unknown') continue;
    const entries = focusAreaTrendEntries(fa);
    if (entries.length < 2) continue;
    const delta = entries[entries.length - 1]!.value - entries[0]!.value;
    if (delta === 0) flat += 1;
    else if (direction === 'lower' ? delta < 0 : delta > 0) improving += 1;
    else declining += 1;
  }
  return { improving, declining, flat, legible: improving + declining + flat };
}

/* ── The verdict ────────────────────────────────────────────────────────── */

export interface DevelopmentVerdictInput {
  activeAreas: readonly FocusAreaCardData[];
  causalRelationships?: readonly CausalRelationshipRow[];
  proposedCount: number;
  suggestionCount: number;
}

/**
 * The masthead sentence, as clauses. Each clause renders only when its input
 * exists; an unmet clause is omitted rather than guessed. The one exception is
 * the movement clause, which states that direction is not yet legible instead
 * of disappearing, because silently dropping it would hide how thin the data
 * still is.
 */
export function buildDevelopmentVerdict(input: DevelopmentVerdictInput): VerdictPart[] {
  const { activeAreas, causalRelationships = [], proposedCount, suggestionCount } = input;
  const parts: VerdictPart[] = [];

  if (activeAreas.length === 0) {
    parts.push({ text: 'Nothing in progress yet.' });
  } else {
    const n = activeAreas.length;
    parts.push({ text: `${n} focus area${n === 1 ? '' : 's'} in progress.` });

    const lead = pickLeadArea(activeAreas, causalRelationships);
    if (lead?.title) {
      parts.push({ text: ' ' });
      parts.push({ text: lead.title, href: `#area-${lead.id}` });
      parts.push({ text: ' needs it most.' });
    }

    const moves = movementCounts(activeAreas);
    if (moves.legible === 0) {
      parts.push({ text: ' Not enough readings yet to call direction.' });
    } else {
      parts.push({ text: ` ${moves.improving} moving, ${moves.declining} sliding.` });
    }
  }

  const decisions = proposedCount + suggestionCount;
  if (decisions > 0) {
    parts.push({ text: ' ' });
    parts.push({ text: `${decisions} waiting on you`, href: '#decisions' });
    parts.push({ text: '.' });
  }

  return parts;
}

/** The verdict as one plain string, for aria and for tests. */
export function verdictText(parts: readonly VerdictPart[]): string {
  return parts.map((p) => p.text).join('');
}

/* ── The readings log (the table) ───────────────────────────────────────── */

export interface ReadingLogRow {
  key: string;
  areaId: string;
  areaTitle: string;
  targetMetric: string | null;
  day: string;
  value: number;
  /** Signed change from this area's previous reading; null for its first. */
  change: number | null;
  /** True when `change` moves toward the target for this metric. */
  towardTarget: boolean | null;
  note: string | null;
  completed: boolean;
}

/**
 * Every dated reading across active and completed areas, newest first. This
 * is the evidence behind the stage, not a restatement of it: each row is one
 * value a player actually logged, with the note they wrote at the time.
 *
 * `change` is blank on an area's first reading. It is never 0 for "no
 * previous reading", which would read as "no movement" and be a lie.
 */
export function readingsLog(
  activeAreas: readonly FocusAreaCardData[],
  completedAreas: readonly FocusAreaCardData[] = [],
): ReadingLogRow[] {
  const rows: ReadingLogRow[] = [];
  const push = (fa: FocusAreaCardData, completed: boolean) => {
    const entries = focusAreaTrendEntries(fa);
    const direction = resolveMetricDirection(fa.target_metric);
    // progressHistory carries the player's own note; snapshots do not. Keyed
    // by day so a note lands on the reading it was written for.
    const noteByDay = new Map<string, string>();
    for (const e of fa.progressHistory ?? []) {
      if (e?.at && typeof e.note === 'string' && e.note.trim() !== '') {
        noteByDay.set(e.at.slice(0, 10), e.note.trim());
      }
    }
    entries.forEach((entry, i) => {
      const prev = i > 0 ? entries[i - 1]! : null;
      const change = prev ? entry.value - prev.value : null;
      rows.push({
        key: `${fa.id}-${entry.day}`,
        areaId: fa.id,
        areaTitle: fa.title ?? 'Untitled area',
        targetMetric: fa.target_metric ?? null,
        day: entry.day,
        value: entry.value,
        change,
        towardTarget:
          change === null || change === 0 || direction === 'unknown'
            ? null
            : direction === 'lower'
              ? change < 0
              : change > 0,
        note: noteByDay.get(entry.day) ?? null,
        completed,
      });
    });
  };
  for (const fa of activeAreas) push(fa, false);
  for (const fa of completedAreas) push(fa, true);
  return rows.sort((a, b) => (a.day === b.day ? a.areaTitle.localeCompare(b.areaTitle) : b.day.localeCompare(a.day)));
}

/** Re-exported so callers never reach for a second progress derivation. */
export { getProgressPercent };
