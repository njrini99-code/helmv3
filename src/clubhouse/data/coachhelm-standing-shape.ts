import { TEAM_MARKER_MIN_N } from '@/components/golf/coachhelm/v3/StandingBar/types';
import { fitScale, formatValue, pgaOmissionNote, teamCohortText, toScalePct, valuesDisplayEqual } from '@/components/golf/coachhelm/v3/StandingBar/utils';
import { computeCounterfactual } from '@/lib/coachhelm/v3/counterfactual/compute';
import { capByParentSg, parentSgMetric, sgBehindTour } from '@/lib/coachhelm/v3/counterfactual/parent-cap';
import { METRIC_IDS, type MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { METRIC_RENDER_CONFIG } from '@/lib/coachhelm/v3/standing/metric-config';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { fmtShortDate } from '@/components/golf/coachhelm/home/buildPlayerHubViewModel';
import { formatSigned, NO_DATA } from '../lib/format';
import { LADDER_METRICS, toChLadder, type ChLadder, type ChLadderReads } from './coachhelm-ladder-shape';

/**
 * The player's Standing (Clubhouse P013, `?view=standing`): where they stand on every tracked metric against the Tour and against
 * their team, with the percentile, the basis and a projection of what closing a gap is worth. The reads are the Fairway page's
 * (`loadPlayerStandingMap`, the scoring baseline, the F028 counterfactual); every number is theirs, re-worded and never computed
 * here beyond a difference. Pure, so the loader, the preview and the tests run this one function.
 *
 * Wording follows the one standing doctrine the StandingBar carries (its `utils.ts`, which this imports): ranks are never
 * "averages"; percentile language starts at 20 teammates (a smaller roster says "top of your team"); the team marker and the
 * percentile need five measured teammates (`TEAM_MARKER_MIN_N`, the floor the SQL refresh uses as well); strokes gained is
 * named against the Tour, as Stats names it (Q-88); a women's team's Tour is the LPGA's; a Tour reference that is not
 * comparable says why and is never drawn.
 */

export type ChStandGroupId = 'sg' | 'putting' | 'approach' | 'short_game' | 'scoring' | 'course_mgmt' | 'pressure';

/** Which side of a comparison the player is on, by the metric's own direction. */
export type ChStandSense = 'ahead' | 'behind' | 'level';

export interface ChStandVs {
  sense: ChStandSense;
  /** "9 pts behind the Tour", "3 ft closer than your team average", "Level with the Tour". */
  text: string;
}

export interface ChStandProjection {
  /** Strokes a round it would take off a scoring average ("0.7"). */
  strokes: string;
  /** The scoring average now and with the gap closed ("77.2", "76.5"). */
  from: string;
  to: string;
  /** The typical time to close it, in weeks. */
  weeks: number;
  /** The projection was capped at the metric's ceiling: a bound, not a forecast. */
  clamped: boolean;
}

export interface ChStandRow {
  id: string;
  /** Sentence case ("Putts made, 5–10 ft"). */
  label: string;
  /** The player's value in its unit. */
  you: string;
  /** Where the player's marker, and the other two, sit on the row's scale (0 to 100). */
  youPct: number;
  /** The Tour's value ("Tour" or "LPGA Tour", strokes gained included); null when it is not comparable, with `tourNote` saying why. */
  tour: { label: string; /** How a sentence names it: "the Tour", "the LPGA Tour". */ ref: string; text: string; pct: number } | null;
  tourNote: string | null;
  /** The team average and how many teammates it counts; null below five (`teamNote` says so). */
  team: { text: string; pct: number; n: number } | null;
  teamNote: string | null;
  vsTour: ChStandVs | null;
  vsTeam: ChStandVs | null;
  /** "Top quartile on your team"; null without a percentile to stand behind. */
  percentile: string | null;
  /** What closing the gap to the Tour is worth; null when the gap is small, there is no baseline, or the Tour is not comparable. */
  projection: ChStandProjection | null;
}

export interface ChStandGroup {
  id: ChStandGroupId;
  label: string;
  description: string;
  rows: ChStandRow[];
}

export interface ChStanding {
  /** `empty`: no standing row yet. `early`: rows, but fewer rounds than a projection needs. `ready`: the rest. */
  state: 'empty' | 'early' | 'ready';
  /** Rounds on file (`golf_player_stats_cache.rounds_played`); null when that row could not be read or has none. */
  rounds: number | null;
  /** Their scoring average, the base every projection starts from ("77.2"); null below the projection floor or when unknown. */
  scoringAverage: string | null;
  /** The scoring-average read failed: the projections are missing, and the page says so. */
  baselineFailed: boolean;
  /** The newest refresh among the rows ("Sep 30"). */
  refreshed: string | null;
  /** The Tour the rows are against: "Tour", or "LPGA Tour" for a women's team. */
  tour: string;
  /**
   * The cohort lookup (the player's team's gender, which picks the Tour) failed: the rows were drawn against the men's Tour as the
   * default, which is not known to be theirs, and the page says so rather than state the Tour as fact. Absent when it read.
   */
  cohortFailed?: true;
  groups: ChStandGroup[];
  counts: { measures: number; tour: { of: number; ahead: number }; team: { of: number; ahead: number } };
  /**
   * Where strokes go (design call, Standing): the four parts of the round against the Tour, with the open reads behind each. It
   * replaced "Most to gain" (the three biggest projections), which drew the same top gap the hero and the rows already drew.
   */
  ladder: ChLadder;
}

/**
 * The scoring-average read the screen needs (`golf_player_stats_cache`). `attemptsPerRound`: the player's own attempts a round for a
 * metric the counterfactual sizes by them (putts in each band, sand shots), from the same cache row the generators read them from,
 * so a row's projection is the one its insight card states.
 */
export type ChStandBaselineRead =
  | { status: 'ok'; roundsPlayed: number | null; scoringAverage: number | null; attemptsPerRound?: Partial<Record<MetricId, number>> }
  | { status: 'failed' };

/** Rounds a projection needs before it starts from the scoring average: the Fairway loader's own rule (`loadPlayerScoringBaseline`). */
export const MIN_PROJECTION_ROUNDS = 5;

const LABEL: Record<MetricId, string> = {
  sg_total: 'Strokes gained: total',
  sg_ott: 'Strokes gained: off the tee',
  sg_approach: 'Strokes gained: approach',
  sg_around_green: 'Strokes gained: around the green',
  sg_putting: 'Strokes gained: putting',
  putts_made_3_5ft_pct: 'Putts made, 3–5 ft',
  putts_made_5_10ft_pct: 'Putts made, 5–10 ft',
  putts_made_10_15ft_pct: 'Putts made, 10–15 ft',
  putts_made_15_25ft_pct: 'Putts made, 15–25 ft',
  putts_made_25_plus_ft_pct: 'Putts made, 25+ ft',
  putt_miss_bias_high_pct: 'Putts missed high',
  putt_miss_bias_low_pct: 'Putts missed low',
  putt_miss_bias_left_pct: 'Break make rate, left to right',
  putt_miss_bias_right_pct: 'Break make rate, right to left',
  approach_proximity_50_125ft: 'Approach proximity, 50–125 yd',
  approach_proximity_125_175ft: 'Approach proximity, 125–175 yd',
  approach_proximity_175_plus_ft: 'Approach proximity, 175+ yd',
  scrambling_pct_rough: 'Scrambling from the rough',
  scrambling_pct_sand: 'Scrambling from sand',
  scrambling_pct_fairway: 'Scrambling from the fairway',
  penalty_rate_per_round: 'Penalties per round',
  big_number_rate: 'Doubles or worse',
  scoring_par_3: 'Par 3 scoring',
  scoring_par_4: 'Par 4 scoring',
  scoring_par_5: 'Par 5 scoring',
  gir_pct: 'Greens in regulation',
  practice_tournament_delta: 'Tournament scoring against practice',
  opening_hole_delta: 'Opening hole against the rest of the round',
};

const GROUPS: ReadonlyArray<{ id: ChStandGroupId; label: string; description: string }> = [
  { id: 'sg', label: 'Strokes gained', description: 'Strokes gained or lost per round, against the Tour.' },
  { id: 'putting', label: 'Putting', description: 'How often putts drop from each distance, and how your misses break.' },
  { id: 'approach', label: 'Approach', description: 'How close your approach shots finish, and how often you find the green.' },
  { id: 'short_game', label: 'Short game', description: 'How often you save par from each lie.' },
  { id: 'scoring', label: 'Scoring', description: 'Your average score on par 3s, 4s and 5s.' },
  { id: 'course_mgmt', label: 'Course management', description: 'Penalties, and how often a hole gets away from you.' },
  { id: 'pressure', label: 'Pressure', description: 'Tournament and qualifier scoring against practice over the last 90 days, and what your opening hole costs.' },
];

/** Which group a metric is in (the Fairway Standing drill's own split). */
export function groupOf(metricId: string): ChStandGroupId {
  if (metricId.startsWith('sg_')) return 'sg';
  if (metricId.startsWith('putts_made_') || metricId.startsWith('putt_miss_bias_')) return 'putting';
  if (metricId.startsWith('approach_') || metricId === 'gir_pct') return 'approach';
  if (metricId.startsWith('scrambling_')) return 'short_game';
  if (metricId.startsWith('scoring_par_')) return 'scoring';
  if (metricId === 'penalty_rate_per_round' || metricId === 'big_number_rate') return 'course_mgmt';
  if (metricId === 'practice_tournament_delta' || metricId === 'opening_hole_delta') return 'pressure';
  return 'sg';
}

type Unit = (typeof METRIC_RENDER_CONFIG)[MetricId]['unit'];

/** Strokes gained and the pressure deltas are signed differences; a par scoring average is a plain score. */
const signed = (id: string) => id.startsWith('sg_') || id.endsWith('_delta');

/** A value in its unit, with the true minus and a dash for no data (`formatValue` prints the ASCII hyphen). */
export function figure(id: string, unit: Unit, v: number): string {
  if (!Number.isFinite(v)) return NO_DATA;
  switch (unit) {
    case 'percent':
      return `${Math.round(v)}%`;
    case 'strokes':
      return signed(id) ? formatSigned(v, 2) : v.toFixed(2);
    case 'yards':
      return `${Math.round(v)} yd`;
    case 'feet':
      return `${Math.round(v)} ft`;
    case 'count':
      return v.toFixed(1);
    default:
      return formatValue(v, unit);
  }
}

/** How far apart two values are, in the metric's unit: "9 pts", "3 ft", "0.42 strokes". */
function gap(unit: Unit, d: number): string {
  const a = Math.abs(d);
  switch (unit) {
    case 'percent':
      return `${Math.round(a)} pts`;
    case 'strokes':
      return `${a.toFixed(2)} strokes`;
    case 'yards':
      return `${Math.round(a)} yd`;
    case 'feet':
      return `${Math.round(a)} ft`;
    default:
      return a.toFixed(1);
  }
}

/** The player against one reference, by the metric's own direction. `ref`: how the reference is named ("the Tour", "your team average"). */
export function versus(you: number, other: number, direction: 'higher_better' | 'lower_better', unit: Unit, ref: string): ChStandVs {
  if (valuesDisplayEqual(you, other, unit)) return { sense: 'level', text: `Level with ${ref}` };
  const better = direction === 'higher_better' ? you > other : you < other;
  const mag = gap(unit, you - other);
  if (unit === 'feet') return { sense: better ? 'ahead' : 'behind', text: `${mag} ${better ? 'closer than' : 'farther than'} ${ref}` };
  return { sense: better ? 'ahead' : 'behind', text: `${mag} ${better ? 'ahead of' : 'behind'} ${ref}` };
}

const oneDecimal = (v: number) => v.toFixed(1);

/**
 * What closing the gap is worth, when it is worth drawing. Sized by the player's own attempts a round where the cache has them; without
 * them the counterfactual falls back to a fixed rate (a 17-point 3–5 ft gap read as 1.7 strokes while all of putting was 0.63 behind),
 * so it is capped at what its strokes-gained category is behind the Tour, and a cap below the noise floor draws nothing.
 */
function projectionOf(s: PlayerStanding, id: MetricId, baseline: number, attempts: number | null, cap: number | null) {
  const cfg = METRIC_RENDER_CONFIG[id];
  const p = capByParentSg(
    computeCounterfactual({ metric_id: id, direction: cfg.direction, player_value: s.player_value, pga_value: s.pga_value, player_30d_scoring_avg: baseline, player_attempts_per_round: attempts }),
    cap,
  );
  return p.suppressed || p.current_baseline_score == null || p.projected_score_if_closed == null ? null : p;
}

function toRow(s: PlayerStanding, id: MetricId, baseline: number | null, attempts: number | null = null, cap: number | null = null): ChStandRow {
  const cfg = METRIC_RENDER_CONFIG[id];
  const womens = s.is_womens === true;
  const tourShown = !s.pga_omitted && Number.isFinite(s.pga_value);
  const teamShown = s.team_avg != null && s.team_n >= TEAM_MARKER_MIN_N;
  const scale = fitScale(cfg.default_scale, [s.player_value, tourShown ? s.pga_value : null, teamShown ? s.team_avg : null]);
  // The Tour's name on the row: the team's own Tour, strokes gained included, as Stats says "vs Tour" (Q-88, P013 D4).
  const tourLabel = womens ? 'LPGA Tour' : 'Tour';
  const tourRef = womens ? 'the LPGA Tour' : 'the Tour';
  const worth = tourShown && baseline != null ? projectionOf(s, id, baseline, attempts, cap) : null;
  return {
    id,
    label: LABEL[id],
    you: figure(id, cfg.unit, s.player_value),
    youPct: toScalePct(s.player_value, scale),
    tour: tourShown ? { label: tourLabel, ref: tourRef, text: figure(id, cfg.unit, s.pga_value), pct: toScalePct(s.pga_value, scale) } : null,
    // A reference that is not comparable says why (the StandingBar's own captions); a metric whose Tour value is simply absent says nothing.
    tourNote: !tourShown ? pgaOmissionNote({ pga_omitted: s.pga_omitted, pga_omitted_reason: s.pga_omitted_reason, is_womens: womens }) : null,
    team: teamShown ? { text: figure(id, cfg.unit, s.team_avg as number), pct: toScalePct(s.team_avg as number, scale), n: s.team_n } : null,
    teamNote: teamShown ? null : `Team comparison needs ${TEAM_MARKER_MIN_N} teammates with this stat${s.team_n > 0 ? ` (${s.team_n} so far)` : ''}.`,
    vsTour: tourShown ? versus(s.player_value, s.pga_value, cfg.direction, cfg.unit, tourRef) : null,
    vsTeam: teamShown ? versus(s.player_value, s.team_avg as number, cfg.direction, cfg.unit, 'your team average') : null,
    percentile: teamShown && s.team_pct != null ? teamCohortText(s.team_pct, s.team_n) || null : null,
    projection: worth
      ? {
          strokes: oneDecimal(worth.strokes_saved_per_round),
          from: oneDecimal(worth.current_baseline_score as number),
          to: oneDecimal(worth.projected_score_if_closed as number),
          weeks: Math.max(1, Math.round(worth.weeks_to_typical_close)),
          clamped: worth.clamped === true,
        }
      : null,
  };
}

/**
 * The standing rows and the scoring-average read as the screen draws them. `rows`: `loadPlayerStandingMap`'s values (any order);
 * a metric the registry does not know has no row here. `baseline`: the stats-cache read, whose failure is its own state.
 * `reads`: the player's open reads for the ladder's "Because" (`coachhelm-ladder-shape.ts`); null draws the ladder without them.
 */
export function toChStanding(rows: readonly PlayerStanding[], baseline: ChStandBaselineRead, reads: ChLadderReads | null = null): ChStanding {
  const roundsPlayed = baseline.status === 'ok' ? baseline.roundsPlayed : null;
  const average = baseline.status === 'ok' && roundsPlayed != null && roundsPlayed >= MIN_PROJECTION_ROUNDS ? baseline.scoringAverage : null;
  const byId = new Map(rows.map((r) => [r.metric_id as string, r]));
  const attempts = baseline.status === 'ok' ? (baseline.attemptsPerRound ?? {}) : {};
  const drawn: Array<{ id: MetricId; row: ChStandRow }> = [];
  for (const id of METRIC_IDS) {
    const s = byId.get(id);
    if (s && Number.isFinite(s.player_value)) drawn.push({ id, row: toRow(s, id, average, attempts[id] ?? null, sgBehindTour(byId.get(parentSgMetric(id) ?? ''))) });
  }
  // The four parts of the round are Where strokes go's; drawn again in the Strokes gained group they would repeat its numbers
  // (design call: no number twice on one screen). Strokes gained: total stays there, and a group left empty is not drawn. They
  // still count among the comparisons the hero states, since the ladder draws them.
  const grouped = drawn.filter((d) => !LADDER_METRICS.has(d.id));
  const groups: ChStandGroup[] = GROUPS.map((g) => ({ ...g, rows: grouped.filter((d) => groupOf(d.id) === g.id).map((d) => d.row) })).filter((g) => g.rows.length > 0);
  const all = drawn.map((d) => d.row);
  const newest = rows.map((r) => r.computed_at).filter((d): d is string => typeof d === 'string').sort().pop() ?? null;
  const ladder = toChLadder(
    rows.filter((r) => Number.isFinite(r.player_value)),
    reads,
  );
  const withTour = all.filter((r) => r.vsTour);
  const withTeam = all.filter((r) => r.vsTeam);
  return {
    // A failed scoring-average read is not an early read: it is not known how many rounds there are, and the page says the read failed.
    state: all.length === 0 ? 'empty' : baseline.status === 'ok' && (roundsPlayed == null || roundsPlayed < MIN_PROJECTION_ROUNDS) ? 'early' : 'ready',
    rounds: roundsPlayed,
    scoringAverage: average != null ? oneDecimal(average) : null,
    baselineFailed: baseline.status === 'failed',
    refreshed: fmtShortDate(newest),
    tour: rows.some((r) => r.is_womens === true) ? 'LPGA Tour' : 'Tour',
    groups,
    counts: {
      measures: all.length,
      tour: { of: withTour.length, ahead: withTour.filter((r) => r.vsTour?.sense === 'ahead').length },
      team: { of: withTeam.length, ahead: withTeam.filter((r) => r.vsTeam?.sense === 'ahead').length },
    },
    ladder,
  };
}
