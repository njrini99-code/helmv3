/**
 * Fixtures for the analyst tests: a team of made-up players (ids only, no names) whose rounds, cache rows, holes and
 * shots are built from a short spec, so a test states the numbers it is about and nothing else.
 */
import type { TeamRows } from '../fact-sheet';
import type { AnalystSources, HoleRow, RoundCacheRow, RoundRow, ShotRow, TourStandardRow } from '../sources';

export const TEAM_ID = '11111111-1111-4111-8111-111111111111';
/** The run's moment in every test: 10 November 2026, mid-day UTC. The season started 1 August 2026. */
export const NOW = new Date('2026-11-10T17:00:00Z');

/** Par 72: four par 3s, ten par 4s, four par 5s. */
export const PAR_LAYOUT = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5] as const;

export interface Legs {
  tee: number;
  approach: number;
  around: number;
  putting: number;
}

export interface RoundSpec {
  date: string;
  /** Default 'tournament'. */
  type?: string | null;
  /** Default 74. */
  score?: number;
  /** Stored strokes gained; the total is the four added up. Null: none stored. Default: -1 in each area. */
  sg?: Legs | null;
  /** Shots logged (strokes gained measured)? Default true. False: no shot rows at all (strokes gained is the estimate). */
  shots?: boolean;
  /** [feet, made] */
  putts?: ReadonlyArray<readonly [number, boolean]>;
  /** [yards before, feet after, on the green] */
  approaches?: ReadonlyArray<readonly [number, number, boolean]>;
  cache?: Partial<RoundCacheRow>;
  /** Hole 1's score against par. Default 0. */
  holeOne?: number;
  /** Posted as a total with no holes. */
  totalOnly?: boolean;
}

/** `days` before {@link NOW}, as YYYY-MM-DD. */
export function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

function holeScores(score: number, holeOne: number): number[] {
  const scores = PAR_LAYOUT.map((p) => p as number);
  scores[0] = PAR_LAYOUT[0] + holeOne;
  let left = score - 72 - holeOne;
  // Spread what is left over holes 2 to 18, one stroke at a time.
  for (let i = 1; left !== 0; i = i === 17 ? 1 : i + 1) {
    const step = left > 0 ? 1 : -1;
    scores[i] = scores[i]! + step;
    left -= step;
  }
  return scores;
}

export const PGA_STANDARDS: TourStandardRow[] = [
  { metric_id: 'gir_pct', value: 66, source: 'PGA Tour 2024' },
  { metric_id: 'putts_made_3_5ft_pct', value: 90.5, source: 'PGA Tour ShotLink 2024' },
  { metric_id: 'putts_made_5_10ft_pct', value: 62.2, source: 'PGA Tour ShotLink 2024' },
  { metric_id: 'putts_made_10_15ft_pct', value: 35.7, source: 'PGA Tour ShotLink 2024' },
  { metric_id: 'putts_made_15_25ft_pct', value: 15.4, source: 'PGA Tour ShotLink 2024' },
  { metric_id: 'putts_made_25_plus_ft_pct', value: 5.5, source: 'PGA Tour ShotLink 2024' },
  { metric_id: 'approach_proximity_50_125ft', value: 18, source: 'PGA Tour 2024' },
  { metric_id: 'approach_proximity_125_175ft', value: 30, source: 'PGA Tour 2024' },
  { metric_id: 'approach_proximity_175_plus_ft', value: 45, source: 'PGA Tour 2024' },
  { metric_id: 'scrambling_pct_sand', value: 50, source: 'PGA Tour 2024' },
  { metric_id: 'penalty_rate_per_round', value: 0.3, source: 'Tour low (~0.3/round). Research doc' },
  { metric_id: 'big_number_rate', value: 2, source: 'Tour ~2% per Research doc' },
  { metric_id: 'scoring_par_3', value: 3.0, source: 'PGA Tour 2024' },
  { metric_id: 'scoring_par_4', value: 3.97, source: 'PGA Tour 2024' },
  { metric_id: 'scoring_par_5', value: 4.55, source: 'PGA Tour 2024' },
  { metric_id: 'practice_tournament_delta', value: 0.5, source: 'Tour gap small but measurable' },
  { metric_id: 'opening_hole_delta', value: 0.1, source: 'Research doc: ~0.1-0.15' },
];

export const LPGA_STANDARDS: TourStandardRow[] = [
  { metric_id: 'gir_pct', value: 70, source: 'LPGA.com 2024' },
  { metric_id: 'putts_made_5_10ft_pct', value: 55, source: 'LPGA ShotLink 2024' },
  { metric_id: 'approach_proximity_125_175ft', value: 38, source: 'LPGA.com 2024' },
];

export class TeamFixture {
  readonly rounds: RoundRow[] = [];
  readonly cache: RoundCacheRow[] = [];
  readonly holes: HoleRow[] = [];
  readonly shots: ShotRow[] = [];
  readonly playerIds: string[] = [];
  /** What the sources were asked for, so a test can see that nothing but reads happened. */
  readonly calls: string[] = [];

  constructor(readonly opts: { gender?: string; timezone?: string; standards?: TourStandardRow[] } = {}) {}

  /** Adds a player and their rounds (any order). Round ids are `<player>-<n>` in the order given. */
  player(id: string, specs: readonly RoundSpec[]): this {
    this.playerIds.push(id);
    specs.forEach((spec, i) => this.round(id, `${id}-${String(i).padStart(2, '0')}`, spec));
    return this;
  }

  private round(playerId: string, id: string, spec: RoundSpec): void {
    const score = spec.score ?? 74;
    const scores = holeScores(score, spec.holeOne ?? 0);
    const sg = spec.sg === undefined ? { tee: -1, approach: -1, around: -1, putting: -1 } : spec.sg;
    const count = (test: (d: number) => boolean) => scores.filter((s, i) => test(s - PAR_LAYOUT[i]!)).length;
    const cache: RoundCacheRow = {
      round_id: id,
      greens_hit: 9,
      greens_total: 18,
      fairways_hit: 7,
      fairways_total: 14,
      total_putts: 31,
      scramble_attempts: 9,
      scrambles_converted: 4,
      sand_attempts: 2,
      sand_saves: 1,
      three_putts: 1,
      penalty_strokes: 1,
      eagles: count((d) => d <= -2),
      birdies: count((d) => d === -1),
      pars: count((d) => d === 0),
      bogeys: count((d) => d === 1),
      double_bogeys: count((d) => d === 2),
      triple_plus: count((d) => d >= 3),
      ...spec.cache,
    };
    const front = scores.slice(0, 9).reduce((a, b) => a + b, 0);
    this.rounds.push({
      id,
      player_id: playerId,
      round_date: spec.date,
      round_type: spec.type === undefined ? 'tournament' : spec.type,
      total_score: score,
      score_to_par: score - 72,
      front_nine: spec.totalOnly ? null : front,
      back_nine: spec.totalOnly ? null : score - front,
      holes_played: 18,
      total_putts: spec.totalOnly ? null : cache.total_putts,
      strokes_gained_total: sg ? sg.tee + sg.approach + sg.around + sg.putting : null,
      strokes_gained_tee: sg?.tee ?? null,
      strokes_gained_approach: sg?.approach ?? null,
      strokes_gained_around_green: sg?.around ?? null,
      strokes_gained_putting: sg?.putting ?? null,
    });
    if (spec.totalOnly) return;
    this.cache.push(cache);
    scores.forEach((s, i) => this.holes.push({ id: `${id}-h${i + 1}`, round_id: id, hole_number: i + 1, par: PAR_LAYOUT[i]!, score: s }));
    if (spec.shots === false) return;
    const shot = (s: Partial<ShotRow>): ShotRow => ({
      id: `${id}-s${String(this.shots.length).padStart(6, '0')}`,
      round_id: id,
      hole_id: `${id}-h1`,
      shot_type: null,
      lie_before: null,
      distance_to_hole_before: null,
      distance_unit_before: null,
      distance_to_hole_after: null,
      distance_unit_after: null,
      result: null,
      lie_after: null,
      putt_made: null,
      ...s,
    });
    // One usable tee shot, so the round's strokes gained counts as measured.
    this.shots.push(shot({ shot_type: 'tee', lie_before: 'tee', distance_to_hole_before: 400, distance_unit_before: 'yards', distance_to_hole_after: 150, distance_unit_after: 'yards', result: 'fairway', lie_after: 'fairway' }));
    for (const [feet, made] of spec.putts ?? []) {
      this.shots.push(shot({ shot_type: 'putting', lie_before: 'green', distance_to_hole_before: feet, distance_unit_before: 'feet', distance_to_hole_after: made ? 0 : 2, distance_unit_after: 'feet', result: made ? 'hole' : 'green', lie_after: 'green', putt_made: made }));
    }
    for (const [yards, leave, green] of spec.approaches ?? []) {
      this.shots.push(shot({ shot_type: 'approach', lie_before: 'fairway', distance_to_hole_before: yards, distance_unit_before: 'yards', distance_to_hole_after: leave, distance_unit_after: 'feet', result: green ? 'green' : 'rough', lie_after: green ? 'green' : 'rough' }));
    }
  }

  get standards(): TourStandardRow[] {
    return this.opts.standards ?? (this.opts.gender === 'womens' ? LPGA_STANDARDS : PGA_STANDARDS);
  }

  /** The rows the pure builder takes. */
  rows(now: Date = NOW): TeamRows {
    return {
      team: { id: TEAM_ID, gender: this.opts.gender ?? 'mens', timezone: this.opts.timezone ?? 'America/New_York' },
      playerIds: this.playerIds,
      rounds: this.rounds,
      roundCache: this.cache,
      holes: this.holes,
      shots: this.shots,
      tourStandards: this.standards,
      now,
    };
  }

  /** The same rows behind the loader interface, the way a database would answer. */
  sources(): AnalystSources {
    const has = (ids: readonly string[]) => new Set(ids);
    return {
      team: async (teamId) => {
        this.calls.push('team');
        return teamId === TEAM_ID ? this.rows().team : null;
      },
      activePlayerIds: async () => {
        this.calls.push('activePlayerIds');
        return [...this.playerIds];
      },
      rounds: async (playerIds, since) => {
        this.calls.push('rounds');
        const ids = has(playerIds);
        return this.rounds.filter((r) => ids.has(r.player_id) && r.round_date >= since);
      },
      roundCache: async (roundIds) => {
        this.calls.push('roundCache');
        const ids = has(roundIds);
        return this.cache.filter((r) => ids.has(r.round_id));
      },
      holes: async (roundIds) => {
        this.calls.push('holes');
        const ids = has(roundIds);
        return this.holes.filter((r) => ids.has(r.round_id));
      },
      shots: async (roundIds) => {
        this.calls.push('shots');
        const ids = has(roundIds);
        return this.shots.filter((r) => ids.has(r.round_id));
      },
      tourStandards: async () => {
        this.calls.push('tourStandards');
        return this.standards;
      },
    };
  }
}

/** Zero-sum patterns over ten rounds, so a mean is exactly the number a test names. Each has a different shape. */
export const PATTERNS = {
  a: [0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, -0.5, 0, 0],
  b: [-0.4, 0.4, 0.4, -0.4, 0, 0, -0.4, 0.4, 0, 0],
  c: [0.3, 0.3, -0.3, -0.3, 0.3, -0.3, 0, 0, 0.3, -0.3],
  d: [0, 0.6, -0.6, 0, 0.2, -0.2, 0, 0.4, -0.4, 0],
} as const;

/** Ten rounds, 5 days apart starting `firstDaysAgo` days back, each area at its mean plus its own zero-sum pattern. */
export function tenRounds(firstDaysAgo: number, means: Legs, extra: (i: number) => Partial<RoundSpec> = () => ({})): RoundSpec[] {
  return Array.from({ length: 10 }, (_, i) => ({
    date: daysAgo(firstDaysAgo + i * 5),
    sg: {
      tee: means.tee + PATTERNS.a[i]!,
      approach: means.approach + PATTERNS.b[i]!,
      around: means.around + PATTERNS.c[i]!,
      putting: means.putting + PATTERNS.d[i]!,
    },
    ...extra(i),
  }));
}

export const EVEN: Legs = { tee: -1, approach: -1, around: -1, putting: -1 };

/** A small deterministic generator (mulberry32), for the fixtures that need ordinary round-to-round noise. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standard normal draw (Box-Muller) from a uniform generator. */
export function normal(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
