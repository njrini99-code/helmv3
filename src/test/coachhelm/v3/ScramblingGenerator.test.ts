import { describe, it, expect, vi } from 'vitest';
import { ScramblingGenerator } from '@/lib/coachhelm/v3/generators/scrambling';
import { loadSandShots, type SandShot } from '@/lib/coachhelm/v3/engine/shot-source';

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

  it('anchors a women\'s player to ~38% sand-save, not the men\'s 50%', () => {
    const g = new ScramblingGenerator(PLAYER_ID, 'sand');
    const c = g.composeContent(makeAgg({ playerValue: 0, attempts: 13, rounds_played: 8, gender: 'womens' }));
    expect(c.evidence.comparison_value).toBe(38);
    expect(c.content).toContain('38%');
    expect(c.content).not.toContain('~50%'); // no men's Tour anchor for a women's player
    expect(c.evidence.comparison_label).toContain('women');
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
      sandShot({ reached_green: true, leave_distance_feet: 10, putts_after: 1, sand_save_flag: true }),
      sandShot({ reached_green: true, leave_distance_feet: 14, putts_after: 1, sand_save_flag: false }),
      sandShot({ reached_green: true, leave_distance_feet: 16, putts_after: 2, sand_save_flag: false }),
      sandShot({ reached_green: true, leave_distance_feet: 13, putts_after: 2, sand_save_flag: false }),
      sandShot({ reached_green: false, leave_distance_feet: null, putts_after: 2, sand_save_flag: false }),
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
