/**
 * ============================================================================
 * CoachHelm · chat · provenance — the envelope every number travels inside
 * ----------------------------------------------------------------------------
 * The old grounding check asked one question: "did a tool run?" That proves
 * almost nothing. A tool can run, return three rounds, and the model can still
 * write "his make rate fell from 71% to 58%" out of thin air — the check passes
 * because *a* tool ran, not because those two numbers came from it.
 *
 * So a statistic is no longer a bare number. It is a {@link Measurement}: a
 * value plus everything a coach would need to decide whether to believe it —
 * what was measured, of whom, over which dates, from how many rounds, computed
 * when, by which method, and how complete the underlying data was.
 *
 * Three rules follow from that shape, and they are enforced, not documented:
 *
 *   1. Tools return Measurements. Never a loose float.
 *   2. The renderers draw from Measurements. A chart's points and a table's
 *      cells are tool output, never model prose that got parsed.
 *   3. {@link auditNumericClaims} reads the model's finished text and checks
 *      each number in it against the Measurements that turn actually produced.
 *      A number with no source is a fabrication, and we say so rather than
 *      shipping it.
 *
 * `coverage` is the honest part. `partial` and `empty` are first-class results,
 * not error paths — "one player has no rounds in this window" is a real answer
 * and the UI has a state for it. What we refuse to do is let a truncated query
 * or a failed join read as "no data".
 * ========================================================================== */

import { z } from 'zod';
import { todayIsoInZone } from '@/lib/golf/timezone';

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

/**
 * How completely the underlying data answers the question that was asked.
 *
 * `partial` is deliberately distinct from `empty`. "We found 3 of your 7
 * players" and "we found nobody" lead a coach to different actions, and
 * collapsing them is how a roster of seven silently becomes six.
 */
const CoverageState = z.enum([
  /** Every entity in scope had data for the whole window. */
  'complete',
  /** Some entities or some of the window had no data. `coverage_note` says which. */
  'partial',
  /** Nothing in scope had data. A real answer — not a failure. */
  'empty',
  /**
   * The query itself failed or was truncated. NEVER render this as "no data";
   * the honest statement is "we could not read this", which is a different
   * sentence and a different next step.
   */
  'unavailable',
]);
export type CoverageState = z.infer<typeof CoverageState>;

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

/**
 * A external reference standard, with its provenance attached.
 *
 * A Tour comparison may only appear when one of these was actually retrieved.
 * The rule the product cares about is not "don't mention the PGA Tour" — it is
 * "never invent a baseline", so the source and the version travel with the
 * number and the UI prints them next to it.
 */
const BenchmarkRef = z.object({
  /** Human-readable source, e.g. 'PGA Tour (Broadie expected strokes)'. */
  source: z.string(),
  /** Version/season identifier of the baseline actually used. */
  version: z.string(),
  /** The reference value on the same scale + unit as the measurement. */
  value: z.number(),
  /**
   * True when this metric has NO credible anchor for the player's cohort (e.g.
   * a women's-team player on a metric with only a men's baseline). The renderer
   * suppresses the marker rather than drawing a misleading one.
   */
  omitted_for_cohort: z.boolean().default(false),
});
export type BenchmarkRef = z.infer<typeof BenchmarkRef>;

/**
 * The one baseline this product is allowed to cite, with its real provenance.
 *
 * Sourced from Mark Broadie's expected-strokes model (ShotLink), recalibrated
 * in migration `20260606140000_fix_sg_expected_strokes_baseline_calibration`.
 * It is a single constant so no call site can quietly cite a different one.
 */
export const BROADIE_BENCHMARK = {
  source: 'PGA Tour expected strokes (Broadie / ShotLink)',
  version: '2026-06-06 calibration',
} as const;

// ---------------------------------------------------------------------------
// The measurement
// ---------------------------------------------------------------------------

/** What the measurement is *about* — a player, the team, or one round. */
const MeasuredEntity = z.object({
  kind: z.enum(['player', 'team', 'round']),
  /** Database id. Never rendered to the coach; used for deep links + validation. */
  id: z.string(),
  /** Display name. This is what the coach reads. */
  label: z.string(),
});
export type MeasuredEntity = z.infer<typeof MeasuredEntity>;

/**
 * One statistic, with everything needed to trust it.
 *
 * Every field here exists because its absence produced a real failure mode:
 * no `sample_size` and "his putting is down" rests on two putts; no `as_of` and
 * a week-old cache reads as this morning; no `window_start`/`window_end` and
 * "lifetime" quietly means "the 20 rows the query happened to return".
 */
export const Measurement = z.object({
  /** Stable metric key, e.g. 'putts_per_round', 'sg_putting', 'make_rate_inside_8ft'. */
  metric_id: z.string(),
  /** What the coach should read, e.g. 'Make rate inside 8 feet'. */
  metric_label: z.string(),
  /** Unit for display. 'percent' | 'strokes' | 'yards' | 'feet' | 'count' | 'score'. */
  unit: z.enum(['percent', 'strokes', 'yards', 'feet', 'count', 'score', 'ratio']),
  /** The value itself, on the unit's natural scale. Null when genuinely absent. */
  value: z.number().nullable(),

  entity: MeasuredEntity,

  /** Inclusive ISO date bounds of the window this value covers. */
  window_start: z.string().nullable(),
  window_end: z.string().nullable(),
  /**
   * How many observations produced the value — rounds, attempts, shots. The
   * `sample_unit` names which, so "43" is never ambiguous.
   */
  sample_size: z.number().int().nonnegative(),
  sample_unit: z.enum(['rounds', 'shots', 'attempts', 'holes', 'events', 'players']),

  /** When this value was computed. A cached stat exposes its cache timestamp. */
  as_of: z.string(),

  coverage: CoverageState,
  /** Present whenever coverage is not 'complete' — says exactly what is missing. */
  coverage_note: z.string().nullable().default(null),

  /** Safe source label, e.g. 'rounds', 'shots', 'stats cache'. Never raw SQL. */
  source: z.string(),
  /** Calculation identifier so two numbers can be compared like with like. */
  method: z.string(),

  /** Denominator when the value is a rate, so "58%" can be shown as 25/43. */
  denominator: z.number().nullable().default(null),

  /** Only present when a real, versioned benchmark was retrieved. */
  benchmark: BenchmarkRef.nullable().default(null),

  /**
   * 'higher_better' | 'lower_better'. Charts read this instead of assuming up
   * is good — for putts-per-round, down is good.
   */
  direction: z.enum(['higher_better', 'lower_better']).nullable().default(null),
});
export type Measurement = z.infer<typeof Measurement>;

/**
 * A time series of the same metric for one entity — the input to a trend chart.
 *
 * `points` are already aggregated server-side. Raw shot rows never reach the
 * model or the browser: a 43-attempt putting question is answered by an
 * aggregate, not by 43 rows the model is invited to add up itself.
 */
export const MeasurementSeries = z.object({
  metric_id: z.string(),
  metric_label: z.string(),
  unit: Measurement.shape.unit,
  entity: MeasuredEntity,
  points: z.array(
    z.object({
      /** ISO date of the observation (round date, or the bucket's end). */
      at: z.string(),
      value: z.number(),
      /** Optional label for a categorical bucket, e.g. '3-8 ft'. */
      bucket: z.string().nullable().default(null),
      sample_size: z.number().int().nonnegative().default(0),
    }),
  ),
  window_start: z.string().nullable(),
  window_end: z.string().nullable(),
  as_of: z.string(),
  coverage: CoverageState,
  coverage_note: z.string().nullable().default(null),
  source: z.string(),
  method: z.string(),
  benchmark: BenchmarkRef.nullable().default(null),
  direction: z.enum(['higher_better', 'lower_better']).nullable().default(null),
});
export type MeasurementSeries = z.infer<typeof MeasurementSeries>;

/**
 * The standard envelope every read tool returns.
 *
 * `measurements` is the load-bearing field: it is both what the renderers draw
 * and what {@link auditNumericClaims} checks the prose against. A tool that
 * returns prose-shaped data with no measurements can never support a numeric
 * claim, and that is the intended consequence.
 */
export const ToolEnvelope = z.object({
  /** One-line, coach-readable summary of what was read. No table names. */
  summary: z.string(),
  measurements: z.array(Measurement).default([]),
  series: z.array(MeasurementSeries).default([]),
  /** Free-form structured payload for renderers that need more than numbers. */
  detail: z.unknown().optional(),
  coverage: CoverageState,
  coverage_note: z.string().nullable().default(null),
  as_of: z.string(),
});
export type ToolEnvelope = z.infer<typeof ToolEnvelope>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Current instant as an ISO string. One place, so tests can reason about it. */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Derive the coverage state for an "N of M entities had data" read.
 *
 * Centralised because getting it wrong is the exact bug that made a 7-player
 * roster report 6: `found === 0` must be `empty`, `found < expected` must be
 * `partial`, and neither may be silently rounded to `complete`.
 */
export function coverageFor(found: number, expected: number): CoverageState {
  if (expected <= 0) return 'empty';
  if (found === 0) return 'empty';
  return found < expected ? 'partial' : 'complete';
}

/** Build an `unavailable` envelope for a failed read. Never reads as "no data". */
export function unavailableEnvelope(summary: string, note: string): ToolEnvelope {
  return {
    summary,
    measurements: [],
    series: [],
    coverage: 'unavailable',
    coverage_note: note,
    as_of: nowIso(),
  };
}

// ---------------------------------------------------------------------------
// Claim auditing
// ---------------------------------------------------------------------------

/** A number the model wrote that no measurement in the turn can account for. */
export interface UnsupportedClaim {
  /** The literal text as it appeared, e.g. '71%'. */
  text: string;
  /** Parsed numeric value. */
  value: number;
}

/**
 * Numbers that carry no statistical claim and must not be audited.
 *
 * Dates, times, ordinals and small counts appear constantly in legitimate prose
 * ("over the last 5 rounds", "Tuesday at 3:00 PM", "8 weeks"). Auditing them
 * would make the check fire on every honest sentence, and a check that always
 * fires gets switched off — which is how the previous grounding gate died.
 */
const CLAIM_EXEMPT = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}\s*(?:am|pm)?)\b/gi;

/** The single pattern used both to find a claim in prose and to read a number out of tool text. */
const NUMERIC_TOKEN_RE = /-?\d+(?:\.\d+)?/g;

/** A bare UUID — never a statistic, always an identifier. */
const UUID_LITERAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A bare ISO date or timestamp — same reasoning as {@link CLAIM_EXEMPT}. */
const ISO_DATE_LITERAL =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Numbers a tool wrote directly into a text field — `title`, `content`,
 * `summary`, `value_display`. `get_player_insights` composes coaching prose
 * server-side ("making 4% of putts from 15-25 ft (23 attempts)") rather than
 * returning those figures as `Measurement`s, and {@link collectNumbers} used
 * to only walk numeric leaves, so every number in that prose was invisible to
 * the audit. Verified against production 2026-09-22: a chat turn that
 * restated an insight's own wording — attempts, make-rates, even the
 * PGA Tour comparison the insight itself carried — was flagged as fabricated
 * because the audit had never looked at the string that number came from.
 *
 * A whole-string UUID or ISO date/timestamp is skipped rather than mined for
 * digits — an id or a timestamp is not a statistic, and walking it would
 * hand the audit meaningless "supported" anchors (a round's id, a
 * `created_at`) that could mask a genuine fabrication landing on the same
 * digits by coincidence. A tool-supplied ISO date IS real evidence for a
 * date the model later writes in prose ("Aug 16", "Sep 6, 2026") — but that
 * is handled separately, by matching the whole date expression against
 * {@link collectDates}, not by feeding its digits into this flat number
 * pool (see {@link auditDateExpressions}'s doc comment for why the two
 * cannot share one pool).
 */
function numbersInText(value: string): number[] {
  if (UUID_LITERAL.test(value) || ISO_DATE_LITERAL.test(value)) return [];
  const matches = value.match(NUMERIC_TOKEN_RE);
  if (!matches) return [];
  return matches.map(Number).filter((n) => Number.isFinite(n));
}

/**
 * The calendar day a whole-string ISO date/timestamp (already validated by
 * {@link ISO_DATE_LITERAL}) reads as. A DATE-ONLY string (`YYYY-MM-DD`, no
 * time component) has no zone to convert and is returned unchanged — this is
 * the "date-only strings stay as they are" rule `window_start`/`window_end`
 * follow. A full TIMESTAMP, when a `timezone` is given, is returned as ONLY
 * the day the coach actually reads it as (via {@link todayIsoInZone}, the
 * same zone-conversion `program-pulse.ts`'s `formatDateTime` renders chat
 * timestamps with) — the naive UTC day is dropped, not accepted alongside
 * it. Falls back to the naive UTC day only when no `timezone` is given, or
 * when one is given but doesn't parse.
 *
 * A prior version of this function accepted BOTH the UTC day and the
 * zone-converted day whenever a timezone was given, reasoning that an
 * omitted timezone should degrade to UTC-only rather than under-support a
 * date. But every real call site (`route.ts`) threads `ctx.timezone`, which
 * is never null in production — so that "omitted timezone" case never
 * actually applies once a timezone IS given, and accepting the UTC day
 * alongside it became a FALSE NEGATIVE in the audit it exists to run:
 * `starts_at: '2026-08-28T00:30:00Z'` reads as "Aug 27" to a coach in
 * America/New_York (8:30pm the evening before) — a coach who never sees
 * "Aug 28" anywhere in their own timezone — but the old dual-day set still
 * accepted a model's "Aug 28" as supported evidence. Once a real, parseable
 * timezone is given, the zone-converted day is the ONLY day the coach could
 * have actually seen, so it's the only one this returns.
 */
function isoDaysOf(value: string, timezone: string | undefined): string[] {
  const utcDay = value.slice(0, 10);
  if (value.length <= 10 || !timezone) return [utcDay];
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) return [utcDay];
  return [todayIsoInZone(timezone, asDate)];
}

/**
 * Every whole-string ISO date/timestamp reachable inside an arbitrary tool
 * payload, normalized to `YYYY-MM-DD` (see {@link isoDaysOf} for which day
 * — the zone-converted one when a timezone is given and parses, otherwise
 * the naive UTC day) — the `detail`-shaped sibling of {@link collectNumbers},
 * used to seed {@link auditDateExpressions}'s evidence set with dates like
 * `detail.events[].starts_at` or `detail.rounds[].date` that never reach a
 * `Measurement`'s `window_start`/`window_end`.
 *
 * `timezone` is the coach's own IANA zone (`ctx.timezone`) — pass it so a
 * timestamped `detail` value (unlike a plain date) is matched against the
 * calendar day the coach actually sees, not only UTC's.
 */
export function collectDates(value: unknown, timezone?: string, depth = 0): string[] {
  if (depth > 6 || value === null || value === undefined) return [];
  if (typeof value === 'string') {
    return ISO_DATE_LITERAL.test(value) ? isoDaysOf(value, timezone) : [];
  }
  if (Array.isArray(value)) return value.flatMap((v) => collectDates(v, timezone, depth + 1));
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((v) =>
      collectDates(v, timezone, depth + 1),
    );
  }
  return [];
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

/** "Aug", "Aug.", "August" — a month name, matched case-insensitively. */
const MONTH_NAME_ALT = Object.keys(MONTH_NAMES)
  .sort((a, b) => b.length - a.length)
  .join('|');

/**
 * A date the model wrote in prose, in any of the non-ISO shapes evidence
 * gets restated in: "Aug 16", "Aug 16, 2026", "August 16th", "Sep 6, 2026",
 * a numeric "9/6/26" / "9/6/2026" (the slash form requires a year — a bare
 * "3/5", with no year, is at least as likely to be a fraction or a
 * distance-band label as a date, and every observed case had a year), or a
 * month-day range that only spells the month once ("Aug 27-28",
 * "August 22-23") — the optional trailing group shares the first date's
 * month and year.
 */
const DATE_EXPRESSION_RE = new RegExp(
  `\\b(?:(${MONTH_NAME_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?(?:\\s*[-–—]\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b)?|(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2}|\\d{4}))\\b`,
  'gi',
);

/**
 * Resolve one {@link DATE_EXPRESSION_RE} match into a comparable date, or
 * `null` when the numbers don't form a real calendar date (a slash triple
 * that isn't month/day, e.g. a mis-scanned ratio).
 */
function resolveDateMatch(
  monthName: string | undefined,
  dayA: string | undefined,
  yearA: string | undefined,
  monthNumStr: string | undefined,
  dayNumStr: string | undefined,
  yearNumStr: string | undefined,
): { month: number; day: number; year: number | null } | null {
  let month: number;
  let day: number;
  let year: number | null = null;
  if (monthName) {
    month = MONTH_NAMES[monthName.toLowerCase()] ?? NaN;
    day = Number(dayA);
    if (yearA) year = Number(yearA);
  } else {
    month = Number(monthNumStr);
    day = Number(dayNumStr);
    const y = Number(yearNumStr);
    // Two-digit year pivot: this product's real evidence is never from the
    // 1900s, but a coach's prose isn't restricted to that — "grad year '78"
    // or an old record typed as "3/5/78" would otherwise resolve to 2078.
    // >=70 pivots to 19xx (the common two-digit-year convention), otherwise
    // 20xx. A wrong-century guess here only ever FAILS CLOSED: this module
    // still requires the resolved date to match real evidence before
    // accepting it, so a bad pivot means a real date gets rejected as
    // unsupported, never that a fabricated one gets waved through.
    year = (yearNumStr ?? '').length === 2 ? (y >= 70 ? 1900 + y : 2000 + y) : y;
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  return { month, day, year };
}

/**
 * Read the model's text for a date expression and flag one no evidence date
 * or window contains, WITHOUT feeding any of its digits into the ordinary
 * number-matching pool.
 *
 * Registering a date's bare day-of-month (13-31) or two-digit year globally
 * — an earlier version of this fix did exactly that — makes every OTHER
 * number in the turn that happens to equal one of them read as "supported"
 * too: with a season running through 2026, a fabricated "26 putts" would
 * pass in every single turn, regardless of what the evidence actually says,
 * just because some measurement's window ends in a year ending in 26. A
 * date is a different kind of claim than a statistic and is checked
 * against a different, date-shaped evidence set (exact match, or falling
 * inside a window's [start, end]) — never against the flat `supported`
 * pool a stray "26" could also satisfy.
 *
 * Mutates `text` by blanking every recognized expression (matched or not)
 * so the ordinary numeric scan never re-examines the same digits — a
 * rejected date is reported once, as the whole expression ("Oct 3"), not
 * once for the whole thing and again for its day-of-month.
 */
function auditDateExpressions(
  text: string,
  evidenceDates: ReadonlySet<string>,
  evidenceWindows: ReadonlyArray<readonly [string, string]>,
): { scrubbed: string; claims: UnsupportedClaim[] } {
  const evidenceMonthDays = new Set<string>();
  for (const iso of evidenceDates) evidenceMonthDays.add(iso.slice(5, 10));

  // Every year a window's own bounds touch — the candidates tried when a
  // no-year expression ("Aug 25") needs a year to test for CONTAINMENT
  // (rather than exact membership) against that window. A window spanning a
  // year boundary (2025-12-20..2026-01-10) contributes BOTH 2025 and 2026,
  // so "Dec 28" resolves against 2025-12-28 and is correctly seen to fall
  // inside the window even though the window's END year is 2026.
  const candidateYears = new Set<number>();
  for (const [start, end] of evidenceWindows) {
    const startYear = Number(start.slice(0, 4));
    const endYear = Number(end.slice(0, 4));
    if (Number.isInteger(startYear)) candidateYears.add(startYear);
    if (Number.isInteger(endYear)) candidateYears.add(endYear);
  }

  const isSupported = (month: number, day: number, year: number | null): boolean => {
    const monthDay = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (year === null) {
      // Exact-day membership, independent of year or window — deliberately
      // GLOBAL across every evidence date in the turn, not scoped to a
      // specific metric/window/entity. That is a real residual risk (an
      // unrelated measurement's window boundary sharing a month-day, e.g.
      // "ends Dec 31", would let a fabricated "wrapped up on Dec 31"
      // elsewhere in the same turn pass) rather than a fabrication this
      // check is meant to catch. Narrowing this to the claim's own
      // entity/window is a possible follow-up, not done here — the fix this
      // block makes is the CONTAINMENT check below, which is what actually
      // closes the reported false-positive gap for a real, in-window date.
      //
      // The containment check itself, once added, carries a related and
      // wider version of the same risk: it is scoped to a WINDOW, not an
      // entity, so any evidence window spanning most or all of a year
      // supports nearly every bare month-day inside it — an unrelated
      // season-long measurement makes containment almost as permissive as
      // the exact-day pool above, for a different reason. Neither is fixed
      // here; both are the same "no-year dates aren't scoped to the claim's
      // own subject" gap the note above already describes.
      if (evidenceMonthDays.has(monthDay)) return true;
      for (const candidateYear of candidateYears) {
        const iso = `${candidateYear}-${monthDay}`;
        if (evidenceWindows.some(([start, end]) => iso >= start && iso <= end)) return true;
      }
      return false;
    }
    const iso = `${year}-${monthDay}`;
    return evidenceDates.has(iso) || evidenceWindows.some(([start, end]) => iso >= start && iso <= end);
  };

  const claims: UnsupportedClaim[] = [];
  const seen = new Set<string>();
  const flag = (label: string, day: number) => {
    if (seen.has(label)) return;
    seen.add(label);
    claims.push({ text: label, value: day });
  };

  const scrubbed = text.replace(
    DATE_EXPRESSION_RE,
    (whole, monthName, dayA, yearA, rangeEndDay, monthNumStr, dayNumStr, yearNumStr) => {
      const resolved = resolveDateMatch(monthName, dayA, yearA, monthNumStr, dayNumStr, yearNumStr);
      if (!resolved) return whole; // Not a real calendar date — leave for the numeric scan.

      if (!isSupported(resolved.month, resolved.day, resolved.year)) {
        // With a range tail, `whole` includes the second day too ("Aug
        // 27-28") — flag just the head so the two days can be reported (and
        // individually deduped) independently.
        flag(rangeEndDay ? `${monthName} ${dayA}` : whole, resolved.day);
      }
      // "Aug 27-28": the range's second day shares the first's month/year
      // but is never itself matched by DATE_EXPRESSION_RE (no month name of
      // its own), so it is checked here rather than falling through
      // unrecognized to the plain numeric scan.
      if (rangeEndDay) {
        const endDay = Number(rangeEndDay);
        if (Number.isInteger(endDay) && endDay >= 1 && endDay <= 31) {
          if (!isSupported(resolved.month, endDay, resolved.year)) {
            flag(`${monthName} ${rangeEndDay}`, endDay);
          }
        }
      }
      return ' '.repeat(whole.length);
    },
  );

  return { scrubbed, claims };
}

/** Tolerance for matching a written number against a measured one. */
const MATCH_EPSILON = 0.051;

/**
 * A number written as an approximation or a bound rather than as a reading.
 *
 * "two rounds where he lost more than 7.5 strokes" is good coaching prose and
 * the 7.5 is deliberately rounded *outward* from a real -7.61. Demanding an
 * exact match there flags careful writing as fabrication, so a hedge widens the
 * tolerance to {@link HEDGED_RELATIVE_TOLERANCE} — enough to cover rounding,
 * nowhere near enough to cover an invented figure.
 */
const HEDGE_BEFORE =
  /(?:\b(?:about|around|roughly|approximately|nearly|almost|over|under|above|below|more than|less than|fewer than|greater than|at least|at most|upwards of|north of|shy of)|~)\s*[-−]?$/i;

/** Proportional slack granted to a hedged number. 10% catches rounding, not invention. */
const HEDGED_RELATIVE_TOLERANCE = 0.1;

/**
 * Cap on anchors per metric before pairwise differencing is skipped.
 *
 * Differencing is O(n²) and a 40-round series with means is already 41 anchors.
 * Past this size the extra pairs buy nothing — a long series' values are dense
 * enough that near-anything falls between two of them.
 */
const PAIRWISE_ANCHOR_CAP = 32;

/** `sg_putting_mean` and `sg_putting` describe one metric; deltas span both. */
function metricGroup(metricId: string): string {
  return metricId.replace(/_(?:mean|avg|average)$/, '');
}

/**
 * Read the model's finished text and flag numbers no measurement supports.
 *
 * The comparison is deliberately generous — a measurement of 58.3 supports the
 * written "58%", and a sample size of 43 supports "43 attempts". Generosity is
 * correct here: the goal is to catch *invention* (a confident "71% → 58%" when
 * the tools returned neither), not to punish rounding. A strict matcher would
 * produce false positives, and a check nobody trusts is worse than none.
 *
 * Small integers ≤ 12 are exempt for the same reason — they are almost always
 * counts of rounds, weeks or players that appear in the surrounding sentence
 * rather than standalone statistical claims.
 */
export function auditNumericClaims(
  text: string,
  measurements: readonly Measurement[],
  series: readonly MeasurementSeries[] = [],
  /**
   * Every other number the turn's tools returned — typically the values inside
   * an envelope's `detail` (team averages, per-round rows, RSVP counts).
   *
   * Without this the audit fires on legitimately-sourced figures. A real
   * example from verification: the weakest-area tool returns each metric's team
   * average in `detail.gaps`, the model correctly cited "-0.09 team average",
   * and the audit flagged it as fabricated because only `measurements` was
   * being checked. Five false positives on a good answer — and a check that
   * cries wolf is a check people switch off, which is exactly what happened to
   * the grounding gate this replaced.
   */
  extraSupported: readonly number[] = [],
  /**
   * Every ISO date reachable inside an envelope's `detail` — typically
   * {@link collectDates}'s output for the same `detail` payload
   * `extraSupported` was built from. See {@link auditDateExpressions} for
   * why dates are checked separately rather than folded into
   * `extraSupported`'s flat number pool.
   */
  extraSupportedDates: readonly string[] = [],
  /**
   * The coach's IANA zone (`ctx.timezone`, NOT NULL in the schema) — only
   * used to convert a WINDOW or SERIES-POINT value that carries an actual
   * time component (a `window_start`/`window_end`/`p.at` that is already
   * date-only is unaffected; there's no zone to convert). Omitted — an
   * existing caller/test that hasn't been updated — degrades to the
   * previous UTC-only day rather than throwing. See {@link isoDaysOf}.
   */
  timezone?: string,
): UnsupportedClaim[] {
  if (!text) return [];

  // Every value a tool actually produced, at any precision the prose might use.
  const supported = new Set<number>();
  /** Anchors grouped by metric, so a delta only spans figures of one kind. */
  const byMetric = new Map<string, Set<number>>();

  const add = (n: number | null | undefined, metricId?: string) => {
    if (typeof n !== 'number' || !Number.isFinite(n)) return;
    for (const v of [n, Math.abs(n)]) {
      // "lost 7.61 strokes" and "-7.61 strokes" are the same statement, so a
      // magnitude counts as sourced wherever its signed value does.
      supported.add(v);
      supported.add(Math.round(v));
      supported.add(Math.round(v * 10) / 10);
    }
    if (metricId) {
      const key = metricGroup(metricId);
      const group = byMetric.get(key) ?? new Set<number>();
      // Cross-turn evidence carryover (route.ts's `priorTurnEvidence`) can
      // accumulate many measurements of the same metric across several
      // turns. A `Set` already dedupes an exact repeat; what it does not do
      // on its own is stay bounded — and the differencing loop below skips a
      // metric group entirely once it exceeds PAIRWISE_ANCHOR_CAP, which
      // would silently turn off a genuine same-turn comparison just because
      // old evidence padded the group. Evicting the OLDEST member first (Set
      // iteration order is insertion order) keeps the group at the cap while
      // preferring the most recently seen values — the ones most likely to
      // still be relevant to the current question.
      if (!group.has(n) && group.size >= PAIRWISE_ANCHOR_CAP) {
        const oldest = group.values().next().value;
        if (oldest !== undefined) group.delete(oldest);
      }
      group.add(n);
      byMetric.set(key, group);
    }
  };

  // Evidence dates, kept separate from `supported` — see
  // `auditDateExpressions`'s doc comment for why a date is matched against
  // its own evidence set rather than this flat number pool.
  const evidenceDates = new Set<string>(extraSupportedDates);
  const evidenceWindows: Array<[string, string]> = [];
  const addWindow = (start: string | null, end: string | null) => {
    // For a timestamped bound, the exact-date evidence set accepts only the
    // day the coach actually reads it as (see isoDaysOf) — a window bound is
    // normally date-only already, in which case this is a no-op (one day,
    // unchanged).
    if (start) for (const d of isoDaysOf(start, timezone)) evidenceDates.add(d);
    if (end) for (const d of isoDaysOf(end, timezone)) evidenceDates.add(d);
    // The CONTAINMENT range itself deliberately keeps the naive UTC day —
    // widening a window's bounds by zone is a different, riskier change
    // (which direction shifts a bound depends on the offset's sign) than
    // accepting an extra exact-match day, and a window bound is the
    // "date-only strings stay as they are" case this fix does not touch.
    if (start && end) evidenceWindows.push([start.slice(0, 10), end.slice(0, 10)]);
  };

  for (const m of measurements) {
    add(m.value, m.metric_id);
    add(m.sample_size);
    add(m.denominator);
    add(m.benchmark?.value, m.metric_id);
    // A stated delta between a value and its benchmark is itself supported.
    if (typeof m.value === 'number' && typeof m.benchmark?.value === 'number') {
      add(m.value - m.benchmark.value);
    }
    addWindow(m.window_start, m.window_end);
  }
  for (const n of extraSupported) add(n);
  for (const s of series) {
    addWindow(s.window_start, s.window_end);
    // `series` is typed as `MeasurementSeries[]`, but a caller can hand this
    // function evidence that was round-tripped through the database first
    // (route.ts's `priorTurnEvidence`, reading a stored `ui_parts` blob) —
    // the type is a claim about the good case, not a runtime guarantee.
    // `points` missing or non-array must be skipped, not iterated, or a
    // single legacy/forged envelope crashes the whole turn's audit.
    const points = Array.isArray(s.points) ? s.points : [];
    for (const p of points) {
      add(p.value, s.metric_id);
      add(p.sample_size);
      if (p.at) for (const d of isoDaysOf(p.at, timezone)) evidenceDates.add(d);
      // A distance-band label ("15-25 ft", "10-15 ft") is the tool's own
      // vocabulary for the bucket, not a claim — but its digits are not
      // otherwise anchored, so e.g. "15" and "25" from get_putting_distance_profile
      // read as invented statistics. Registering them the same way a tool's
      // prose numbers are (numbersInText) closes that gap without a
      // separate distance/unit exemption regex, which risked also exempting
      // a real proximity claim like "18 ft away".
      if (p.bucket) for (const n of numbersInText(p.bucket)) add(n);
    }
    // First-to-last movement is the whole point of a trend, so allow the delta.
    const first = points[0]?.value;
    const last = points[points.length - 1]?.value;
    if (typeof first === 'number' && typeof last === 'number') add(last - first);
  }

  /**
   * Differences between two sourced figures of the same metric.
   *
   * "Bennett's deficit is roughly 2.4 strokes per round larger than Rivers's" is
   * the entire point of a comparison, and no tool can pre-compute every pair a
   * coach might ask about. The number is still checkable against the evidence
   * on screen — it is arithmetic on two published values, not an assertion —
   * so it is supported. Held to one metric so a strokes figure can never be
   * justified by subtracting two putt counts.
   */
  for (const group of byMetric.values()) {
    // `add()` above never lets a group exceed PAIRWISE_ANCHOR_CAP; the upper
    // check is kept as a direct guarantee against this loop's own O(n²) cost
    // rather than trusting that invariant silently.
    if (group.size < 2 || group.size > PAIRWISE_ANCHOR_CAP) continue;
    const values = [...group];
    for (const [i, left] of values.entries()) {
      for (const right of values.slice(i + 1)) add(left - right);
    }
  }

  const exempt = text.replace(CLAIM_EXEMPT, ' ');
  // Resolved before the plain numeric scan, and blanked out of `scrubbed`
  // either way, so a date's own digits are never re-examined as a bare
  // number (matched or not — a rejected date is reported once, as the
  // whole expression, not again for its day-of-month).
  const { scrubbed, claims: dateClaims } = auditDateExpressions(exempt, evidenceDates, evidenceWindows);
  const found: UnsupportedClaim[] = [...dateClaims];
  const seen = new Set<string>();
  const anchors = [...supported];

  for (const match of scrubbed.matchAll(NUMERIC_TOKEN_RE)) {
    const raw = match[0];
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    // Ordinals, counts of rounds/weeks/players — not statistical assertions.
    if (Number.isInteger(value) && Math.abs(value) <= 12) continue;
    if (seen.has(raw)) continue;

    const at = match.index ?? 0;
    const hedged = HEDGE_BEFORE.test(scrubbed.slice(Math.max(0, at - 24), at));
    const tolerance = hedged
      ? Math.max(MATCH_EPSILON, Math.abs(value) * HEDGED_RELATIVE_TOLERANCE)
      : MATCH_EPSILON;

    if (!anchors.some((s) => Math.abs(s - value) <= tolerance)) {
      seen.add(raw);
      found.push({ text: raw, value });
    }
  }

  return found;
}

/**
 * Every finite number reachable inside an arbitrary tool payload.
 *
 * Tools put structured context in `ToolEnvelope.detail` — team averages, round
 * rows, RSVP counts — and the model is entitled to cite it. Walking it means
 * the audit stays a fabrication detector rather than a `measurements`-only
 * detector. Depth-bounded so a pathological payload cannot spin.
 */
export function collectNumbers(value: unknown, depth = 0): number[] {
  if (depth > 6 || value === null || value === undefined) return [];
  if (typeof value === 'number') return Number.isFinite(value) ? [value] : [];
  // A tool's own descriptive text (see numbersInText) carries numbers too —
  // `get_player_insights`' `content`/`title` being the motivating case.
  if (typeof value === 'string') return numbersInText(value);
  if (Array.isArray(value)) return value.flatMap((v) => collectNumbers(v, depth + 1));
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((v) =>
      collectNumbers(v, depth + 1),
    );
  }
  return [];
}
