/**
 * Slice 5b insight angle — breaking-putt misses on the low side (`02` §10.6,
 * `03` §8 item 5). Flag `coachhelm_insight_angles_v1`.
 *
 * Population: missed putts on breaking putts (`putt_break` left_to_right or
 * right_to_left) in the newest 40 countable rounds. A miss's side comes from
 * its miss tag (`miss_direction` containing `low` or `high`); a miss tagged
 * only short/long, or not at all, has no side.
 *
 * Coverage gate (`01` row 5, `04` §2): side-tagged misses must be ≥ 60% of
 * the breaking-putt misses AND ≥ 20. Below that the angle writes NOTHING:
 * the tagged subset is self-selected, and the one-tap capture prompt for
 * the missing tags is Slice 8a's (#2233), not this row's.
 *
 * WHAT: low misses of side-tagged misses against an even split (exact
 * one-sided binomial via its normal z ≥ 1.645, `02` §7 #6: binomial vs 50%
 * for high/low), with the split by break direction beside it and, when the
 * team pool clears its floors, the teammates' pooled low share as context.
 *
 * Unsized (`impact_kind: 'unsized'`): the tags count which side a putt
 * missed on, not what it cost, so the row carries no strokes and the support
 * pass keeps it with the coach (`no_strokes_estimate`). The wording stays
 * descriptive: a low miss comes from too little break or too soft a pace,
 * and the tags do not say which.
 */
import type { ComposedContent, GeneratorAggregate, InsightCategory, MetricId } from '@/lib/coachhelm/v3/engine/types';
import {
  ANGLE_FAMILIES,
  ANGLE_MIN_Z,
  PEER_MIN_PLAYERS,
  angleReadFields,
  angleTest,
  familyDetail,
  impactMethodOf,
  newestFirstIds,
  pickExamples,
  primaryTeamId,
  round1,
  round2,
  windowOf,
  type AngleData,
  type AngleEvidence,
  type AngleGapInput,
  type AngleReceipts,
  type AngleWindow,
  type ComparisonLine,
  type ReceiptExample,
} from './angle-data';
import { AngleGenerator } from './angle-generator';
import { TEAM_POOL_MIN_ATTEMPTS, extractPutts, poolTeammates, recordOf, type BreakingMiss, type TeamShotData } from './counted-shots';

/** `01` row 5 / `04` §2: side-tagged share of misses before the tags can speak. */
export const TAG_COVERAGE_MIN = 0.6;
export const UNDER_READ_MIN_TAGGED = ANGLE_FAMILIES.under_reading.floor;

export interface SideCounts {
  misses: number;
  tagged: number;
  low: number;
  high: number;
  low_pct: number | null;
}

export interface UnderReadingResult {
  window: AngleWindow;
  rounds: number;
  round_ids: string[];
  all: SideCounts;
  by_break: { left_to_right: SideCounts; right_to_left: SideCounts };
  /** Side-tagged share of breaking-putt misses, 0–1. */
  coverage: number;
  z: number | null;
  team: (SideCounts & { players: number }) | null;
  examples: ReceiptExample[];
  /** Coverage below 60% or fewer than 20 side-tagged misses: the row says nothing. */
  data_gap: boolean;
  qualifies: boolean;
}

export function sideCounts(xs: readonly BreakingMiss[]): SideCounts {
  const low = xs.filter((x) => x.side === 'low').length;
  const high = xs.filter((x) => x.side === 'high').length;
  const tagged = low + high;
  return { misses: xs.length, tagged, low, high, low_pct: tagged ? round1((100 * low) / tagged) : null };
}

/** Pure compute. Null when the player has no breaking-putt miss. */
export function computeUnderReading(data: AngleData, team: TeamShotData | null): UnderReadingResult | null {
  const misses = extractPutts(recordOf(data)).breaking_misses;
  if (misses.length === 0) return null;
  const all = sideCounts(misses);
  const coverage = all.tagged / all.misses;
  const z = all.tagged > 0 ? (all.low / all.tagged - 0.5) / Math.sqrt(0.25 / all.tagged) : null;
  const dataGap = coverage < TAG_COVERAGE_MIN || all.tagged < UNDER_READ_MIN_TAGGED;

  const per = poolTeammates(team, data.playerId).map((t) =>
    extractPutts({ rounds: t.rounds, holes: t.holes, shots: t.shots, scale: null }).breaking_misses,
  );
  const withTags = per.filter((xs) => xs.some((x) => x.side !== null));
  const pooled = sideCounts(withTags.flat());
  const teamLine = withTags.length >= PEER_MIN_PLAYERS && pooled.tagged >= TEAM_POOL_MIN_ATTEMPTS ? { ...pooled, players: withTags.length } : null;

  const qualifies =
    !dataGap && data.rounds.length >= ANGLE_FAMILIES.under_reading.round_floor && z !== null && z >= ANGLE_MIN_Z;

  return {
    window: windowOf(data.rounds),
    rounds: data.rounds.length,
    round_ids: newestFirstIds(data.rounds),
    all,
    by_break: {
      left_to_right: sideCounts(misses.filter((x) => x.brk === 'left_to_right')),
      right_to_left: sideCounts(misses.filter((x) => x.brk === 'right_to_left')),
    },
    coverage,
    z: z === null ? null : round2(z),
    team: teamLine,
    examples: pickExamples(
      misses
        .filter((x) => x.side === 'low')
        .map((x) => ({
          round_id: x.round_id,
          hole_number: x.hole_number,
          hole_id: x.hole_id,
          date: x.date,
          note: `${x.brk === 'left_to_right' ? 'left-to-right' : 'right-to-left'} putt${x.ft !== null ? ` from ${round1(x.ft)} ft` : ''}, missed low`,
        })),
    ),
    data_gap: dataGap,
    qualifies,
  };
}

export interface UnderReadingAggregate extends GeneratorAggregate {
  result: UnderReadingResult;
}

export function toUnderReadingAggregate(r: UnderReadingResult | null): UnderReadingAggregate | null {
  if (!r || !r.qualifies) return null;
  return { result: r, sampleN: r.all.tagged, playerValue: r.all.low_pct ?? 0, windowRoundIds: r.round_ids };
}

export function underReadingGapInput(r: UnderReadingResult): AngleGapInput {
  return { kind: 'proportion', k: r.all.low, n: r.all.tagged, benchmark: 0.5, polarity: 'lower_better' };
}

export const UNDER_READING_DEFINITION =
  'Low share = misses tagged low (any tag containing "low") ÷ misses tagged low or high, on putts recorded as breaking left-to-right or right-to-left. ' +
  'Read only when 60%+ of those misses (and 20+) carry a low/high tag; tested against an even split (50%).';

function breakText(label: string, c: SideCounts): string {
  return c.tagged ? `${label} ${c.low} of ${c.tagged} low (${c.low_pct}%)` : `${label} no side-tagged misses`;
}

export function composeUnderReading(agg: UnderReadingAggregate): ComposedContent & { category: InsightCategory } {
  const r = agg.result;
  const a = r.all;
  const primary: ComparisonLine = { source: 'self_other', label: 'An even split of low and high misses', value: 50, n: null };
  const lines: ComparisonLine[] = r.team
    ? [{ source: 'team_pool', label: `Teammates' pooled low share (${r.team.tagged} tagged misses from ${r.team.players} players)`, value: r.team.low_pct ?? 0, n: r.team.tagged }]
    : [];
  const covPct = round1(100 * r.coverage);
  const receipts: AngleReceipts = {
    window: r.window,
    definition: UNDER_READING_DEFINITION,
    samples: { rounds: r.rounds, breaking_putt_misses: a.misses, side_tagged_misses: a.tagged, low: a.low, high: a.high },
    exclusions: { misses_without_a_low_or_high_tag: a.misses - a.tagged },
    examples: r.examples,
  };
  const evidence: AngleEvidence = {
    ...angleReadFields('under_reading', r.round_ids, primary, lines),
    metric: ANGLE_FAMILIES.under_reading.metric,
    metric_label: 'Breaking-putt misses on the low side',
    unit: 'percent',
    polarity: 'lower_better',
    your_value: a.low_pct ?? 0,
    your_value_display: `${a.low} of ${a.tagged} low (${a.low_pct}%)`,
    comparison_value: 50,
    comparison_label: 'An even split of low and high misses',
    comparison_source: 'your_baseline',
    sample_n: a.tagged,
    window_days: r.window.window_days,
    window_start: r.window.window_start,
    window_end: r.window.window_end,
    // Unsized: the tags count the side, not the cost.
    strokes_impact: 0,
    strokes_impact_method: impactMethodOf(ANGLE_FAMILIES.under_reading.impact),
    confidence: 0,
    confidence_factors: { sample_adequacy: Math.min(a.tagged / 40, 1), recency: 1, variance: 0.5 },
    detail: {
      ...familyDetail('under_reading'),
      gap_input: underReadingGapInput(r),
      test: angleTest(r.z),
      angle: 'under_reading',
      receipts,
      all: a,
      by_break: r.by_break,
      tag_coverage_pct: covPct,
      team: r.team,
      rounds: r.rounds,
    },
    diagnosis: {
      symptom: `${a.low} of ${a.tagged} side-tagged breaking-putt misses finished low (${a.low_pct}%)`,
      root_cause: 'A low miss comes from playing too little break or hitting it too softly; the tags do not say which.',
      causality_level: 'inferred_hypothesis',
      drivers: [
        { metric: ANGLE_FAMILIES.under_reading.metric, label: 'Low share of side-tagged misses', value: a.low_pct ?? 0, unit: 'percent', sample_n: a.tagged, source: 'golf_shots.miss_direction, putt_break' },
      ],
      recommended_action: 'On breaking putts, pick the high-side entry point and roll the ball to die at the hole; keep tagging the side of each miss.',
      confidence_reason: '',
    },
  };
  return {
    category: 'putting',
    title: 'Breaking putts are missing on the low side',
    content:
      `Of the ${a.tagged} misses on breaking putts you tagged with a side (${covPct}% of ${a.misses} misses), ${a.low} finished low (${a.low_pct}%) and ${a.high} high. ` +
      `${breakText('Left-to-right:', r.by_break.left_to_right)}; ${breakText('right-to-left:', r.by_break.right_to_left)}.` +
      (r.team ? ` Your teammates' tagged misses were ${r.team.low_pct}% low.` : '') +
      ' A low miss comes from too little break or too soft a pace; the tags do not say which.',
    priority: 'low',
    signature: 'under_reading:breaking',
    evidence,
  };
}

export class UnderReadingGenerator extends AngleGenerator<UnderReadingAggregate> {
  readonly name = 'UnderReadingGenerator';
  readonly metricId: MetricId = 'sg_putting';
  readonly insightType = 'putting';
  readonly category: InsightCategory = 'putting';
  readonly minSampleN = UNDER_READ_MIN_TAGGED;
  protected override readonly requiresStanding = false;

  protected override signatureScope(): string {
    return 'under_reading:';
  }

  async aggregate(): Promise<UnderReadingAggregate | null> {
    const data = await this.loaders.data();
    const teamId = primaryTeamId(data.rounds);
    const team = teamId ? await this.loaders.teamShots(teamId) : null;
    return toUnderReadingAggregate(computeUnderReading(data, team));
  }

  composeContent(agg: UnderReadingAggregate): ComposedContent {
    const { category: _category, ...composed } = composeUnderReading(agg);
    return composed;
  }
}
