/**
 * Slice 5b insight angles — strokes gained per approach as the WHAT
 * (`02` §7 #16-18, `01` rows 3-4) and par-3 tee shots as their own family
 * (`01` row 3, `03` §8 item 7). Flag `coachhelm_insight_angles_v1`.
 *
 * WHAT: mean strokes gained per attempt (hits AND misses, so no selection
 * bias from proximity-when-hit), against the POOLED attempts of the player's
 * teammates in the same window (each teammate's newest 40 countable rounds,
 * 3+ rounds each, 5+ teammates with attempts, 100+ pooled attempts; `02` §3,
 * `07` §6 privacy floor). One-sided Welch z ≥ 1.645 for "worse than the
 * team", ≥ 20 attempts over ≥ 4 rounds with attempts, and ≥ 0.3 strokes a
 * round (gap × attempts per 18). The Tour stays the SG arithmetic only
 * (Q-88): its line is 0 by construction and is never the word.
 *
 * Drivers (never the WHAT): greens hit, the short share of misses with a
 * recorded depth, and proximity when the green was hit — each beside the
 * team's pooled figure.
 *
 * Populations (`counted-shots.ts`): approach bands exclude every approach
 * from the tee (par-3 tee shots and re-tees, `lie_before='tee'`); the par-3
 * family is the first recorded shot of each par-3 hole when it is from the
 * tee, banded by length (under 150 / 150–175 / 175+ yd).
 */
import type { ComposedContent, GeneratorAggregate, InsightCategory, MetricId } from '@/lib/coachhelm/v3/engine/types';
import {
  ANGLE_FAMILIES,
  ANGLE_MIN_Z,
  PEER_MIN_PLAYERS,
  angleReadFields,
  angleTest,
  attemptCounterfactual,
  familyDetail,
  impactOf,
  mean,
  newestFirstIds,
  pickExamples,
  primaryTeamId,
  round1,
  round2,
  totalHoles,
  variance,
  welchDf,
  welchSe,
  windowOf,
  type AngleData,
  type AngleEvidence,
  type AngleFamilyId,
  type AngleGapInput,
  type AngleReceipts,
  type AngleWindow,
  type ComparisonLine,
  type ReceiptExample,
  type SplitHalfInput,
} from './angle-data';
import { AngleGenerator, type AngleLoaders } from './angle-generator';
import {
  APPROACH_BAND_LABEL,
  PAR3_BANDS,
  PAR3_BAND_LABEL,
  TEAM_POOL_MIN_ATTEMPTS,
  extractApproaches,
  par3BandOf,
  poolTeammates,
  recordOf,
  type ApproachAttempt,
  type ApproachBand,
  type Par3Band,
  type TeamShotData,
} from './counted-shots';

/** `02` §2 practical floor: strokes a round. */
export const SG_MIN_STROKES_PER_ROUND = 0.3;

export type SgFamilyId = 'par3_tee' | 'approach_sg_50_125' | 'approach_sg_125_175' | 'approach_sg_175_plus';

export const APPROACH_SG_FAMILY: Record<ApproachBand, SgFamilyId> = {
  '50_125': 'approach_sg_50_125',
  '125_175': 'approach_sg_125_175',
  '175_plus': 'approach_sg_175_plus',
};

/** The descriptive figures beside the SG gap (each pooled the same way for the team). */
export interface SgDrivers {
  attempts: number;
  greens: number;
  green_pct: number | null;
  misses: number;
  /** Misses with a recorded short/long part. */
  depth_tagged: number;
  short: number;
  /** Short share of depth-tagged misses, percent; null when none tagged. */
  short_pct: number | null;
  /** Mean on-green finish (ft) over greens hit; null when none. */
  proximity_ft: number | null;
}

export function driversOf(xs: readonly ApproachAttempt[]): SgDrivers {
  const greens = xs.filter((a) => a.green);
  const misses = xs.filter((a) => !a.green);
  const tagged = misses.filter((a) => a.depth !== null);
  const short = tagged.filter((a) => a.depth === 'short').length;
  const prox = greens.map((a) => a.proximity_ft).filter((v): v is number => v !== null);
  return {
    attempts: xs.length,
    greens: greens.length,
    green_pct: xs.length ? round1((100 * greens.length) / xs.length) : null,
    misses: misses.length,
    depth_tagged: tagged.length,
    short,
    short_pct: tagged.length ? round1((100 * short) / tagged.length) : null,
    proximity_ft: prox.length ? round1(mean(prox)!) : null,
  };
}

/** The pooled team figures for one population, or null below the pool floors. */
export interface SgPool {
  players: number;
  attempts: number;
  values: number[];
  mean: number;
  drivers: SgDrivers;
}

/**
 * Pool every teammate's attempts (the player never among them). Null below
 * {@link PEER_MIN_PLAYERS} teammates with attempts or
 * {@link TEAM_POOL_MIN_ATTEMPTS} pooled attempts.
 */
export function poolOf(perTeammate: readonly (readonly ApproachAttempt[])[]): SgPool | null {
  const withAttempts = perTeammate.filter((xs) => xs.length > 0);
  const all = withAttempts.flat();
  if (withAttempts.length < PEER_MIN_PLAYERS || all.length < TEAM_POOL_MIN_ATTEMPTS) return null;
  const values = all.map((a) => a.sg);
  return { players: withAttempts.length, attempts: all.length, values, mean: mean(values)!, drivers: driversOf(all) };
}

export interface SgBandRow {
  band: Par3Band;
  label: string;
  player: SgDrivers & { sg_mean: number | null };
  team: (SgDrivers & { sg_mean: number | null }) | null;
}

export interface SgResult {
  family: SgFamilyId;
  label: string;
  window: AngleWindow;
  rounds: number;
  round_ids: string[];
  /** Distinct rounds with at least one attempt. */
  rounds_with_attempts: number;
  n: number;
  /** Unrounded means and gap (sizing reads these). */
  player_mean: number;
  team: SgPool | null;
  /** team mean − player mean, strokes per attempt (positive = worse). */
  gap: number | null;
  se: number | null;
  df: number | null;
  z: number | null;
  attempts_per_18: number;
  strokes_per_round: number | null;
  drivers: SgDrivers;
  split_half: SplitHalfInput | null;
  /** Par-3 only: GIR and SG by tee-shot length. */
  bands: SgBandRow[];
  excluded: Record<string, number>;
  examples: ReceiptExample[];
  qualifies: boolean;
}

/** `02` §2 split-half: the gap in the older and newer halves of the window's rounds. */
export function sgSplitHalf(
  rounds: readonly { id: string; date: string }[],
  attempts: readonly ApproachAttempt[],
  teamMean: number,
): SplitHalfInput | null {
  const order = [...rounds].sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
  if (order.length < 2) return null;
  const old = new Set(order.slice(0, Math.floor(order.length / 2)).map((r) => r.id));
  const a = attempts.filter((x) => old.has(x.round_id)).map((x) => x.sg);
  const b = attempts.filter((x) => !old.has(x.round_id)).map((x) => x.sg);
  if (a.length === 0 || b.length === 0) return null;
  return { gap_old: round2(teamMean - mean(a)!), gap_new: round2(teamMean - mean(b)!), n_old: a.length, n_new: b.length };
}

function bandRows(player: readonly ApproachAttempt[], team: readonly ApproachAttempt[] | null): SgBandRow[] {
  return PAR3_BANDS.map((band) => {
    const p = player.filter((a) => par3BandOf(a.yards) === band);
    const t = team ? team.filter((a) => par3BandOf(a.yards) === band) : null;
    return {
      band,
      label: PAR3_BAND_LABEL[band],
      player: { ...driversOf(p), sg_mean: p.length ? round2(mean(p.map((a) => a.sg))!) : null },
      team: t ? { ...driversOf(t), sg_mean: t.length ? round2(mean(t.map((a) => a.sg))!) : null } : null,
    };
  });
}

/**
 * Pure compute for one SG family: the player's attempts against the team
 * pool. Null when the player has no attempt.
 */
export function computeSgFamily(
  family: SgFamilyId,
  data: AngleData,
  team: TeamShotData | null,
): SgResult | null {
  const own = extractApproaches(recordOf(data));
  const band = family === 'par3_tee' ? null : (Object.keys(APPROACH_SG_FAMILY) as ApproachBand[]).find((b) => APPROACH_SG_FAMILY[b] === family)!;
  const pick = (x: ReturnType<typeof extractApproaches>): ApproachAttempt[] => (band === null ? x.par3 : x.bands[band]);
  const attempts = pick(own);
  if (attempts.length === 0) return null;
  const teammates = poolTeammates(team, data.playerId);
  const teamAttempts = teammates.map((t) => pick(extractApproaches({ rounds: t.rounds, holes: t.holes, shots: t.shots, scale: data.scale })));
  const pool = poolOf(teamAttempts);

  const values = attempts.map((a) => a.sg);
  const playerMean = mean(values)!;
  const gap = pool ? pool.mean - playerMean : null;
  const se = pool ? welchSe(pool.values, values) : null;
  const df = pool ? welchDf(pool.values, values) : null;
  const z = gap !== null && se !== null ? gap / se : null;
  const holes = totalHoles(data.rounds);
  const per18 = holes > 0 ? (attempts.length * 18) / holes : 0;
  const strokes = gap !== null ? gap * per18 : null;
  const roundsWith = new Set(attempts.map((a) => a.round_id)).size;
  const def = ANGLE_FAMILIES[family];

  const qualifies =
    pool !== null &&
    attempts.length >= def.floor &&
    data.rounds.length >= def.round_floor &&
    roundsWith >= def.round_floor &&
    variance(values) !== null &&
    z !== null &&
    z >= ANGLE_MIN_Z &&
    strokes !== null &&
    strokes >= SG_MIN_STROKES_PER_ROUND;

  const worst = [...attempts].sort((a, b) => a.sg - b.sg);
  return {
    family,
    label: band === null ? 'par-3 tee shots' : `approaches from ${APPROACH_BAND_LABEL[band]}`,
    window: windowOf(data.rounds),
    rounds: data.rounds.length,
    round_ids: newestFirstIds(data.rounds),
    rounds_with_attempts: roundsWith,
    n: attempts.length,
    player_mean: playerMean,
    team: pool,
    gap,
    se,
    df,
    z: z === null ? null : round2(z),
    attempts_per_18: per18,
    strokes_per_round: strokes,
    drivers: driversOf(attempts),
    split_half: pool ? sgSplitHalf(data.rounds, attempts, pool.mean) : null,
    bands: band === null ? bandRows(attempts, pool ? teamAttempts.flat() : null) : [],
    excluded: {
      approaches_from_the_tee: own.excluded.tee_approaches,
      approaches_inside_50_yd_or_without_distance: own.excluded.no_band,
      attempts_without_computable_sg: own.excluded.no_sg,
      par3_holes_first_shot_not_from_tee: own.excluded.par3_first_not_tee,
    },
    examples: pickExamples(
      worst.slice(0, 20).map((a) => ({
        round_id: a.round_id,
        hole_number: a.hole_number,
        hole_id: a.hole_id,
        date: a.date,
        note: `${Math.round(a.yards)} yd${a.par !== null ? `, par ${a.par}` : ''}: ${a.green ? `green, ${a.proximity_ft === null ? 'leave not recorded' : `${round1(a.proximity_ft)} ft`}` : `missed${a.depth ? ` ${a.depth}` : ''}`}; ${a.sg.toFixed(2)} strokes gained`,
      })),
    ),
    qualifies,
  };
}

export interface SgAggregate extends GeneratorAggregate {
  result: SgResult;
  baseline: number | null;
}

export function toSgAggregate(r: SgResult | null, baseline: number | null): SgAggregate | null {
  if (!r || !r.qualifies) return null;
  return { result: r, baseline, sampleN: r.n, playerValue: round2(r.player_mean), windowRoundIds: r.round_ids };
}

/** The Slice 1 test input: the player's mean SG with the Welch SE of the difference, against the pooled team mean. */
export function sgGapInput(r: SgResult): AngleGapInput | null {
  if (!r.team || r.se === null || !(r.se > 0) || r.df === null) return null;
  // `se` is the Welch SE of (team − player), so the support pass's t on
  // (benchmark − value) / se is the same Welch test the gate ran; the pool
  // is therefore tested as exact.
  return { kind: 'mean', value: round4(r.player_mean), se: round4(r.se), df: r.df, benchmark: round4(r.team.mean), polarity: 'higher_better' };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function pctLine(x: SgDrivers): string {
  return `${x.greens} of ${x.attempts} (${x.green_pct ?? 0}%)`;
}

export const SG_DEFINITION =
  'Strokes gained per attempt = expected strokes from the start (lie and distance, Tour baseline at your SG scale) minus expected strokes from where it finished, minus one, with any penalty strokes recorded straight after it; the same arithmetic as your stored round SG. ' +
  "Compared with the pooled attempts of teammates with 3+ countable rounds (newest 40 each), 5+ teammates and 100+ attempts; teammates are never shown one by one.";

export function composeSgFamily(agg: SgAggregate): ComposedContent & { category: InsightCategory } {
  const r = agg.result;
  const pool = r.team as SgPool;
  const gap = r.gap as number;
  const strokes = r.strokes_per_round as number;
  const fam = ANGLE_FAMILIES[r.family];
  const isPar3 = r.family === 'par3_tee';
  const cf = attemptCounterfactual({ strokesPerAttempt: gap, attemptsPerRound: r.attempts_per_18, baseline: agg.baseline, weeks: 8 });
  const teamLabel = `Teammates' pooled ${isPar3 ? 'par-3 tee shots' : 'approaches'} (${pool.attempts} from ${pool.players} players)`;
  const primary: ComparisonLine = {
    source: 'team_pool',
    label: teamLabel,
    value: round2(pool.mean),
    n: pool.attempts,
    citation: 'golf_shots: teammates on the same team, per-shot SG at the team SG scale',
  };
  const tourLine: ComparisonLine = {
    source: 'tour',
    label: 'Tour baseline (0 strokes gained per shot; the arithmetic only)',
    value: 0,
    n: null,
    citation: fam.citations[0],
  };
  const d = r.drivers;
  const t = pool.drivers;
  const greenLine = `You found the green ${pctLine(d)}; the team ${t.green_pct ?? 0}%.`;
  const proxLine =
    d.proximity_ft !== null && t.proximity_ft !== null
      ? ` On the green, ${d.proximity_ft} ft from the hole on average (team ${t.proximity_ft} ft).`
      : '';
  const shortLine =
    d.depth_tagged > 0
      ? ` Of the ${d.depth_tagged} misses with a recorded depth, ${d.short} finished short (${d.short_pct}%; team ${t.short_pct ?? 0}%).`
      : d.misses > 0
        ? ` None of the ${d.misses} misses has a recorded short/long direction.`
        : '';
  const bandLine = isPar3
    ? ` By length: ${r.bands
        .filter((b) => b.player.attempts > 0)
        .map((b) => `${b.label} ${b.player.greens} of ${b.player.attempts} greens${b.team && b.team.green_pct !== null ? ` (team ${b.team.green_pct}%)` : ''}`)
        .join(', ')}.`
    : ' Par-3 tee shots are counted on their own, not in this band.';
  const what = `${r.label.charAt(0).toUpperCase()}${r.label.slice(1)}`;

  const receipts: AngleReceipts = {
    window: r.window,
    definition: SG_DEFINITION,
    samples: {
      rounds: r.rounds,
      rounds_with_attempts: r.rounds_with_attempts,
      attempts: r.n,
      team_attempts: pool.attempts,
      teammates: pool.players,
    },
    exclusions: r.excluded,
    examples: r.examples,
  };

  const evidence: AngleEvidence = {
    ...angleReadFields(r.family as AngleFamilyId, r.round_ids, primary, [tourLine]),
    ...(r.split_half ? { stability: { split_half: r.split_half } } : {}),
    metric: fam.metric,
    metric_label: `Strokes gained per ${isPar3 ? 'par-3 tee shot' : 'approach'}${isPar3 ? '' : `, ${r.label.replace('approaches from ', '')}`}`,
    unit: 'strokes',
    polarity: 'higher_better',
    your_value: round2(r.player_mean),
    your_value_display: `${r.player_mean >= 0 ? '+' : ''}${r.player_mean.toFixed(2)} per shot`,
    comparison_value: round2(pool.mean),
    comparison_label: teamLabel,
    comparison_source: 'team_avg',
    sample_n: r.n,
    window_days: r.window.window_days,
    window_start: r.window.window_start,
    window_end: r.window.window_end,
    strokes_impact: impactOf(cf),
    strokes_impact_method: 'sg_baseline',
    confidence: 0,
    confidence_factors: { sample_adequacy: Math.min(r.n / (2 * fam.floor), 1), recency: 1, variance: 0.5 },
    counterfactual: cf,
    detail: {
      ...familyDetail(r.family as AngleFamilyId),
      gap_input: sgGapInput(r),
      test: angleTest(r.z),
      angle: isPar3 ? 'par3_tee_split' : 'sg_per_approach',
      receipts,
      gap_per_shot: round4(gap),
      attempts_per_18: round2(r.attempts_per_18),
      strokes_per_round: round2(strokes),
      drivers: d,
      team_drivers: t,
      bands: r.bands,
      rounds: r.rounds,
      benchmark_note:
        'Words compare with your team (pooled shots); strokes use the Tour baseline at your team SG scale, the same arithmetic as your stored round SG.',
    },
    diagnosis: {
      symptom: `${what}: ${gap.toFixed(2)} strokes per shot behind the team, about ${strokes.toFixed(1)} a round`,
      root_cause: 'The record shows where the strokes go (greens hit, short misses, leave on the green), not why.',
      causality_level: 'inferred_hypothesis',
      drivers: [
        { metric: fam.metric, label: 'Strokes gained per shot', value: round2(r.player_mean), unit: 'strokes', sample_n: r.n, source: 'golf_shots (per-shot SG)' },
        ...(d.green_pct !== null ? [{ metric: 'greens_hit_pct', label: 'Greens hit', value: d.green_pct, unit: 'percent' as const, sample_n: d.attempts, source: 'golf_shots.result / lie_after' }] : []),
        ...(d.short_pct !== null ? [{ metric: 'short_miss_pct', label: 'Short share of misses', value: d.short_pct, unit: 'percent' as const, sample_n: d.depth_tagged, source: 'golf_shots.miss_direction' }] : []),
        ...(d.proximity_ft !== null ? [{ metric: 'proximity_when_hit_ft', label: 'Proximity when the green was hit', value: d.proximity_ft, unit: 'feet' as const, sample_n: d.greens, source: 'golf_shots.distance_to_hole_after' }] : []),
      ],
      recommended_action: isPar3
        ? 'Par-3 club choice: play to the middle of the green on the longer holes and judge each tee shot by greens hit.'
        : (d.short_pct ?? 0) > (t.short_pct ?? 100)
          ? `Distance control from ${r.label.replace('approaches from ', '')}: take the longer club when between, scored on misses short.`
          : `Approach reps from ${r.label.replace('approaches from ', '')}, scored on greens hit and leave distance.`,
      confidence_reason: '',
    },
  };

  return {
    category: 'approach',
    title: `${what} lose strokes to your team`,
    content:
      `${what} lose ${gap.toFixed(2)} strokes per shot against your teammates' pooled shots (${r.n} of yours, ${pool.attempts} of theirs), about ${strokes.toFixed(1)} strokes a round over ${r.attempts_per_18.toFixed(1)} a round. ` +
      `${greenLine}${proxLine}${shortLine}${bandLine}`,
    priority: strokes >= 0.5 ? 'medium' : 'low',
    signature: isPar3 ? 'par3_tee:all' : `approach_sg:${r.family.replace('approach_sg_', '')}`,
    evidence,
  };
}

class SgFamilyGenerator extends AngleGenerator<SgAggregate> {
  readonly name: string;
  readonly metricId: MetricId = 'sg_approach';
  readonly insightType = 'approach';
  readonly category: InsightCategory = 'approach';
  readonly minSampleN = 20;
  protected override readonly requiresStanding = false;

  constructor(
    playerId: string,
    loaders: AngleLoaders,
    private readonly family: SgFamilyId,
  ) {
    super(playerId, loaders);
    this.name = family === 'par3_tee' ? 'Par3TeeGenerator' : `ApproachSgGenerator:${family}`;
  }

  protected override signatureScope(): string {
    return this.family === 'par3_tee' ? 'par3_tee:' : `approach_sg:${this.family.replace('approach_sg_', '')}`;
  }

  async aggregate(): Promise<SgAggregate | null> {
    const data = await this.loaders.data();
    const teamId = primaryTeamId(data.rounds);
    const team = teamId ? await this.loaders.teamShots(teamId) : null;
    return toSgAggregate(computeSgFamily(this.family, data, team), data.scoringBaseline);
  }

  composeContent(agg: SgAggregate): ComposedContent {
    const { category: _category, ...composed } = composeSgFamily(agg);
    return composed;
  }
}

export class Par3TeeGenerator extends SgFamilyGenerator {
  constructor(playerId: string, loaders: AngleLoaders) {
    super(playerId, loaders, 'par3_tee');
  }
}

export class ApproachSgGenerator extends SgFamilyGenerator {
  constructor(playerId: string, loaders: AngleLoaders, band: ApproachBand) {
    super(playerId, loaders, APPROACH_SG_FAMILY[band]);
  }
}
