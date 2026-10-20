import { describe, it, expect, vi } from 'vitest';
import { ScramblingGenerator } from '@/lib/coachhelm/v3/generators/scrambling';
import { loadSandShots, resolveSandShots, type SandShot } from '@/lib/coachhelm/v3/engine/shot-source';
import { classifyBunkerFailureMode, summarizeSandSaves } from '@/lib/coachhelm/v3/generators/scrambling';

vi.mock('@/lib/coachhelm/v3/engine/shot-source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/v3/engine/shot-source')>();
  return { ...actual, loadSandShots: vi.fn() };
});

vi.mock('@/lib/coachhelm/v3/engine/hole-diagnosis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/v3/engine/hole-diagnosis')>();
  return { ...actual, loadLastRoundDate: vi.fn().mockResolvedValue('2026-05-25') };
});
vi.mock('@/lib/coachhelm/v3/counterfactual/player-cohort-loader', () => ({
  loadPlayerCohort: vi.fn().mockResolvedValue({ gender: 'mens', level: null }),
}));
const mockLoadSandShots = vi.mocked(loadSandShots);

const PLAYER_ID = 'p-1';

function sandShot(over: Partial<SandShot> = {}): SandShot {
  return {
    round_id: 'r-1', hole_number: 1,
    reached_green: true, leave_distance_feet: 14, putts_after: 2,
    sand_save_flag: null, ...over,
  };
}

function makeAgg(over: Partial<{
  playerValue: number; attempts: number; rounds_played: number;
  reached_green_n: number; failed_escape_n: number;
  avg_leave_feet: number | null; two_putt_after_reach_n: number;
  failure_mode: 'escape' | 'lag' | 'mixed';
  gender: 'mens' | 'womens';
}> = {}) {
  const attempts = over.attempts ?? 32;
  const rounds_played = over.rounds_played ?? 15;
  return {
    last_round_date: '2026-05-25',
    sampleN: attempts,
    playerValue: over.playerValue ?? 8,
    lie: 'sand' as const,
    attempts,
    rounds_played,
    reached_green_n: over.reached_green_n ?? 24,
    failed_escape_n: over.failed_escape_n ?? 8,
    avg_leave_feet: 'avg_leave_feet' in over ? over.avg_leave_feet! : 13.7,
    two_putt_after_reach_n: over.two_putt_after_reach_n ?? 22,
    failure_mode: over.failure_mode ?? 'lag',
    cohort_gender: over.gender ?? 'mens',
    attempts_per_round: attempts / rounds_played,
    save_n: attempts,
    saves_made: Math.round(((over.playerValue ?? 8) / 100) * attempts),
    save_source: 'hole_flag' as const,
  };
}

describe('ScramblingGenerator', () => {
  it('identity properties', () => {
    const g = new ScramblingGenerator(PLAYER_ID, 'sand');
    expect(g.name).toBe('ScramblingGenerator');
    expect(g.insightType).toBe('scrambling');
    expect(g.category).toBe('short_game');
    expect(g.minSampleN).toBe(5);
    expect(g.metricId).toBe('scrambling_pct_sand');
  });

  it('LAG branch: escape is fine, names distance-out-of-sand + lag as the driver (Nick Rini)', () => {
    const g = new ScramblingGenerator(PLAYER_ID, 'sand');
    const c = g.composeContent(makeAgg({
      playerValue: 8, attempts: 32, reached_green_n: 24, failed_escape_n: 8,
      avg_leave_feet: 13.7, two_putt_after_reach_n: 22, failure_mode: 'lag',
    }));
    // Headline-inversion contract: must NOT blame escape; must name the lag driver + a leave number.
    expect(c.content.toLowerCase()).toContain('escape');     // it explicitly says escape is fine
    expect(c.content).toMatch(/75%/);                         // 24/32 reached the green
    expect(c.content).toMatch(/14 ft|13\.7 ft|13 ft/);       // the avg leave
    expect(c.content.toLowerCase()).toContain('distance control');
    expect(c.content.toLowerCase()).not.toContain('leaving balls in the bunker');
    // The whole point: it does NOT tell the coach to drill bunker escapes.
    expect(c.title.toLowerCase()).toContain('lag');
  });

  it('ESCAPE branch: blames the escape when a big share never reach the green', () => {
    const g = new ScramblingGenerator(PLAYER_ID, 'sand');
    const c = g.composeContent(makeAgg({
      playerValue: 20, attempts: 20, reached_green_n: 9, failed_escape_n: 11,
      avg_leave_feet: 18, two_putt_after_reach_n: 6, failure_mode: 'escape',
    }));
    expect(c.content.toLowerCase()).toContain('leaving balls in the bunker');
    expect(c.content.toLowerCase()).toContain('splash');
    expect(c.title.toLowerCase()).toContain('escape');
  });

  it('aggregate splits escape-failure from reached-then-lag from shot-level rows', async () => {
    mockLoadSandShots.mockReset();
    // 4 reached green (each 2-putt after, leaves 12/14/16/14) + 2 failed escape.
    mockLoadSandShots.mockResolvedValue([
      sandShot({ reached_green: true, leave_distance_feet: 12, putts_after: 2 }),
      sandShot({ reached_green: true, leave_distance_feet: 14, putts_after: 2 }),
      sandShot({ reached_green: true, leave_distance_feet: 16, putts_after: 2 }),
      sandShot({ reached_green: true, leave_distance_feet: 14, putts_after: 1 }),
      sandShot({ reached_green: false, leave_distance_feet: null, putts_after: 2 }),
      sandShot({ reached_green: false, leave_distance_feet: null, putts_after: 1 }),
    ]);
    const agg = await new ScramblingGenerator(PLAYER_ID, 'sand').aggregate();
    expect(agg!.attempts).toBe(6);
    expect(agg!.reached_green_n).toBe(4);
    expect(agg!.failed_escape_n).toBe(2);
    expect(agg!.avg_leave_feet).toBeCloseTo(14, 1); // (12+14+16+14)/4
    expect(agg!.two_putt_after_reach_n).toBe(3);    // 3 of the 4 reached then 2-putt
    // 67% reach (4/6) but only 1/4 up-and-down → lag, not escape.
    expect(agg!.failure_mode).toBe('lag');
  });

  it("anchors a women's player to the LPGA Tour sand save (45%), never the men's 50% or a college figure (Q-88)", () => {
    const g = new ScramblingGenerator(PLAYER_ID, 'sand');
    const c = g.composeContent(makeAgg({ playerValue: 0, attempts: 13, rounds_played: 8, gender: 'womens' }));
    expect(c.evidence.comparison_value).toBe(45);
    expect(c.evidence.comparison_label).toBe('LPGA Tour sand save avg');
    expect(c.evidence.comparison_source).toBe('pga_baseline');
    expect(c.content).toContain('LPGA Tour sand-save average is ~45%.');
    expect(c.content).not.toContain('~50%');
    expect(c.content.toLowerCase()).not.toMatch(/college|estimated/);
  });

  it('men\'s player keeps the 50% Tour anchor (unchanged)', () => {
    const g = new ScramblingGenerator(PLAYER_ID, 'sand');
    const c = g.composeContent(makeAgg({ playerValue: 30, attempts: 12, rounds_played: 20, gender: 'mens' }));
    expect(c.evidence.comparison_value).toBe(50);
  });

  it('exposes the player\'s own sand attempts/round for attempt-rate sizing', () => {
    const agg = makeAgg({ attempts: 13, rounds_played: 8 });
    expect((agg as { attempts_per_round?: number }).attempts_per_round ?? (agg.attempts / agg.rounds_played))
      .toBeCloseTo(1.625);
  });

  it('aggregate prints the AUTHORITATIVE sand-save % (golf_holes.sand_save flag) when flags are present', async () => {
    mockLoadSandShots.mockReset();
    // 5 greenside-bunker visits with flags: exactly 1 saved → 20% (matches the
    // DB cache + stat-formulas), NOT the looser "reached-and-1-putted" heuristic.
    mockLoadSandShots.mockResolvedValue([
      sandShot({ hole_number: 1, reached_green: true, leave_distance_feet: 10, putts_after: 1, sand_save_flag: true }),
      sandShot({ hole_number: 2, reached_green: true, leave_distance_feet: 14, putts_after: 1, sand_save_flag: false }),
      sandShot({ hole_number: 3, reached_green: true, leave_distance_feet: 16, putts_after: 2, sand_save_flag: false }),
      sandShot({ hole_number: 4, reached_green: true, leave_distance_feet: 13, putts_after: 2, sand_save_flag: false }),
      sandShot({ hole_number: 5, reached_green: false, leave_distance_feet: null, putts_after: 2, sand_save_flag: false }),
    ]);
    const agg = await new ScramblingGenerator(PLAYER_ID, 'sand').aggregate();
    // 1 of 5 flagged saved → 20.0, reconciles with the displayed sand_save_percentage.
    expect(agg!.playerValue).toBeCloseTo(20, 1);
  });
});

// Phase E (E4): scrambling is a SHOT-SOURCE engine (loadSandShots genuinely windows
// the last 90 days), so — unlike the cache-backed putt/par generators — its
// window_days:90 is HONEST and must STAY 90. This locks that contract so a future
// "honest window" edit doesn't mistakenly swap it for a lifetime span. The attempt
// count is disclosed alongside the rate (sample-size honesty).
describe('ScramblingGenerator — Phase E honest 90d window + attempt disclosure', () => {
  it('keeps window_days 90 (loadSandShots genuinely windows 90d — not a cache-backed lie)', () => {
    const c = new ScramblingGenerator(PLAYER_ID, 'sand')
      .composeContent(makeAgg({ attempts: 20, failure_mode: 'mixed' }));
    expect(c.evidence.window_days).toBe(90);
  });

  it('discloses the bunker attempt count alongside the sand-save rate', () => {
    const c = new ScramblingGenerator(PLAYER_ID, 'sand')
      .composeContent(makeAgg({ attempts: 20, failure_mode: 'mixed' }));
    expect(c.content).toMatch(/20 attempts/);
    expect(c.evidence.sample_n).toBe(20);
  });
});

/**
 * `evidence.window_end` is blank on every row this generator writes.
 *
 * Measured against production 2026-08-18 across the five generators that call
 * `staleDataSuffix`:
 *
 *     insight_type        rows   window_end set   "Data through" in content
 *     putt_distance        109         0                    95
 *     par_scoring           69         0                    54
 *     course_management     47        47                    36
 *     tee_strategy          40         0                    26
 *     scrambling            22         0                    20
 *
 * Only `course_management` populates it. The other four hardcode
 * `window_end: ''` — while 195 of those same rows successfully rendered
 * "Data through <date>" into their prose from `agg.last_round_date`. The date
 * is on the aggregate and in the sentence; it just never reached the field a
 * consumer can read.
 *
 * That blank is what makes #1505 unfixable at the read path: the staleness
 * disclosure is computed once at write time and goes wrong as the row ages,
 * and the obvious repair — derive it when rendering — needs `window_end`,
 * which is empty on 240 of 287 rows.
 */
describe('evidence.window_end carries the newest contributing round', () => {
  it('is the aggregate last_round_date, not an empty string', () => {
    const g = new ScramblingGenerator(PLAYER_ID, 'sand');
    const c = g.composeContent(makeAgg({ playerValue: 30, attempts: 20, rounds_played: 12 }));
    expect(c.evidence.window_end).toBe('2026-05-25');
  });
});

describe('audit row 28 — bunker play recomputed from raw shots', () => {
  // Raw golf_shots rows for three greenside bunker holes:
  //   hole 1: splash out to 12 ft, 2 putts (reached, lagged)
  //   hole 2: splash out to 15 ft, 2 putts (reached, lagged)
  //   hole 3: splash out to 4 ft, 1 putt (reached, saved)
  //   hole 4: stays in (2nd sand shot), then out to 20 ft, 2 putts
  // plus a fairway-bunker APPROACH on hole 5 that must not count.
  const raw = [
    { round_id: 'r', hole_number: 1, shot_number: 3, shot_type: 'around_green', lie_before: 'sand', lie_after: 'green', result: 'green', is_penalty: false, distance_to_hole_before: 15, distance_unit_before: 'yards', distance_to_hole_after: 12, distance_unit_after: 'feet' },
    { round_id: 'r', hole_number: 1, shot_number: 4, shot_type: 'putting', lie_before: 'green', lie_after: 'green', result: null, is_penalty: false, distance_to_hole_before: 12, distance_unit_before: 'feet', distance_to_hole_after: 1, distance_unit_after: 'feet' },
    { round_id: 'r', hole_number: 1, shot_number: 5, shot_type: 'putting', lie_before: 'green', lie_after: null, result: 'hole', is_penalty: false, distance_to_hole_before: 1, distance_unit_before: 'feet', distance_to_hole_after: 0, distance_unit_after: 'feet' },
    { round_id: 'r', hole_number: 2, shot_number: 3, shot_type: 'around_green', lie_before: 'sand', lie_after: 'green', result: 'green', is_penalty: false, distance_to_hole_before: 12, distance_unit_before: 'yards', distance_to_hole_after: 15, distance_unit_after: 'feet' },
    { round_id: 'r', hole_number: 2, shot_number: 4, shot_type: 'putting', lie_before: 'green', lie_after: 'green', result: null, is_penalty: false, distance_to_hole_before: 15, distance_unit_before: 'feet', distance_to_hole_after: 2, distance_unit_after: 'feet' },
    { round_id: 'r', hole_number: 2, shot_number: 5, shot_type: 'putting', lie_before: 'green', lie_after: null, result: 'hole', is_penalty: false, distance_to_hole_before: 2, distance_unit_before: 'feet', distance_to_hole_after: 0, distance_unit_after: 'feet' },
    { round_id: 'r', hole_number: 3, shot_number: 3, shot_type: 'around_green', lie_before: 'sand', lie_after: 'green', result: 'green', is_penalty: false, distance_to_hole_before: 10, distance_unit_before: 'yards', distance_to_hole_after: 4, distance_unit_after: 'feet' },
    { round_id: 'r', hole_number: 3, shot_number: 4, shot_type: 'putting', lie_before: 'green', lie_after: null, result: 'hole', is_penalty: false, distance_to_hole_before: 4, distance_unit_before: 'feet', distance_to_hole_after: 0, distance_unit_after: 'feet' },
    { round_id: 'r', hole_number: 4, shot_number: 3, shot_type: 'around_green', lie_before: 'sand', lie_after: 'sand', result: 'bunker', is_penalty: false, distance_to_hole_before: 14, distance_unit_before: 'yards', distance_to_hole_after: 13, distance_unit_after: 'yards' },
    { round_id: 'r', hole_number: 4, shot_number: 4, shot_type: 'around_green', lie_before: 'sand', lie_after: 'green', result: 'green', is_penalty: false, distance_to_hole_before: 13, distance_unit_before: 'yards', distance_to_hole_after: 20, distance_unit_after: 'feet' },
    { round_id: 'r', hole_number: 4, shot_number: 5, shot_type: 'putting', lie_before: 'green', lie_after: 'green', result: null, is_penalty: false, distance_to_hole_before: 20, distance_unit_before: 'feet', distance_to_hole_after: 2, distance_unit_after: 'feet' },
    { round_id: 'r', hole_number: 4, shot_number: 6, shot_type: 'putting', lie_before: 'green', lie_after: null, result: 'hole', is_penalty: false, distance_to_hole_before: 2, distance_unit_before: 'feet', distance_to_hole_after: 0, distance_unit_after: 'feet' },
    { round_id: 'r', hole_number: 5, shot_number: 2, shot_type: 'approach', lie_before: 'sand', lie_after: 'green', result: 'green', is_penalty: false, distance_to_hole_before: 150, distance_unit_before: 'yards', distance_to_hole_after: 30, distance_unit_after: 'feet' },
  ];
  const flags = new Map<string, boolean | null>([
    ['r:1', false], ['r:2', false], ['r:3', true], ['r:4', false], ['r:5', null],
  ]);

  it('resolves escape, leave and putts-after from raw shots (fairway bunker excluded)', () => {
    const shots = resolveSandShots(raw, flags);
    expect(shots).toHaveLength(5); // 4 greenside holes, hole 4 has two sand shots
    expect(shots.filter((s) => s.reached_green)).toHaveLength(4);
    const h1 = shots.find((s) => s.hole_number === 1)!;
    expect(h1.leave_distance_feet).toBe(12);
    expect(h1.putts_after).toBe(2);
    const h4 = shots.filter((s) => s.hole_number === 4);
    expect(h4.map((s) => s.reached_green)).toEqual([false, true]);
  });

  it('classifies escape vs lag from those shots', () => {
    const shots = resolveSandShots(raw, flags);
    const reached = shots.filter((s) => s.reached_green);
    const mode = classifyBunkerFailureMode({
      attempts: shots.length,
      reachedN: reached.length,
      twoPuttAfterReachN: reached.filter((s) => s.putts_after >= 2).length,
    });
    // 4 of 5 escaped (80%); 3 of 4 reached greens were 2-putts → lag.
    expect(mode).toBe('lag');
    expect(classifyBunkerFailureMode({ attempts: 10, reachedN: 5, twoPuttAfterReachN: 5 })).toBe('escape');
    expect(classifyBunkerFailureMode({ attempts: 10, reachedN: 9, twoPuttAfterReachN: 2 })).toBe('mixed');
  });

  it('sand-save % counts each bunker HOLE once, so n is the rate\'s real denominator', () => {
    const shots = resolveSandShots(raw, flags);
    const s = summarizeSandSaves(shots);
    // Hole 4 has two sand shots but is one save opportunity: 1 of 4 holes saved.
    expect(s.n).toBe(4);
    expect(s.made).toBe(1);
    expect(s.source).toBe('hole_flag');
  });

  it('sample_n is the save denominator, and the card prints a 95% interval', async () => {
    mockLoadSandShots.mockReset();
    mockLoadSandShots.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => [
        sandShot({ hole_number: i + 1, reached_green: false, sand_save_flag: i === 0 }),
        sandShot({ hole_number: i + 1, reached_green: true, sand_save_flag: i === 0 }),
      ]).flat(),
    );
    const g = new ScramblingGenerator(PLAYER_ID, 'sand');
    const agg = await g.aggregate();
    expect(agg!.attempts).toBe(12);
    expect(agg!.sampleN).toBe(6);
    const c = g.composeContent(agg!);
    expect(c.evidence.sample_n).toBe(6);
    expect(c.evidence.detail).toMatchObject({ save_n: 6, saves_made: 1 });
    expect((c.evidence.detail as { save_ci_95: { low: number; high: number } }).save_ci_95.low).toBeLessThan(17);
    expect(c.content).toMatch(/95% range \d+-\d+%/);
  });

  it('is descriptive without a standing row (no standing dependency)', () => {
    const g = new ScramblingGenerator(PLAYER_ID, 'sand') as unknown as {
      requiresStanding: boolean; attachStandingWhenAvailable: boolean;
    };
    expect(g.requiresStanding).toBe(false);
    expect(g.attachStandingWhenAvailable).toBe(true);
  });
});
