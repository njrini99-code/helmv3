/**
 * Number-parity contract (spec-player-analysis §5, FP-06; design-direction
 * §5.2 "one metric, one number", DS-11).
 *
 * One fixture player whose history holds a hole-missing partial round and the
 * implausible 37-stroke "18-hole" round (the Sep 17 2026 prod round). The
 * contract:
 *   - the partial and implausible rounds change no number on any surface;
 *   - every surface that prints a metric prints the same string for the same
 *     value (formatMetric), and the surfaces that aggregate read the same
 *     countable-round helper;
 *   - no player-analysis surface prints a legacy 15–20 ft / 20+ ft band.
 *
 * Cross-surface assertions that are still false in the code are `it.todo`,
 * each naming its ledger row and owning workstream, so the gap is visible in
 * the test report rather than faked green. When the owner lands the fix,
 * turn the todo into an assertion here.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  aggregateCountableRounds,
  type CountableRoundRow,
  type RoundStatsCacheRow,
} from '@/lib/golf/countable-round-stats';
import { filterCountableRounds, roundExclusionReason } from '@/lib/golf/round-countable';
import { withCanonicalRoundTotal } from '@/lib/golf/round-total';
import { computeCompositeRating } from '@/lib/coachhelm/composite-rating';
import { formatMetric, formatMetricText } from '@/lib/golf/metrics/display-registry';
import { computeFormScore } from '@/lib/golf/form-score';
import { computePressureGap } from '@/lib/golf/metrics/pressure-gap';
import pressureDelta from '@/lib/coachhelm/v3/genome/dimensions/pressure-delta';
import {
  buildPlayerDetailModel,
  type PlayerDetailInputs,
  type RawRound,
} from '@/components/fairway/pages/player-detail/buildPlayerDetailModel';

const ROOT = resolve(__dirname, '../../..');

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const PAR = 72;

function round(
  id: string,
  date: string,
  front: number | null,
  back: number | null,
  extra: Partial<RawRound> = {},
): RawRound {
  const holes = extra.holes_played ?? 18;
  const total = front != null && back != null ? front + back : front ?? back;
  const par = holes === 9 ? 36 : PAR;
  return {
    id,
    round_date: date,
    status: 'completed',
    holes_played: holes,
    total_score: total,
    front_nine: front,
    back_nine: back,
    total_putts: 31,
    course_name: 'Fixture National',
    score_to_par: total == null ? null : total - par,
    round_type: 'practice',
    ...extra,
  };
}

function stats(id: string, sgTotal: number, overrides: Partial<RoundStatsCacheRow> = {}): RoundStatsCacheRow {
  return {
    round_id: id,
    birdies: 3,
    eagles: 0,
    total_putts: 31,
    three_putts: 1,
    fairways_hit: 8,
    fairways_total: 14,
    greens_hit: 10,
    greens_total: 18,
    scramble_attempts: 8,
    scrambles_converted: 4,
    strokes_gained_total: sgTotal,
    strokes_gained_tee: sgTotal / 4,
    strokes_gained_approach: sgTotal / 4,
    strokes_gained_around_green: sgTotal / 4,
    strokes_gained_putting: sgTotal / 4,
    ...overrides,
  };
}

/** Countable rounds, newest first: eleven 18-hole rounds and one 9-hole. */
const CLEAN: RawRound[] = [
  round('r03', '2026-09-12', 37, 38, { round_type: 'tournament' }),
  round('r04', '2026-09-08', 36, 36),
  round('r05', '2026-09-01', 38, 39, { round_type: 'qualifier' }),
  round('r06', '2026-08-25', 35, 37),
  round('r07', '2026-08-18', 36, 38, { round_type: 'tournament' }),
  round('r08', '2026-08-15', 38, null, { holes_played: 9, total_putts: 15 }),
  round('r09', '2026-08-11', 37, 37),
  round('r10', '2026-08-04', 39, 38, { round_type: 'tournament' }),
  round('r11', '2026-07-28', 36, 37),
  round('r12', '2026-07-21', 38, 38),
  round('r13', '2026-07-14', 37, 36, { round_type: 'qualifier' }),
  round('r14', '2025-10-02', 40, 39),
];

/** 37 strokes over 18 holes, 18 putts, SG +34.51. */
const IMPLAUSIBLE = round('r01-implausible', '2026-09-17', 18, 19, { total_putts: 18, round_type: 'tournament' });
/*
 * Declared 18, only the front nine scored, but a full-looking total_score
 * was saved, so it passes every plausibility check and only the hole rule
 * catches it.
 */
const PARTIAL = round('r02-partial', '2026-09-15', 36, null, {
  round_type: 'tournament',
  total_score: 84,
  score_to_par: 12,
});

/** The rounds that must change nothing. */
const NOISE: RawRound[] = [IMPLAUSIBLE, PARTIAL];

const ALL: RawRound[] = [...NOISE, ...CLEAN].sort((a, b) => b.round_date.localeCompare(a.round_date));

const STATS: RoundStatsCacheRow[] = [
  stats('r01-implausible', 34.51, { birdies: 12, total_putts: 18 }),
  stats('r02-partial', -4, { birdies: 0 }),
  ...CLEAN.map((r, i) => stats(r.id, 0.4 - i * 0.15)),
];
const STATS_BY_ID = new Map(STATS.map((s) => [s.round_id, s] as const));

function detailInputs(rounds: RawRound[]): PlayerDetailInputs {
  return {
    firstName: 'Cole',
    seasonYear: 2026,
    rounds: { ok: true, value: rounds },
    roundStats: { ok: true, value: STATS },
    genome: { ok: true, value: null },
    insights: { ok: true, value: [] },
    focusAreas: { ok: true, value: [] },
    goals: { ok: true, value: [] },
  };
}

// ---------------------------------------------------------------------------
// Source helpers for the static half of the contract
// ---------------------------------------------------------------------------

function source(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

/** Drops block and line comments so a comment naming a banned band passes. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
}

// ---------------------------------------------------------------------------
// 1. The fixture is what it claims to be
// ---------------------------------------------------------------------------

describe('fixture', () => {
  it('the noise rounds are excluded for the right reasons and the clean ones all count', () => {
    expect(roundExclusionReason(IMPLAUSIBLE)).toBe('implausible_score');
    expect(roundExclusionReason(PARTIAL)).toBe('holes_missing');
    expect(CLEAN.every((r) => roundExclusionReason(r) === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. The partial (and implausible) round affects nothing
// ---------------------------------------------------------------------------

describe('a partial or implausible round affects nothing', () => {
  it('aggregateCountableRounds: every headline number is unchanged', () => {
    const withNoise = aggregateCountableRounds(ALL, STATS_BY_ID);
    const clean = aggregateCountableRounds(CLEAN, STATS_BY_ID);
    expect(withNoise.roundsExcluded).toBe(2);
    expect({ ...withNoise, roundsExcluded: 0 }).toEqual({ ...clean, roundsExcluded: 0 });
  });

  it('composite (Fingerprint path: countable filter, then computeCompositeRating)', () => {
    const fingerprintRounds = (rs: RawRound[]) =>
      filterCountableRounds(rs.map(withCanonicalRoundTotal)).slice(0, 10);
    const a = computeCompositeRating(fingerprintRounds(ALL));
    const b = computeCompositeRating(fingerprintRounds(CLEAN));
    expect(a).toEqual(b);
    expect(a.rating).not.toBe(100);
    // Teeth: without the countable filter the partial round moves the number.
    expect(computeCompositeRating(ALL.map(withCanonicalRoundTotal)).rating).not.toBe(b.rating);
  });

  it('player page model: every scope ledger, the verdict and the best round are unchanged', () => {
    const withNoise = buildPlayerDetailModel(detailInputs(ALL));
    const clean = buildPlayerDetailModel(detailInputs(CLEAN));
    expect(withNoise.excludedRounds).toBe(2);
    expect(withNoise.scopes.map((s) => s.ledger)).toEqual(clean.scopes.map((s) => s.ledger));
    expect(withNoise.verdict).toEqual(clean.verdict);
    expect(withNoise.bestRoundId).toBe(clean.bestRoundId);
    expect(withNoise.waterfall).toEqual(clean.waterfall);
  });
});

// ---------------------------------------------------------------------------
// 3. One metric, one number across surfaces
// ---------------------------------------------------------------------------

describe('one metric, one number', () => {
  it('player page scoring average equals formatMetric over the canonical aggregate, per scope', () => {
    const model = buildPlayerDetailModel(detailInputs(ALL));
    const rows18 = filterCountableRounds(ALL).filter((r) => (r.holes_played ?? 18) === 18);
    const slices: Record<string, CountableRoundRow[]> = {
      last5: rows18.slice(0, 5),
      last10: rows18.slice(0, 10),
      season: rows18.filter((r) => r.round_date.startsWith('2026')),
    };
    for (const scope of model.scopes) {
      const printed = scope.ledger.find((l) => l.key === 'scoring')?.value;
      const canonical = aggregateCountableRounds(slices[scope.key] ?? [], STATS_BY_ID).scoringAverage;
      expect(printed, scope.key).toBe(formatMetricText('scoring_average', canonical));
    }
  });

  it('every aggregating loader reads the one countable-round rule', () => {
    const loaders = [
      'src/app/golf/actions/player-fingerprint.ts', // Fingerprint
      'src/app/golf/actions/stats-data.ts', // Stats
      'src/app/golf/actions/dashboard-data.ts', // Home
      'src/app/golf/actions/coachhelm-data.ts', // Genome / Scouting / Deep dive
      'src/app/golf/(dashboard)/dashboard/roster/page.tsx', // Roster
      'src/app/golf/(dashboard)/dashboard/stats/team/page.tsx', // Team stats (Brief)
      'src/components/fairway/pages/player-detail/buildPlayerDetailModel.ts', // Player page
    ];
    for (const rel of loaders) {
      const code = stripComments(source(rel));
      expect(
        /\b(aggregateCountableRounds|filterCountableRounds|isCountableRound|roundExclusionReason)\b/.test(code),
        `${rel} must filter through src/lib/golf/round-countable.ts`,
      ).toBe(true);
    }
  });

  it('Fingerprint composite is the canonical computeCompositeRating over countable rounds', () => {
    const code = stripComments(source('src/app/golf/actions/player-fingerprint.ts'));
    expect(code).toMatch(/from '@\/lib\/coachhelm\/composite-rating'/);
    expect(code).toMatch(/\.filter\(isCountableRound\)/);
    expect(code).toMatch(/computeCompositeRating\(rounds/);
  });

  it('Form: the Fingerprint rating and the Scouting/profile Form are one number (OD-02, FP-06)', () => {
    const patterns = [{ severity: 'critical' }, { severity: 'medium' }, { severity: 'high' }];
    // Fingerprint path: canonical total, countable filter, 10-round window.
    const fingerprint = computeCompositeRating(
      filterCountableRounds(ALL.map(withCanonicalRoundTotal)).slice(0, 10),
      patterns,
    );
    // Profile path (coachhelm-data getPlayerProfile): raw rows into form-score.
    const profile = computeFormScore(ALL, patterns);
    expect(fingerprint.rating).toBe(profile.score);
    expect(fingerprint.rating).not.toBeNull();
    expect(fingerprint.rating).toBeLessThan(100);
    expect(fingerprint.form.quality).toBe(profile.quality);
    expect(fingerprint.form.averageToPar18).toBe(profile.averageToPar18);
    expect(fingerprint.form.patternPenalty).toBe(10);

    // Same inputs on both loaders: severe patterns only, no limit.
    const fp = stripComments(source('src/app/golf/actions/player-fingerprint.ts'));
    const data = stripComments(source('src/app/golf/actions/coachhelm-data.ts'));
    expect(fp).toMatch(/\.in\('severity', \['critical', 'high'\]\)/);
    expect(data).toMatch(/\.in\('severity', \['critical', 'high'\]\)/);
    expect(data).toMatch(/computeFormScore\(/);

    // Scouting prints no second 0–100 score: the live tab never reads compositeRating.
    for (const rel of [
      'src/components/fairway/pages/scouting/ScoutingReport.tsx',
      'src/components/fairway/pages/scouting/scouting-model.ts',
      'src/app/golf/(dashboard)/dashboard/players/[playerId]/game/PlayerDeepDiveTabs.tsx',
    ]) {
      expect(stripComments(source(rel)), rel).not.toMatch(/compositeRating/);
    }
    // The Fingerprint Form text comes from form-score, never the old linear formula.
    const model = stripComments(
      source('src/components/fairway/pages/player-game/fingerprint/fingerprint-model.ts'),
    );
    expect(model).toMatch(/describeFormFormula/);
    expect(model).not.toMatch(/80 − 3/);
  });

  it('Pressure gap: Fingerprint and Genome pressure_delta read one definition (FP-06)', () => {
    // The Fingerprint window: the 10 newest countable rounds. It holds a
    // 9-hole practice round (r08), so an un-normalized mean would differ.
    const window = filterCountableRounds(ALL.map(withCanonicalRoundTotal)).slice(0, 10);
    expect(window.some((r) => r.holes_played === 9)).toBe(true);

    const fingerprintGap = computePressureGap(window, { minPerSide: 2 });
    expect(fingerprintGap).not.toBeNull();
    const genome = pressureDelta.compute({
      player_id: 'p-1',
      recent_rounds_count: window.length,
      rounds: window.map((r) => ({
        id: r.id,
        round_date: r.round_date,
        round_type: r.round_type ?? null,
        total_score: r.total_score,
        score_to_par: r.score_to_par,
        holes_played: r.holes_played,
      })),
      hole_scores: [],
      shots: [],
    });
    const clamped = Math.max(-3, Math.min(3, fingerprintGap!.gap));
    expect(genome.value).toBe(Number(clamped.toFixed(2)));

    // Teeth: the old Genome mean (raw 9-hole to par) gives another number.
    const rawMean = (xs: RawRound[]) => xs.reduce((a, r) => a + (r.score_to_par ?? 0), 0) / xs.length;
    const oldGenomeGap =
      rawMean(window.filter((r) => r.round_type === 'tournament' || r.round_type === 'qualifier')) -
      rawMean(window.filter((r) => r.round_type === 'practice'));
    expect(Number(oldGenomeGap.toFixed(2))).not.toBe(genome.value);

    for (const rel of [
      'src/app/golf/actions/player-fingerprint.ts',
      'src/lib/coachhelm/v3/genome/dimensions/pressure-delta.ts',
    ]) {
      expect(stripComments(source(rel)), rel).toMatch(/computePressureGap\(/);
    }
  });

  it('Deep dive scrambling carries the "Last 90 days" window chip (FP-06, NUM-20)', () => {
    // The deep dive reads calculateScrambleRate over getPlayerShotContext's
    // 90 days; Stats and Fingerprint read the all-rounds cache. Different
    // windows are fine when the window is printed.
    expect(formatMetric('scrambling_pct', 55, { window: 'last_90_days' }).windowChip).toBe('Last 90 days');
    const card = stripComments(source('src/components/golf/coachhelm/player/ShotAnalysisCard.tsx'));
    expect(card).toMatch(/SCRAMBLE_WINDOW = 'last_90_days'/);
    expect(card).toMatch(/formatMetric\('scrambling_pct', resolvedScrambleRate, \{ window: SCRAMBLE_WINDOW \}\)/);
    expect(card).toMatch(/scramble\.windowChip/);
  });
  it.todo(
    'Team board and Stats print strokes gained through formatMetric (2 dp, no "E" for SG zero; team-board fmtSg is 1 dp, stats formatSgSigned prints "−0.00"; W9/W13)',
  );
});

// ---------------------------------------------------------------------------
// 4. No legacy putting band on a player-analysis surface
// ---------------------------------------------------------------------------

describe('no 15–20 ft or 20+ ft band on player-analysis surfaces', () => {
  const SURFACES = [
    'src/app/golf/actions/player-fingerprint.ts',
    'src/components/fairway/pages/player-game/FairwayPlayerGameFingerprint.tsx',
    'src/app/golf/(dashboard)/dashboard/players/[playerId]/game/print/page.tsx',
    'src/app/golf/(dashboard)/dashboard/players/[playerId]/game/print/MetricPill.tsx',
    'src/app/golf/(dashboard)/dashboard/players/[playerId]/game/PlayerDeepDiveTabs.tsx',
    'src/components/fairway/pages/coachhelm/GenomeDetailView.tsx',
    'src/components/fairway/pages/coachhelm/GenomeCompareView.tsx',
    'src/components/golf/coachhelm/home/DeepDiveDrill.tsx',
    'src/components/golf/coachhelm/player/ShotAnalysisCard.tsx',
  ];
  const BANNED = /15[-–_ ]?20\s*(ft|_?ft)?|20[_ ]?\+\s*ft|20_plus/;

  it.each(SURFACES)('%s', (rel) => {
    const code = stripComments(source(rel));
    const hit = code.match(BANNED);
    expect(hit?.[0] ?? null, `${rel} prints a legacy band`).toBeNull();
  });

  it.todo(
    'Stats putting views drop the legacy 15–20 ft band (StatsBento.tsx, PuttingDrill.tsx, buildRoundStatReport.ts; W9)',
  );
});
