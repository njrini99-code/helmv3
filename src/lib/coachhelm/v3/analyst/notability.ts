/**
 * CoachHelm analyst, part 2: notability.
 *
 * Fact sheet in; at most three candidates out, plus the good news and the measures that were checked and are
 * unremarkable, in separate lists that never mix with the candidates. It asks one thing: what is unusual about THIS
 * player. A measure is a candidate only when at least one of these holds, each on a test that excludes "no difference":
 *
 *   (a) CHANGED             the last 10 rounds against the player's own previous 10
 *                           (two rates: Newcombe range and pooled z; two means: Welch range and t).
 *   (b) STANDS OUT IN TEAM  the player against the teammates' median, on a robust spread (median and MAD).
 *   (c) BIGGEST COST        the strokes-gained area the player loses most in, when it is a real loss AND clearly worse
 *                           than the player's own other areas (paired by round, widened for choosing one of four).
 *
 * A gap to the Tour alone never makes a candidate: no rule here reads a Tour figure except (c)'s "is it a loss at all",
 * which cannot fire on its own.
 *
 * Looking at many measures is paid for with Benjamini-Hochberg across every test run for the player
 * (`v3/support/multiplicity.ts`). Candidates are ranked by strokes per round at stake, with its range, never by a
 * confidence score.
 *
 * Pure: fact sheet in, lists out. Every threshold is a named constant with its reason.
 */
import { REFERENCE_MISSED_GREEN_COST } from '@/lib/coachhelm/v3/counterfactual/measured-impact';
import { studentTSf, tQuantile975 } from '@/lib/coachhelm/v3/support/distributions';
import { computeGap, type GapResult } from '@/lib/coachhelm/v3/support/gap';
import { BH_Q, benjaminiHochberg } from '@/lib/coachhelm/v3/support/multiplicity';
import { STROKES_GAINED_AREA_IDS } from './measures';
import { meanSummary, satterthwaiteDf, tQuantile } from './stats';
import type { FactSheet, MeasureArea, MeasureFact, MeasureUnit, RoundStrokesGained, WindowFigure, WindowKey } from './types';

// ── Thresholds ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Two-sided level of every range a rule reads: the 95% range the fact sheet prints, so a rule and a card can never disagree. */
export const ALPHA = 0.05;

/**
 * The share of false reads tolerated among the reads a player's run raises (Benjamini-Hochberg q). The engine's
 * existing owner default (`BH_Q` in v3/support/multiplicity.ts): a false read is cheap to correct at the next run.
 */
export const FALSE_DISCOVERY_RATE = BH_Q;

/**
 * Rounds a figure must rest on before it is tested. Stats measures a player's own round-to-round spread only from
 * five rounds (src/clubhouse/lib/stats-signal.ts `OWN_SD_MIN_ROUNDS`); under that a window is a day or two of golf.
 */
export const MIN_ROUNDS_PER_WINDOW = 5;

/**
 * Teammates with a value before a player can "stand out". A median and a MAD from fewer than five values are set by
 * one or two players, so on a smaller team rule (b) never fires.
 */
export const MIN_TEAMMATES = 5;

/**
 * A median and a MAD are noisier than a mean and a standard deviation from the same teammates, and rule (b)'s test has
 * to carry that or it calls outliers too often. Under normal data the median has 2/π of the mean's efficiency, so the
 * median of m teammates varies like σ²·(π/2)/m; and the MAD has 0.3675 of the standard deviation's efficiency, so the
 * spread it gives is worth 0.3675 × (m − 1) degrees of freedom, not m − 1. Both are the textbook large-sample values.
 * `__tests__/calibration.test.ts` draws teams of identical players and checks that the test then fires at its stated rate.
 */
export const MEDIAN_VARIANCE_FACTOR = Math.PI / 2;
export const MAD_EFFICIENCY = 0.3675;

/**
 * Rounds measured from logged shots, each with all four areas, before the biggest cost is judged: the same five-round
 * reason as {@link MIN_ROUNDS_PER_WINDOW}, counted in the rounds rule (c) actually pairs.
 */
export const MIN_MEASURED_ROUNDS_FOR_COST = 5;

/** Rule (c) picks the worst of four areas and then tests it, so its level is divided by four (Bonferroni). */
export const COST_AREAS_SEARCHED = STROKES_GAINED_AREA_IDS.length;

/** The owner's cap: three things per player. */
export const MAX_CANDIDATES = 3;

/**
 * Strokes per event, used only to size a rate in strokes per round for ranking. Each is the definitional lower bound
 * the Stats priorities already use (src/lib/golf/strokes-gained.ts:240-244): a holed putt against a miss saves at
 * least the next putt, a penalty is one stroke, a failed save is par against bogey, a double is at least one worse than
 * the bogey it would most plausibly have been.
 */
export const STROKES_PER_PUTT = 1;
export const STROKES_PER_PENALTY = 1;
export const STROKES_PER_FAILED_SAVE = 1;
export const STROKES_PER_BIG_NUMBER = 1;
/** A missed green costs the expected-strokes table's reference miss (rough at 20 yards against a 30-foot putt). */
export const STROKES_PER_MISSED_GREEN = REFERENCE_MISSED_GREEN_COST;
const HOLES_PER_ROUND = 18;

// ── Shapes ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type Rule = 'changed' | 'stands_out_in_team' | 'biggest_cost';

/** A shot-level question the analyst should ask next. Data, not prose. */
export type ShotAsk =
  | 'misses_by_side'
  | 'misses_by_length'
  | 'by_lie_before'
  | 'putts_by_break'
  | 'putts_by_slope'
  | 'first_putt_distance'
  | 'three_putt_first_putt_distance'
  | 'tee_shot_misses_by_side'
  | 'tee_club_split'
  | 'penalties_by_shot_type'
  | 'up_and_down_by_lie'
  | 'up_and_down_leave_distance'
  | 'holes_at_double_or_worse'
  | 'strokes_gained_by_area'
  | 'strokes_gained_by_shot_distance'
  | 'hole_one_shots'
  | 'by_hole_par'
  | 'by_course'
  | 'by_round_type'
  | 'by_round'
  | 'teammates_same_courses';

export interface ShotQuestion {
  ask: ShotAsk;
  /** The distance band the measure covers ('125_175', '5_10'), where it has one. */
  band?: string;
  /** The part of the game to split, where the question is about one. */
  area?: MeasureArea;
  par?: 3 | 4 | 5;
  /** The windows to compare, for a change. */
  windows?: WindowKey[];
}

export interface StrokesAtStake {
  /** Strokes per round against the comparison: positive is strokes lost, negative strokes gained. */
  per_round: number;
  /** The same conversion applied to the two ends of the difference's range. */
  low: number;
  high: number;
  /**
   *   strokes         the measure is already in strokes
   *   floor_per_event a rate times the player's own attempts per round times a lower-bound stroke cost per event
   *   reference_cost  a rate times attempts per round times the expected-strokes table's reference cost of a missed green
   */
  basis: 'strokes' | 'floor_per_event' | 'reference_cost';
  how: string;
}

export interface Reason {
  rule: Rule;
  /** Worse or better than what it was compared with, by the measure's direction. */
  verdict: 'worse' | 'better';
  compared: {
    with: 'own_previous_window' | 'team_median' | 'own_other_areas';
    /** The player's figure. */
    player: { value: number; attempts: number; rounds: number; window: WindowKey };
    /** What it was set against. */
    against: { value: number; attempts: number | null; rounds: number | null; window: WindowKey; teammates?: number; spread?: number };
  };
  /** Player minus comparison, in the measure's own unit, with the two-sided range the rule read. */
  difference: { value: number; low: number; high: number; unit: MeasureUnit; level: number };
  test: {
    name: string;
    /** Two-sided p-value. */
    p_value: number;
    /** Benjamini-Hochberg adjusted, across every test run for this player. */
    q_value: number;
  };
  /** Null where no sound conversion to strokes exists (fairways, proximity): such a reason ranks after every sized one. */
  strokes_at_stake: StrokesAtStake | null;
  /**
   * Rule (c) only, and only with teammates on the sheet: the area the TEAM loses most in (lowest teammates' median), and
   * whether it is this player's too. When it is, the cost is the team's shape as much as the player's: one team item,
   * not a card each. Information for the team read; it does not decide whether the reason fires.
   */
  team_shape?: { team_worst_area: string; same_as_team: boolean };
}

export interface CandidateRef {
  measure_id: string;
  label: string;
  area: MeasureArea;
  reasons: Reason[];
  /** The other rules that were tested on this measure and found nothing. */
  also_tested: Array<{ rule: Rule; p_value: number; q_value: number }>;
}

export interface Candidate extends CandidateRef {
  /** 1 is the most strokes at stake. */
  rank: number;
  /** The reason it is ranked on: the worse reason with the most strokes at stake. */
  strokes_at_stake: StrokesAtStake | null;
  /** Other measures in the same area that also qualified: two views of one problem, raised once. */
  supporting: CandidateRef[];
  questions: ShotQuestion[];
}

export interface CheckedMeasure {
  measure_id: string;
  label: string;
  /** The tests that ran and found nothing, with their p-values. */
  tests: Array<{ rule: Rule; p_value: number; q_value: number }>;
}

export interface Notability {
  player_id: string;
  as_of: string;
  /** At most {@link MAX_CANDIDATES}, ranked by strokes per round at stake. */
  candidates: Candidate[];
  /** Measures that moved or stand out in the player's favor. Never in the candidate list. */
  good_news: CandidateRef[];
  /** Measures that were tested and show nothing. Never in the candidate list. */
  unremarkable: CheckedMeasure[];
  /** Measures no rule could test, each with why (too thin, estimated, no previous window, too few teammates). */
  not_checked: Array<{ measure_id: string; label: string; why: string }>;
  /** Qualified, but past the cap of three. */
  beyond_cap: CandidateRef[];
  /** Scoring average and strokes gained total that qualified while a more specific measure also did: context for those. */
  outcome_context: CandidateRef[];
  tests: { run: number; alpha: number; false_discovery_rate: number; supported: number };
}

// ── Strokes at stake ────────────────────────────────────────────────────────────────────────────────────────────────

const round2 = (n: number): number => Math.round(n * 100) / 100;
const r4 = (n: number): number => Math.round(n * 1e4) / 1e4;

interface StrokeScale {
  /** Strokes per round for one unit of the measure. */
  factor: number;
  basis: StrokesAtStake['basis'];
  how: string;
}

/** How one unit of a measure converts to strokes per round, from the player's own attempt rate; null where nothing sound exists. */
export function strokeScale(m: MeasureFact): StrokeScale | null {
  const perRound = m.current.window.rounds > 0 ? m.current.sample.attempts / m.current.window.rounds : 0;
  const rate = (cost: number, basis: StrokesAtStake['basis'], what: string): StrokeScale => ({
    factor: (perRound * cost) / 100,
    basis,
    how: `${round2(perRound)} ${what} per round of the window x the rate difference x ${round2(cost)} strokes each`,
  });
  if (m.unit === 'strokes_per_round') return { factor: 1, basis: 'strokes', how: 'the measure is strokes per round' };
  if (m.id === 'scoring_average') return { factor: 1, basis: 'strokes', how: 'the measure is strokes per round' };
  if (m.id === 'putts_per_round') return { factor: STROKES_PER_PUTT, basis: 'strokes', how: 'one stroke per putt' };
  if (m.id === 'three_putts_per_round') return { factor: STROKES_PER_PUTT, basis: 'floor_per_event', how: 'at least one stroke per three-putt' };
  if (m.id === 'penalty_strokes_per_round') return { factor: STROKES_PER_PENALTY, basis: 'strokes', how: 'the measure is penalty strokes per round' };
  if (m.id === 'opening_hole') return { factor: 1, basis: 'strokes', how: 'one opening hole per round' };
  if (/^par_[345]_scoring$/.test(m.id)) return { factor: perRound, basis: 'strokes', how: `${round2(perRound)} such holes per round of the window x the difference per hole` };
  if (m.id === 'big_numbers') return { factor: (HOLES_PER_ROUND * STROKES_PER_BIG_NUMBER) / 100, basis: 'floor_per_event', how: `${HOLES_PER_ROUND} holes per round x the rate difference x at least ${STROKES_PER_BIG_NUMBER} stroke each` };
  if (m.id === 'greens_in_regulation') return { factor: (HOLES_PER_ROUND * STROKES_PER_MISSED_GREEN) / 100, basis: 'reference_cost', how: `${HOLES_PER_ROUND} greens per round x the rate difference x ${round2(STROKES_PER_MISSED_GREEN)} strokes per missed green` };
  if (m.id.startsWith('approach_green_hit_')) return rate(STROKES_PER_MISSED_GREEN, 'reference_cost', 'approaches from the range');
  if (m.id === 'scrambling' || m.id === 'sand_saves') return rate(STROKES_PER_FAILED_SAVE, 'floor_per_event', 'chances');
  if (m.id.startsWith('putts_made_')) return rate(STROKES_PER_PUTT, 'floor_per_event', 'putts in the band');
  // Fairways hit and approach proximity: no sound per-event stroke cost in the repo, so no size is invented.
  return null;
}

/** A difference in the measure's unit (player minus comparison) as strokes lost per round. */
function atStake(m: MeasureFact, diff: { value: number; low: number; high: number }): StrokesAtStake | null {
  const scale = strokeScale(m);
  if (!scale || !(scale.factor > 0)) return null;
  // Lower is better: more is worse, so a positive difference is strokes lost. Higher is better: the reverse.
  const sign = m.direction === 'lower_is_better' ? 1 : -1;
  const ends = [diff.low * sign * scale.factor, diff.high * sign * scale.factor];
  return { per_round: r4(diff.value * sign * scale.factor), low: r4(Math.min(...ends)), high: r4(Math.max(...ends)), basis: scale.basis, how: scale.how };
}

// ── The rules ───────────────────────────────────────────────────────────────────────────────────────────────────────

interface Tested {
  measure: MeasureFact;
  rule: Rule;
  /** The 95% (or, for rule c, widened) range sits wholly on one side of zero. */
  rangeExcludesZero: boolean;
  /** Any further condition the rule adds beyond the range (rule b: the player's own range clears the team median). */
  alsoHolds: boolean;
  p: number;
  build: (q: number) => Reason;
}

const verdictOf = (m: MeasureFact, diff: number): Reason['verdict'] => ((m.direction === 'lower_is_better' ? diff > 0 : diff < 0) ? 'worse' : 'better');

/** A figure a rule may test: it has a value at its floor and rests on enough rounds. */
function testable(f: WindowFigure | null): f is WindowFigure & { value: number; stat: NonNullable<WindowFigure['stat']> } {
  return !!f && f.value != null && f.stat != null && f.sample.rounds >= MIN_ROUNDS_PER_WINDOW;
}

/** `computeGap` reports "worse minus better"; this turns it back into player minus comparison in the measure's unit. */
function asDifference(m: MeasureFact, g: GapResult): { value: number; low: number; high: number } {
  return m.direction === 'lower_is_better' ? { value: g.gap, low: g.range_lo, high: g.range_hi } : { value: -g.gap, low: -g.range_hi, high: -g.range_lo };
}

/**
 * (a) CHANGED. The last 10 rounds against the previous 10.
 *   Two rates: the Newcombe hybrid-score range of the difference and the pooled two-proportion z (two-sided).
 *   Two means: the difference with standard error √(se₁² + se₂²) on Welch-Satterthwaite degrees of freedom, t range and two-sided t.
 * Both come from `computeGap` (v3/support/gap.ts), which hands back the two-sided p because the direction is not declared.
 */
function changed(m: MeasureFact): Tested | string {
  const cur = m.current;
  const prev = m.previous;
  if (!prev) return 'no previous window';
  if (!testable(cur) || !testable(prev)) return `needs ${MIN_ROUNDS_PER_WINDOW} rounds behind the figure in both windows`;
  const polarity = m.direction === 'higher_is_better' ? 'higher_better' : 'lower_better';
  let gap: GapResult | null = null;
  let name = '';
  if (cur.stat.kind === 'proportion' && prev.stat.kind === 'proportion') {
    gap = computeGap({ kind: 'two_proportion', kA: cur.stat.successes, nA: cur.stat.attempts, kB: prev.stat.successes, nB: prev.stat.attempts, polarity });
    name = 'two rates: Newcombe 95% range, pooled z';
  } else if (cur.stat.kind === 'mean' && prev.stat.kind === 'mean') {
    const { se: seA, df: dfA } = cur.stat;
    const { se: seB, df: dfB } = prev.stat;
    if (seA == null || seB == null || dfA == null || dfB == null || !(seA > 0)) return 'no spread to test with';
    const df = seB > 0 ? satterthwaiteDf(seA, dfA, seB, dfB) : dfA;
    gap = computeGap({ kind: 'mean', value: cur.value, se: seA, df, benchmark: prev.value, benchmarkSe: seB, polarity });
    name = 'two means: Welch 95% range, t';
  }
  if (!gap) return 'could not be tested';
  const pValue = gap.p_bh;
  const diff = asDifference(m, gap);
  return {
    measure: m,
    rule: 'changed',
    rangeExcludesZero: diff.low > 0 || diff.high < 0,
    alsoHolds: true,
    p: pValue,
    build: (q) => ({
      rule: 'changed',
      verdict: verdictOf(m, diff.value),
      compared: {
        with: 'own_previous_window',
        player: { value: cur.value, attempts: cur.sample.attempts, rounds: cur.sample.rounds, window: 'last10' },
        against: { value: prev.value, attempts: prev.sample.attempts, rounds: prev.sample.rounds, window: 'previous10' },
      },
      difference: { ...diff, unit: m.unit, level: 1 - ALPHA },
      test: { name, p_value: pValue, q_value: q },
      strokes_at_stake: atStake(m, diff),
    }),
  };
}

/**
 * (b) STANDS OUT IN THE TEAM. The player against the teammates' median, on the robust spread s = 1.4826 × MAD.
 * It is the prediction test for one new value against a sample, with the median and the MAD in place of the mean and
 * the standard deviation: if the player were one more draw from the same team,
 *
 *   (x − median) / (s × √(1 + (π/2)/m))   follows Student's t on about 0.3675 × (m − 1) degrees of freedom
 *
 * (m teammates; see {@link MEDIAN_VARIANCE_FACTOR} and {@link MAD_EFFICIENCY}). The reason also needs the player's OWN
 * 95% range to clear the team median, so a thin sample of the player's cannot make an outlier.
 */
function standsOut(m: MeasureFact): Tested | string {
  const cur = m.current;
  const team = m.team;
  if (!team || team.n < MIN_TEAMMATES) return `needs ${MIN_TEAMMATES} teammates with a figure`;
  if (team.median == null || team.spread == null) return 'the teammates do not differ, so there is no spread to judge against';
  if (!testable(cur) || !cur.range95) return `needs ${MIN_ROUNDS_PER_WINDOW} rounds behind the figure`;
  const median = team.median;
  const spread = team.spread;
  const se = spread * Math.sqrt(1 + MEDIAN_VARIANCE_FACTOR / team.n);
  const df = MAD_EFFICIENCY * (team.n - 1);
  const d = cur.value - median;
  const half = tQuantile975(df) * se;
  const diff = { value: r4(d), low: r4(d - half), high: r4(d + half) };
  const p = Math.min(1, 2 * studentTSf(Math.abs(d / se), df));
  return {
    measure: m,
    rule: 'stands_out_in_team',
    rangeExcludesZero: diff.low > 0 || diff.high < 0,
    alsoHolds: cur.range95.low > median || cur.range95.high < median,
    p,
    build: (q) => ({
      rule: 'stands_out_in_team',
      verdict: verdictOf(m, d),
      compared: {
        with: 'team_median',
        player: { value: cur.value, attempts: cur.sample.attempts, rounds: cur.sample.rounds, window: 'last10' },
        against: { value: median, attempts: null, rounds: null, window: 'last10', teammates: team.n, spread },
      },
      difference: { ...diff, unit: m.unit, level: 1 - ALPHA },
      test: { name: 'one value against the team: median and 1.4826 x MAD, t on 0.3675 x (teammates - 1) degrees of freedom', p_value: p, q_value: q },
      strokes_at_stake: atStake(m, diff),
    }),
  };
}

const AREA_PICK: Record<(typeof STROKES_GAINED_AREA_IDS)[number], (r: RoundStrokesGained) => number | null> = {
  strokes_gained_off_the_tee: (r) => r.off_the_tee,
  strokes_gained_approach: (r) => r.approach,
  strokes_gained_around_the_green: (r) => r.around_the_green,
  strokes_gained_putting: (r) => r.putting,
};

/**
 * (c) BIGGEST COST. Over the last 10 rounds measured from logged shots (estimates never enter), the area with the
 * lowest strokes gained. It is a candidate when both hold on a range widened for having chosen one area of four
 * (two-sided level ALPHA / 4):
 *   - it is a loss: the area's own mean is below zero;
 *   - it is clearly the player's worst: round by round, (that area − the mean of the other three) is below zero.
 * The second condition is what keeps a player who is evenly below the Tour everywhere from getting a card. The size at
 * stake is that paired difference: what the area costs beyond the player's own other areas.
 */
function biggestCost(sheet: FactSheet): Tested | string {
  const rounds = sheet.strokes_gained_by_round.filter((r) => r.measured && STROKES_GAINED_AREA_IDS.every((id) => AREA_PICK[id](r) != null));
  if (rounds.length < MIN_MEASURED_ROUNDS_FOR_COST) return `needs ${MIN_MEASURED_ROUNDS_FOR_COST} rounds with shots logged; ${rounds.length} so far`;
  const means = STROKES_GAINED_AREA_IDS.map((id) => ({ id, mean: rounds.reduce((a, r) => a + (AREA_PICK[id](r) as number), 0) / rounds.length }));
  const worst = means.reduce((a, b) => (b.mean < a.mean ? b : a));
  const m = sheet.measures.find((x) => x.id === worst.id);
  if (!m) return 'the area is not on the sheet';
  const others = STROKES_GAINED_AREA_IDS.filter((id) => id !== worst.id);
  const own = meanSummary(rounds.map((r) => AREA_PICK[worst.id](r) as number))!;
  const paired = meanSummary(rounds.map((r) => (AREA_PICK[worst.id](r) as number) - others.reduce((a, id) => a + (AREA_PICK[id](r) as number), 0) / others.length))!;
  if (own.se == null || paired.se == null || paired.df == null || !(paired.se > 0)) return 'no spread to test with';
  const level = ALPHA / COST_AREAS_SEARCHED;
  const t = tQuantile(level / 2, paired.df);
  const diff = { value: r4(paired.mean), low: r4(paired.mean - t * paired.se), high: r4(paired.mean + t * paired.se) };
  const isLoss = own.mean + t * own.se < 0;
  const p = Math.min(1, COST_AREAS_SEARCHED * 2 * studentTSf(Math.abs(paired.mean / paired.se), paired.df));
  const otherMean = others.reduce((a, id) => a + means.find((x) => x.id === id)!.mean, 0) / others.length;
  // The area the teammates lose most in, where every area has a team median to compare.
  const teamMedians = STROKES_GAINED_AREA_IDS.map((id) => ({ id, median: sheet.measures.find((x) => x.id === id)?.team?.median ?? null }));
  const teamWorst = teamMedians.every((t) => t.median != null) ? teamMedians.reduce((a, b) => ((b.median as number) < (a.median as number) ? b : a)).id : null;
  return {
    measure: m,
    rule: 'biggest_cost',
    rangeExcludesZero: diff.high < 0,
    alsoHolds: isLoss,
    p,
    build: (q) => ({
      rule: 'biggest_cost',
      verdict: 'worse',
      compared: {
        with: 'own_other_areas',
        player: { value: r4(own.mean), attempts: rounds.length, rounds: rounds.length, window: 'last10' },
        against: { value: r4(otherMean), attempts: rounds.length, rounds: rounds.length, window: 'last10' },
      },
      difference: { ...diff, unit: 'strokes_per_round', level: 1 - level },
      test: { name: `paired by round against the other three areas, t; range and p widened for choosing 1 of ${COST_AREAS_SEARCHED}`, p_value: p, q_value: q },
      strokes_at_stake: atStake(m, diff),
      ...(teamWorst ? { team_shape: { team_worst_area: teamWorst, same_as_team: teamWorst === worst.id } } : {}),
    }),
  };
}

// ── Questions for the analyst ───────────────────────────────────────────────────────────────────────────────────────

const bandOf = (id: string, prefix: string): string => id.slice(prefix.length);

/** The shot-level questions to ask next about a candidate, as data. */
export function questionsFor(m: MeasureFact, rules: readonly Rule[]): ShotQuestion[] {
  const q: ShotQuestion[] = [];
  const id = m.id;
  if (id.startsWith('putts_made_')) {
    const band = bandOf(id, 'putts_made_');
    q.push({ ask: 'misses_by_side', band }, { ask: 'putts_by_break', band }, { ask: 'putts_by_slope', band });
  } else if (id === 'putts_per_round' || id === 'three_putts_per_round') {
    q.push({ ask: 'three_putt_first_putt_distance' }, { ask: 'first_putt_distance' }, { ask: 'putts_by_slope' });
  } else if (id === 'strokes_gained_putting') {
    q.push({ ask: 'strokes_gained_by_shot_distance', area: 'putting' }, { ask: 'three_putt_first_putt_distance' }, { ask: 'putts_by_break' });
  } else if (id.startsWith('approach_proximity_') || id.startsWith('approach_green_hit_')) {
    const band = bandOf(id, id.startsWith('approach_proximity_') ? 'approach_proximity_' : 'approach_green_hit_');
    q.push({ ask: 'misses_by_side', band }, { ask: 'misses_by_length', band }, { ask: 'by_lie_before', band });
  } else if (id === 'greens_in_regulation' || id === 'strokes_gained_approach') {
    q.push({ ask: 'strokes_gained_by_shot_distance', area: 'approach' }, { ask: 'misses_by_side' }, { ask: 'by_lie_before' });
  } else if (id === 'fairways_hit' || id === 'strokes_gained_off_the_tee') {
    q.push({ ask: 'tee_shot_misses_by_side' }, { ask: 'tee_club_split' }, { ask: 'penalties_by_shot_type' });
  } else if (id === 'scrambling' || id === 'sand_saves' || id === 'strokes_gained_around_the_green') {
    q.push({ ask: 'up_and_down_by_lie' }, { ask: 'up_and_down_leave_distance' });
  } else if (id === 'penalty_strokes_per_round') {
    q.push({ ask: 'penalties_by_shot_type' }, { ask: 'by_hole_par' });
  } else if (id === 'big_numbers') {
    q.push({ ask: 'holes_at_double_or_worse' }, { ask: 'penalties_by_shot_type' });
  } else if (/^par_[345]_scoring$/.test(id)) {
    q.push({ ask: 'by_hole_par', par: Number(id[4]) as 3 | 4 | 5 }, { ask: 'strokes_gained_by_area' });
  } else if (id === 'opening_hole') {
    q.push({ ask: 'hole_one_shots' }, { ask: 'by_round' });
  } else if (id === 'pressure_gap') {
    q.push({ ask: 'by_round_type' }, { ask: 'strokes_gained_by_area' });
  } else {
    q.push({ ask: 'strokes_gained_by_area' });
  }
  // Rival explanations to rule out before naming a cause.
  if (rules.includes('changed')) q.push({ ask: 'by_course', windows: ['last10', 'previous10'] }, { ask: 'by_round_type', windows: ['last10', 'previous10'] }, { ask: 'by_round', windows: ['last10', 'previous10'] });
  if (rules.includes('stands_out_in_team')) q.push({ ask: 'teammates_same_courses' });
  if (rules.includes('biggest_cost') && !q.some((x) => x.ask === 'strokes_gained_by_shot_distance')) q.push({ ask: 'strokes_gained_by_shot_distance', area: m.area });
  return q;
}

// ── Ranking and the lists ───────────────────────────────────────────────────────────────────────────────────────────

/** The reason a candidate is ranked on: its worse reason with the most strokes at stake (a sized reason before an unsized one). */
function leadStake(reasons: readonly Reason[]): StrokesAtStake | null {
  const sized = reasons.filter((r) => r.verdict === 'worse' && r.strokes_at_stake).map((r) => r.strokes_at_stake!);
  return sized.length ? sized.reduce((a, b) => (b.per_round > a.per_round ? b : a)) : null;
}

/** Most strokes at stake first; a candidate with no size after every sized one; then the measure id, so the order never depends on input order. */
function byStake(a: CandidateRef, b: CandidateRef): number {
  const sa = leadStake(a.reasons)?.per_round ?? -Infinity;
  const sb = leadStake(b.reasons)?.per_round ?? -Infinity;
  return sb - sa || a.measure_id.localeCompare(b.measure_id);
}

/** The most strokes gained first, for the good news. */
function byGain(a: CandidateRef, b: CandidateRef): number {
  const gain = (c: CandidateRef) => Math.min(...c.reasons.map((r) => r.strokes_at_stake?.per_round ?? Infinity));
  return gain(a) - gain(b) || a.measure_id.localeCompare(b.measure_id);
}

export function findNotable(sheet: FactSheet): Notability {
  const tested: Tested[] = [];
  const skipped = new Map<string, string[]>();
  const skip = (id: string, why: string) => skipped.set(id, [...(skipped.get(id) ?? []), why]);
  const notChecked: Notability['not_checked'] = [];

  for (const m of sheet.measures) {
    if (m.estimated) {
      if (m.current.value != null) notChecked.push({ measure_id: m.id, label: m.label, why: 'estimated from the scorecard, not on the Tour scale: never judged' });
      continue;
    }
    if (m.current.value == null) {
      notChecked.push({ measure_id: m.id, label: m.label, why: m.current.withheld ?? 'no figure in the last 10 rounds' });
      continue;
    }
    for (const [rule, result] of [['changed', changed(m)], ['stands out in the team', standsOut(m)]] as const) {
      if (typeof result === 'string') skip(m.id, `${rule}: ${result}`);
      else tested.push(result);
    }
  }
  const cost = biggestCost(sheet);
  if (typeof cost !== 'string') tested.push(cost);

  // Benjamini-Hochberg across every test that ran for this player.
  const bh = benjaminiHochberg(tested.map((t) => t.p), FALSE_DISCOVERY_RATE);
  const byMeasure = new Map<string, { measure: MeasureFact; reasons: Reason[]; quiet: CheckedMeasure['tests'] }>();
  let supported = 0;
  tested.forEach((t, i) => {
    const q = bh.qAdj[i] ?? 1;
    const entry = byMeasure.get(t.measure.id) ?? { measure: t.measure, reasons: [], quiet: [] };
    if (t.rangeExcludesZero && t.alsoHolds && bh.rejected[i]) {
      entry.reasons.push(t.build(r4(q)));
      supported += 1;
    } else {
      entry.quiet.push({ rule: t.rule, p_value: t.p, q_value: r4(q) });
    }
    byMeasure.set(t.measure.id, entry);
  });

  const pool: CandidateRef[] = [];
  const goodNews: CandidateRef[] = [];
  const unremarkable: CheckedMeasure[] = [];
  for (const m of sheet.measures) {
    const e = byMeasure.get(m.id);
    if (!e) {
      if (!m.estimated && m.current.value != null) notChecked.push({ measure_id: m.id, label: m.label, why: (skipped.get(m.id) ?? []).join('; ') });
      continue;
    }
    const ref: CandidateRef = { measure_id: m.id, label: m.label, area: m.area, reasons: e.reasons, also_tested: e.quiet };
    if (e.reasons.some((r) => r.verdict === 'worse')) pool.push(ref);
    else if (e.reasons.length) goodNews.push(ref);
    else unremarkable.push({ measure_id: m.id, label: m.label, tests: e.quiet });
  }

  // The round's result is explained by the parts: scoring average and strokes gained total stand as candidates only when no part does.
  const levelOf = (id: string) => sheet.measures.find((m) => m.id === id)!.level;
  const parts = pool.filter((c) => levelOf(c.measure_id) !== 'outcome');
  const outcomes = pool.filter((c) => levelOf(c.measure_id) === 'outcome');
  const contenders = (parts.length ? parts : outcomes).sort(byStake);

  // One candidate per area: two measures of the same area are two views of one problem.
  const leaders: Array<CandidateRef & { supporting: CandidateRef[] }> = [];
  for (const c of contenders) {
    const lead = leaders.find((l) => l.area === c.area);
    if (lead) lead.supporting.push(c);
    else leaders.push({ ...c, supporting: [] });
  }

  const measureOf = (id: string) => sheet.measures.find((m) => m.id === id)!;
  const candidates = leaders.slice(0, MAX_CANDIDATES).map(
    (l, i): Candidate => ({
      ...l,
      rank: i + 1,
      strokes_at_stake: leadStake(l.reasons),
      questions: questionsFor(measureOf(l.measure_id), l.reasons.filter((r) => r.verdict === 'worse').map((r) => r.rule)),
    }),
  );

  return {
    player_id: sheet.player_id,
    as_of: sheet.as_of,
    candidates,
    good_news: goodNews.sort(byGain),
    unremarkable,
    not_checked: notChecked,
    beyond_cap: leaders.slice(MAX_CANDIDATES).map(({ supporting: _s, ...ref }) => ref),
    outcome_context: parts.length ? outcomes.sort(byStake) : [],
    tests: { run: tested.length, alpha: ALPHA, false_discovery_rate: FALSE_DISCOVERY_RATE, supported },
  };
}
