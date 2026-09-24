/**
 * ============================================================================
 * Coach player dossier · pure logic
 * ----------------------------------------------------------------------------
 * The arithmetic behind the field sheet, tested without a DOM. The cases that
 * matter most are the honesty ones: a failed read must never be able to
 * produce the same output as a genuinely empty player, and no formatter may
 * turn a missing number into a zero.
 * ========================================================================== */

import { describe, expect, it } from 'vitest';
import {
  DOSSIER_ROUND_LIMIT,
  MISSING,
  buildDossierReadouts,
  buildDossierVerdict,
  formatOne,
  formatPct,
  formatSg,
  formatToParCell,
  girCell,
  isPlottable,
  localMidnight,
  plottableRounds,
  roundTypeLabel,
  scoringTrend,
  standingHalfSpan,
  standingLedgerRows,
  stripDomain,
  toParTone,
  worstSubMetric,
  type DossierRound,
} from '../roster-player-logic';
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

const TODAY = '2026-09-10';

function round(overrides: Partial<DossierRound> = {}): DossierRound {
  return {
    id: 'r1',
    round_date: '2026-09-01',
    course_name: 'pebble beach',
    round_type: 'qualifier',
    total_score: 73,
    score_to_par: 1,
    holes_played: 18,
    total_putts: 30,
    total_gir: 11,
    total_gir_possible: 18,
    ...overrides,
  };
}

function standingRow(overrides: Partial<PlayerStandingRow> = {}): PlayerStandingRow {
  return {
    metric_id: 'sg_total',
    player_value: 0.42,
    team_avg: 0.1,
    team_n: 8,
    team_pct: 70,
    pga_value: 0,
    pga_delta: 0.42,
    ...overrides,
  };
}

function stats(overrides: Partial<GolfStats> = {}): GolfStats {
  return {
    roundsPlayed: 21,
    scoringAverage: 74.7,
    fairwayPercentage: 65,
    girPercentage: 71,
    puttsPerRound: 29.8,
    ...overrides,
  } as GolfStats;
}

const noTrend = { hasSignal: false, delta: 0, direction: 'stable' as const };

/* ── Dates ────────────────────────────────────────────────────────────────── */

describe('date handling', () => {
  it('parses a date-only column at LOCAL midnight, not UTC midnight', () => {
    const t = localMidnight('2026-09-01');
    const d = new Date(t);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(0);
  });

  it('rejects the production junk dates that would stretch an axis by millennia', () => {
    expect(isPlottable('60824-02-02', TODAY)).toBe(false);
    expect(isPlottable('1904-06-01', TODAY)).toBe(false);
    expect(isPlottable('2026-09-01', TODAY)).toBe(true);
    expect(isPlottable(null, TODAY)).toBe(false);
  });
});

/* ── The stage ────────────────────────────────────────────────────────────── */

describe('plottableRounds', () => {
  it('drops unplottable dates but leaves the rest in oldest-to-newest order', () => {
    const plotted = plottableRounds(
      [
        round({ id: 'c', round_date: '2026-09-05' }),
        round({ id: 'junk', round_date: '60824-02-02' }),
        round({ id: 'a', round_date: '2026-07-04' }),
        round({ id: 'b', round_date: '2026-08-11' }),
      ],
      TODAY,
    );
    expect(plotted.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('never plots a round with no score or no score-to-par', () => {
    const plotted = plottableRounds(
      [round({ id: 'x', total_score: null }), round({ id: 'y', score_to_par: null }), round({ id: 'z' })],
      TODAY,
    );
    expect(plotted.map((r) => r.id)).toEqual(['z']);
  });

  it('builds a spoken label and a round-detail href per mark', () => {
    const [mark] = plottableRounds([round({ id: 'r9', score_to_par: -2, total_score: 70 })], TODAY);
    expect(mark!.href).toBe('/golf/dashboard/rounds/r9');
    expect(mark!.label).toBe('Sep 1, Pebble Beach, 70 (−2)');
  });

  it('anchors the domain on the oldest plotted round and ends it at today', () => {
    const plotted = plottableRounds([round({ round_date: '2026-08-01' }), round({ id: 'r2', round_date: '2026-09-02' })], TODAY);
    expect(stripDomain(plotted, TODAY)).toEqual({ start: '2026-08-01', end: TODAY });
  });

  it('falls back to a today-only domain when nothing can be plotted', () => {
    expect(stripDomain([], TODAY)).toEqual({ start: TODAY, end: TODAY });
  });
});

/* ── The trend ────────────────────────────────────────────────────────────── */

describe('scoringTrend', () => {
  it('reports no signal when there are fewer rounds than the window needs', () => {
    const trend = scoringTrend([round(), round({ id: 'r2' }), round({ id: 'r3' })]);
    expect(trend.hasSignal).toBe(false);
  });

  it('calls a run of lower recent scores improving', () => {
    const rounds: DossierRound[] = [
      ...[70, 71, 70, 72, 71].map((s, i) => round({ id: `new${i}`, total_score: s })),
      ...[78, 79, 80, 78, 79].map((s, i) => round({ id: `old${i}`, total_score: s })),
    ];
    const trend = scoringTrend(rounds);
    expect(trend.hasSignal).toBe(true);
    expect(trend.direction).toBe('improving');
    expect(trend.delta).toBeLessThan(0);
  });

  it('normalizes a nine-hole round rather than counting it as a great eighteen', () => {
    const nines = scoringTrend([
      ...[36, 36, 36, 36, 36].map((s, i) => round({ id: `n${i}`, total_score: s, holes_played: 9 })),
      ...[78, 79, 80, 78, 79].map((s, i) => round({ id: `o${i}`, total_score: s })),
    ]);
    // 36 over nine holes is 72 over eighteen, a ~6.6 stroke gain — not the
    // ~42 a raw comparison would have reported.
    expect(Math.abs(nines.delta)).toBeLessThan(10);
  });
});

/* ── The verdict ──────────────────────────────────────────────────────────── */

describe('buildDossierVerdict', () => {
  it('says the read failed, and stops, when the standing fetch itself failed', () => {
    const parts = buildDossierVerdict({
      playerId: 'p1',
      standingRows: [standingRow()],
      standingUnavailable: true,
      trend: { hasSignal: true, delta: -1.2, direction: 'improving' },
    });
    expect(parts).toEqual([{ text: "Strokes-gained standing couldn't load." }]);
  });

  it('uses the cold-start sentence, not the failure sentence, for a real player with no SG row', () => {
    const parts = buildDossierVerdict({ playerId: 'p1', standingRows: [], standingUnavailable: false, trend: noTrend });
    expect(parts).toHaveLength(1);
    expect(parts[0]!.text).toBe('Strokes-gained standing fills in after 5+ rounds with shot detail.');
  });

  it('leads with the signed SG headline and links the worst sub-metric to Game Fingerprint', () => {
    const parts = buildDossierVerdict({
      playerId: 'p1',
      standingUnavailable: false,
      trend: noTrend,
      standingRows: [
        standingRow({ player_value: 0.42 }),
        standingRow({ metric_id: 'sg_ott', player_value: 0.3, team_pct: 80 }),
        standingRow({ metric_id: 'sg_putting', player_value: -0.6, team_pct: 12 }),
        standingRow({ metric_id: 'sg_approach', player_value: 0.1, team_pct: 55 }),
      ],
    });
    const text = parts.map((p) => p.text).join('');
    expect(text).toContain('Gaining +0.42 strokes per round on the field.');
    expect(text).toContain('Leaking most in putting.');
    const link = parts.find((p) => p.href === '/golf/dashboard/players/p1/game');
    expect(link?.text).toBe('putting');
  });

  it('omits the leak clause entirely when no sub-metric carries a team percentile', () => {
    const parts = buildDossierVerdict({
      playerId: 'p1',
      standingUnavailable: false,
      trend: noTrend,
      standingRows: [standingRow({ player_value: -0.5 }), standingRow({ metric_id: 'sg_putting', team_pct: null })],
    });
    const text = parts.map((p) => p.text).join('');
    expect(text).toBe('−0.50 strokes per round vs the field.');
  });

  it('adds a glyph-free, number-free trend clause anchored at the round log', () => {
    const parts = buildDossierVerdict({
      playerId: 'p1',
      standingUnavailable: false,
      standingRows: [standingRow()],
      trend: { hasSignal: true, delta: 1.4, direction: 'declining' },
    });
    const text = parts.map((p) => p.text).join('');
    expect(text).toContain('Trending worse over the last 5 rounds.');
    expect(text).not.toMatch(/[▲▼—–>]/);
    expect(text).not.toContain('1.4');
    expect(parts.find((p) => p.href === '#rounds')?.text).toBe('the last 5 rounds');
  });

  it('says nothing about a trend that has no signal', () => {
    const parts = buildDossierVerdict({
      playerId: 'p1',
      standingUnavailable: false,
      standingRows: [standingRow()],
      trend: noTrend,
    });
    expect(parts.map((p) => p.text).join('')).not.toContain('Trending');
  });
});

/* ── The readouts ─────────────────────────────────────────────────────────── */

describe('buildDossierReadouts', () => {
  const base = {
    detailedStats: stats(),
    standingRows: [standingRow({ metric_id: 'gir_pct', player_value: 71, team_avg: 64 })],
    standingUnavailable: false,
    roundsUnavailable: false,
    trend: noTrend,
    plottedCount: 12,
  };

  it('labels the career value and the five-round window differently so they cannot be read as one number', () => {
    const [scoring] = buildDossierReadouts({ ...base, trend: { hasSignal: true, delta: -0.8, direction: 'improving' } });
    expect(scoring!.label).toBe('Scoring avg · career');
    expect(scoring!.value).toBe('74.7');
    expect(scoring!.spanLabel).toBe('last 5 vs prior 5');
    expect(scoring!.delta?.direction).toBe('improving');
  });

  it('renders a failed stats read as no value at all, never as a zero', () => {
    const items = buildDossierReadouts({ ...base, detailedStats: null });
    expect(items.map((i) => i.value)).toEqual([null, '71%', null, null]);
    expect(items[3]!.note).toBe("couldn't load");
  });

  it('separates "the rounds fetch failed" from "not enough rounds yet"', () => {
    expect(buildDossierReadouts({ ...base, roundsUnavailable: true })[0]!.note).toBe("couldn't load");
    expect(buildDossierReadouts(base)[0]!.note).toBe('not enough rounds yet');
  });

  it('takes the GIR value and its comparison from the same standing row, in the coach voice', () => {
    const gir = buildDossierReadouts(base)[1]!;
    expect(gir.label).toBe('GIR %');
    expect(gir.value).toBe('71%');
    expect(gir.note).toBe('Above team average');
    expect(gir.note).not.toMatch(/your/i);
  });

  it('shows a dash and says the read failed when the standing fetch broke', () => {
    const gir = buildDossierReadouts({ ...base, standingUnavailable: true })[1]!;
    expect(gir.value).toBeNull();
    expect(gir.note).toBe("couldn't load");
  });

  it('shows a dash with no caption when the gir row is genuinely absent', () => {
    const gir = buildDossierReadouts({ ...base, standingRows: [] })[1]!;
    expect(gir.value).toBeNull();
    expect(gir.note).toBe('');
  });

  it('leaves the putts caption blank rather than inventing a team comparison that has no metric', () => {
    const putts = buildDossierReadouts(base)[2]!;
    expect(putts.label).toBe('Putts/rd · career');
    expect(putts.value).toBe('29.8');
    expect(putts.note).toBe('');
    expect(putts.delta).toBeUndefined();
  });

  it('names the strip window on the career rounds count, the one number the stage does not show', () => {
    const rounds = buildDossierReadouts({ ...base, plottedCount: 9 })[3]!;
    expect(rounds.label).toBe('Rounds · career');
    expect(rounds.value).toBe('21');
    expect(rounds.note).toBe('strip shows the last 9');
  });
});

/* ── The standing ledger ──────────────────────────────────────────────────── */

describe('standingLedgerRows', () => {
  it('emits the four sub-metrics in Game Fingerprint order, prefix stripped', () => {
    const rows = standingLedgerRows([], 'p1');
    expect(rows.map((r) => r.metricId)).toEqual(['sg_ott', 'sg_approach', 'sg_around_green', 'sg_putting']);
    expect(rows.map((r) => r.label)).toEqual(['Off the Tee', 'Approach', 'Around the Green', 'Putting']);
    expect(rows[0]!.fullLabel).toBe('SG: Off the Tee');
  });

  it('says an absent row has no shot detail rather than leaving a blank line beside a dash', () => {
    const rows = standingLedgerRows([], 'p1');
    expect(rows[0]!.value).toBe(MISSING);
    expect(rows[0]!.raw).toBeNull();
    expect(rows[0]!.cohort).toBe('no shot detail yet');
  });

  it('formats a present row signed, with the cohort line in the coach voice', () => {
    const rows = standingLedgerRows(
      [standingRow({ metric_id: 'sg_putting', player_value: -0.61, team_pct: 80, team_n: 9 })],
      'p1',
    );
    const putting = rows.find((r) => r.metricId === 'sg_putting')!;
    expect(putting.value).toBe('−0.61');
    expect(putting.raw).toBeCloseTo(-0.61);
    expect(putting.cohort).toBe('Top quartile on team');
    expect(putting.cohort).not.toMatch(/your/i);
    expect(putting.href).toBe('/golf/dashboard/players/p1/game');
  });

  it('suppresses a percentile caption on a roster too small for one', () => {
    const rows = standingLedgerRows([standingRow({ metric_id: 'sg_ott', team_pct: 99, team_n: 2 })], 'p1');
    expect(rows[0]!.cohort).toBe('');
  });

  it('scales the bars off the widest real value, never below a readable floor', () => {
    expect(standingHalfSpan(standingLedgerRows([], 'p1'))).toBe(1.5);
    const wide = standingLedgerRows([standingRow({ metric_id: 'sg_approach', player_value: -2.4 })], 'p1');
    expect(standingHalfSpan(wide)).toBeCloseTo(2.4);
  });
});

describe('worstSubMetric', () => {
  it('picks the lowest team percentile among the four sub-metrics and ignores sg_total', () => {
    const worst = worstSubMetric([
      standingRow({ metric_id: 'sg_total', team_pct: 1 }),
      standingRow({ metric_id: 'sg_ott', team_pct: 40 }),
      standingRow({ metric_id: 'sg_approach', team_pct: 15 }),
    ]);
    expect(worst?.metric_id).toBe('sg_approach');
  });

  it('returns null when no sub-metric carries a percentile', () => {
    expect(worstSubMetric([standingRow({ metric_id: 'sg_ott', team_pct: null })])).toBeNull();
  });
});

/* ── Formatters ───────────────────────────────────────────────────────────── */

describe('formatters', () => {
  it('uses one EN-dash glyph for every missing number, never an em dash', () => {
    expect(MISSING).toBe('–');
    for (const out of [formatOne(null), formatPct(null), formatSg(null), formatToParCell(null), girCell(null, 18)]) {
      expect(out).toBe(MISSING);
      expect(out).not.toContain('—');
    }
  });

  it('never turns a missing number into a zero', () => {
    expect(formatOne(undefined)).not.toBe('0.0');
    expect(formatPct(Number.NaN)).toBe(MISSING);
    expect(girCell(0, 18)).toBe('0/18');
  });

  it('formats score-to-par with E at level and a Unicode minus under par', () => {
    expect(formatToParCell(0)).toBe('E');
    expect(formatToParCell(3)).toBe('+3');
    expect(formatToParCell(-2)).toBe('−2');
  });

  it('tones to-par by sign, with a missing value reading as neither', () => {
    expect(toParTone(-1)).toBe('under');
    expect(toParTone(2)).toBe('over');
    expect(toParTone(0)).toBe('even');
    expect(toParTone(null)).toBe('even');
  });

  it('labels a round type from the shared map and title-cases anything else', () => {
    expect(roundTypeLabel('qualifier')).toBe('Qualifier');
    expect(roundTypeLabel('practice_round')).toBe('Practice Round');
    expect(roundTypeLabel(null)).toBe('');
  });

  it('fetches one window wide enough for the strip, the trend and a real table', () => {
    expect(DOSSIER_ROUND_LIMIT).toBe(12);
  });
});
