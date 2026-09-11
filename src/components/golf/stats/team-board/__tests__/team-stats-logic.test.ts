import { describe, it, expect } from 'vitest';

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { RankInfo, TeamBoardRowViewModel } from '../buildTeamBoardViewModel';
import {
  buildBoardCsv,
  buildTeamStatsVerdict,
  CATEGORY_COLUMNS,
  defaultSortKey,
  EN_DASH,
  fundamentalRows,
  furthestBack,
  hasAnySg,
  hasFundamentals,
  hasTrajectorySignal,
  isWomensRoster,
  leadersByCategory,
  leakOrder,
  SG_COLD_START,
  SG_COLUMNS,
  sgDomain,
  sortPlayerRows,
  statsLoadErrorMessage,
  strongestCategory,
  teamSgByCategory,
  teamSlug,
  tourLabel,
  weakestCategory,
  worstLeakTakeaway,
  type CategoryReading,
} from '../team-stats-logic';

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

function standing(metric: MetricId, value: number, overrides: Partial<PlayerStanding> = {}): PlayerStanding {
  return {
    player_id: 'p',
    metric_id: metric,
    player_value: value,
    team_avg: null,
    team_n: 0,
    team_pct: null,
    level_avg: null,
    level_n: 0,
    level_pct: null,
    pga_value: 0,
    pga_delta: null,
    computed_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

function standingMap(entries: Record<string, Partial<Record<MetricId, number>>>): Map<string, Map<MetricId, PlayerStanding>> {
  const out = new Map<string, Map<MetricId, PlayerStanding>>();
  for (const [id, metrics] of Object.entries(entries)) {
    const inner = new Map<MetricId, PlayerStanding>();
    for (const [metric, value] of Object.entries(metrics)) {
      inner.set(metric as MetricId, standing(metric as MetricId, value as number, { player_id: id }));
    }
    out.set(id, inner);
  }
  return out;
}

function reading(key: CategoryReading['key'], value: number | null): CategoryReading {
  const col = CATEGORY_COLUMNS.find((c) => c.key === key)!;
  return { key, prose: col.prose, value };
}

function row(overrides: Partial<TeamBoardRowViewModel> & { id: string; name: string }): TeamBoardRowViewModel {
  return {
    classYear: null,
    roundsPlayed: 10,
    scoringAverage: '74.0',
    ranks: { tee: null, app: null, short: null, putt: null, scoring: null },
    sg: { tee: EN_DASH, app: EN_DASH, short: EN_DASH, putt: EN_DASH },
    composite: null,
    trendSeries: [],
    signal: { tone: 'quiet', label: 'Steady' },
    expand: {
      worstMetricLabel: null,
      worstMetricValue: null,
      sgPutt: EN_DASH,
      lastRound: EN_DASH,
      fairways: EN_DASH,
      gir: EN_DASH,
      scrambling: EN_DASH,
      puttsPerRound: EN_DASH,
      birdiesPerRound: EN_DASH,
      links: { fullStats: '/a', fingerprint: '/b', prescribe: '/c' },
    },
    ...overrides,
  };
}

const rank = (r: number, of: number): RankInfo => ({ rank: r, of });

/* ── Columns ──────────────────────────────────────────────────────────────── */

describe('the shared column set', () => {
  it('runs five columns, scoring last and alone in having no strokes-gained metric', () => {
    expect(CATEGORY_COLUMNS.map((c) => c.key)).toEqual(['tee', 'app', 'short', 'putt', 'scoring']);
    expect(SG_COLUMNS.map((c) => c.key)).toEqual(['tee', 'app', 'short', 'putt']);
    expect(CATEGORY_COLUMNS.find((c) => c.key === 'scoring')!.metric).toBeNull();
  });

  it('names the third category the same way its own data label does, not "Short game"', () => {
    const short = CATEGORY_COLUMNS.find((c) => c.key === 'short')!;
    expect(short.prose).toBe('Around the green');
    expect(short.headerWide).toBe('Around the green');
    expect(short.headerShort).toBe('Grn');
  });

  it('gives Tee the same label at every width, so it renders one span not a pair', () => {
    const tee = CATEGORY_COLUMNS.find((c) => c.key === 'tee')!;
    expect(tee.headerWide).toBe(tee.headerShort);
    // …and still calls it "Off the tee" in prose, where a heading abbreviation
    // would not read as a sentence.
    expect(tee.prose).toBe('Off the tee');
  });
});

/* ── Team strokes gained ──────────────────────────────────────────────────── */

describe('teamSgByCategory', () => {
  const players = [
    { id: 'a', roundsPlayed: 20 },
    { id: 'b', roundsPlayed: 5 },
  ];

  it('returns one reading per SG category in column order, unfiltered', () => {
    const readings = teamSgByCategory(players, standingMap({ a: { sg_putting: -1 } }));
    expect(readings.map((r) => r.key)).toEqual(['tee', 'app', 'short', 'putt']);
    // The three categories nobody carries are null, NOT dropped: the stage
    // renders five columns whatever the data, because the shared grid is the
    // architecture of the page.
    expect(readings.map((r) => r.value)).toEqual([null, null, null, -1]);
  });

  it('weights each player by their rounds played', () => {
    const readings = teamSgByCategory(players, standingMap({ a: { sg_ott: 1 }, b: { sg_ott: -1 } }));
    // (1*20 + -1*5) / 25 = 0.6 — not the unweighted 0.
    expect(readings[0]!.value).toBeCloseTo(0.6, 10);
  });

  it('never reports a missing category as a zero', () => {
    const readings = teamSgByCategory(players, standingMap({}));
    expect(readings.every((r) => r.value === null)).toBe(true);
    expect(hasAnySg(readings)).toBe(false);
  });
});

describe('sgDomain', () => {
  it('is one figure shared by every bar, taken from the largest magnitude', () => {
    expect(sgDomain([reading('tee', -3.2), reading('putt', -0.1)])).toBeCloseTo(3.2, 10);
  });

  it('floors at 1 so an all-null roster cannot divide by zero', () => {
    expect(sgDomain([reading('tee', null), reading('putt', null)])).toBe(1);
    expect(sgDomain([reading('tee', 0.4)])).toBe(1);
  });
});

describe('leakOrder', () => {
  const readings = [reading('tee', 0.4), reading('app', null), reading('short', -1.2), reading('putt', -0.3)];

  it('sorts the categories that have a reading worst first and drops the ones that do not', () => {
    expect(leakOrder(readings).map((r) => r.key)).toEqual(['short', 'putt', 'tee']);
  });

  it('names the weakest and strongest categories off the same ordering', () => {
    expect(weakestCategory(readings)!.key).toBe('short');
    expect(strongestCategory(readings)!.key).toBe('tee');
  });

  it('has no weakest or strongest when nothing is measured', () => {
    expect(weakestCategory([reading('tee', null)])).toBeNull();
    expect(strongestCategory([reading('tee', null)])).toBeNull();
  });
});

/* ── Sorting ──────────────────────────────────────────────────────────────── */

describe('defaultSortKey', () => {
  const rows = [row({ id: 'a', name: 'A', ranks: { tee: null, app: null, short: null, putt: null, scoring: rank(1, 1) } })];

  it('opens on the weakest category even when every category is positive', () => {
    // Nothing here is a leak; the honest reading of "what do we work on" is
    // still the column with the least room to spare.
    const key = defaultSortKey([reading('tee', 0.9), reading('putt', 0.2)], rows);
    expect(key).toBe('putt');
  });

  it('opens on the true leak when there is one', () => {
    expect(defaultSortKey([reading('tee', 0.9), reading('putt', -0.4)], rows)).toBe('putt');
  });

  it('falls back to scoring with no strokes gained anywhere', () => {
    expect(defaultSortKey([reading('tee', null)], rows)).toBe('scoring');
  });

  it('falls back to name when no player carries a scoring rank either', () => {
    expect(defaultSortKey([reading('tee', null)], [row({ id: 'a', name: 'A' })])).toBe('name');
  });
});

describe('sortPlayerRows', () => {
  const rows = [
    row({ id: 'c', name: 'Carter', ranks: { tee: rank(2, 3), app: null, short: null, putt: null, scoring: null } }),
    row({ id: 'a', name: 'Alvarez', ranks: { tee: rank(1, 3), app: null, short: null, putt: null, scoring: null } }),
    row({ id: 'b', name: 'Baker', ranks: { tee: null, app: null, short: null, putt: null, scoring: null } }),
    row({ id: 'd', name: 'Dunn', ranks: { tee: rank(2, 3), app: null, short: null, putt: null, scoring: null } }),
  ];

  it('sorts by the chosen column ascending, ties broken by name', () => {
    expect(sortPlayerRows(rows, 'tee').map((r) => r.id)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('sinks an unranked player below every ranked one rather than sorting them as rank zero', () => {
    expect(sortPlayerRows(rows, 'tee').at(-1)!.id).toBe('b');
  });

  it('sorts by name when no column is chosen', () => {
    expect(sortPlayerRows(rows, 'name').map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not mutate the input order', () => {
    const before = rows.map((r) => r.id);
    sortPlayerRows(rows, 'tee');
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});

describe('furthestBack', () => {
  const rows = [
    row({ id: 'a', name: 'Alvarez', ranks: { tee: rank(1, 3), app: null, short: null, putt: null, scoring: null } }),
    row({ id: 'z', name: 'Zane', ranks: { tee: rank(3, 3), app: null, short: null, putt: null, scoring: null } }),
  ];

  it('names the player with the worst rank in one column', () => {
    expect(furthestBack(rows, 'tee')).toEqual({ id: 'z', name: 'Zane' });
  });

  it('names nobody when no player is ranked in that column', () => {
    expect(furthestBack(rows, 'putt')).toBeNull();
  });
});

describe('leadersByCategory', () => {
  const rows = [
    row({ id: 'a', name: 'Alvarez', ranks: { tee: rank(1, 2), app: null, short: null, putt: null, scoring: rank(2, 2) } }),
    row({ id: 'b', name: 'Baker', ranks: { tee: rank(2, 2), app: null, short: null, putt: null, scoring: rank(1, 2) } }),
  ];

  it('reads the rank-1 holder straight off the rows, with no new query', () => {
    expect(leadersByCategory(rows)).toEqual([
      { key: 'tee', prose: 'Off the tee', id: 'a', name: 'Alvarez' },
      { key: 'scoring', prose: 'Scoring', id: 'b', name: 'Baker' },
    ]);
  });

  it('omits a category nobody is ranked in rather than printing it with a dash', () => {
    expect(leadersByCategory(rows).some((l) => l.key === 'putt')).toBe(false);
  });
});

/* ── Trajectory ───────────────────────────────────────────────────────────── */

describe('hasTrajectorySignal', () => {
  it('is false when no player has cleared the trend gate', () => {
    expect(hasTrajectorySignal({ improving: 0, steady: 0, declining: 0 })).toBe(false);
  });

  it('is true as soon as one has', () => {
    expect(hasTrajectorySignal({ improving: 0, steady: 1, declining: 0 })).toBe(true);
  });
});

/* ── The verdict ──────────────────────────────────────────────────────────── */

describe('buildTeamStatsVerdict', () => {
  const trajectory = { improving: 3, steady: 2, declining: 1 };
  const rows = [
    row({ id: 'a', name: 'Alvarez', ranks: { tee: rank(1, 2), app: null, short: null, putt: rank(1, 2), scoring: null } }),
    row({ id: 'z', name: 'Zane', ranks: { tee: rank(2, 2), app: null, short: null, putt: rank(2, 2), scoring: null } }),
  ];
  const text = (parts: { text: string }[]) => parts.map((p) => p.text).join('');

  it('names the leak, its owner and the trajectory, in that order', () => {
    const parts = buildTeamStatsVerdict({
      readings: [reading('tee', 0.4), reading('putt', -0.6)],
      rows,
      trajectory,
      tourLabel: 'PGA Tour',
      roundsError: false,
    });
    expect(text(parts)).toBe('Putting is the leak, −0.6 strokes a round against PGA Tour. Zane is furthest back in it. 3 climbing, 1 sliding.');
    expect(parts.find((p) => p.text === 'Zane')?.href).toBe('/golf/dashboard/roster/z');
  });

  it('lowercases a title-cased category label for prose rather than inventing a second name', () => {
    const parts = buildTeamStatsVerdict({
      readings: [reading('short', -0.9)],
      rows: [],
      trajectory,
      tourLabel: 'LPGA Tour',
      roundsError: false,
    });
    expect(text(parts)).toContain('Around the green is the leak,');
  });

  it('leads with the strongest category when nothing is negative', () => {
    const parts = buildTeamStatsVerdict({
      readings: [reading('tee', 0.9), reading('putt', 0.2)],
      rows,
      trajectory,
      tourLabel: 'PGA Tour',
      roundsError: false,
    });
    expect(text(parts)).toBe('Off the tee leads the way, +0.9 strokes clear of PGA Tour. 3 climbing, 1 sliding.');
  });

  it('omits the owner clause entirely when nobody is ranked in the leaking column, never writing "no one"', () => {
    const parts = buildTeamStatsVerdict({
      readings: [reading('short', -0.9)],
      rows,
      trajectory,
      tourLabel: 'PGA Tour',
      roundsError: false,
    });
    expect(text(parts)).toBe('Around the green is the leak, −0.9 strokes a round against PGA Tour. 3 climbing, 1 sliding.');
    expect(text(parts)).not.toMatch(/no one/i);
  });

  it('says what unlocks strokes gained when there is none', () => {
    const parts = buildTeamStatsVerdict({
      readings: [reading('tee', null), reading('putt', null)],
      rows,
      trajectory,
      tourLabel: 'PGA Tour',
      roundsError: false,
    });
    expect(text(parts)).toBe(`${SG_COLD_START} 3 climbing, 1 sliding.`);
  });

  it('never presents a failed fetch as a cold start', () => {
    const parts = buildTeamStatsVerdict({
      readings: [reading('tee', null), reading('putt', null)],
      rows,
      trajectory,
      tourLabel: 'PGA Tour',
      roundsError: true,
    });
    expect(text(parts)).not.toContain(SG_COLD_START);
    expect(text(parts)).toBe('3 climbing, 1 sliding.');
  });

  it('states the gate instead of an authoritative zero when no player has a trend yet', () => {
    const parts = buildTeamStatsVerdict({
      readings: [reading('putt', -0.6)],
      rows,
      trajectory: { improving: 0, steady: 0, declining: 0 },
      tourLabel: 'PGA Tour',
      roundsError: false,
    });
    expect(text(parts)).toContain('Trend signals begin after 8 completed rounds.');
    expect(text(parts)).not.toContain('0 climbing');
  });
});

/* ── Fundamentals ─────────────────────────────────────────────────────────── */

describe('fundamentals', () => {
  const none = { fairwayPct: null, girPct: null, scramblingPct: null, puttsPerRound: null, birdiesPerRound: null };

  it('formats percentages and per-18 figures, dashing what is missing', () => {
    const rows = fundamentalRows({ ...none, fairwayPct: 61.25, puttsPerRound: 30.44 });
    expect(rows.map((r) => r.value)).toEqual(['61.3%', EN_DASH, EN_DASH, '30.4', EN_DASH]);
    expect(rows.filter((r) => r.missing).map((r) => r.key)).toEqual(['gir', 'scrambling', 'birdies']);
  });

  it('renders an en dash, not an em dash, for a missing reading', () => {
    expect(fundamentalRows(none)[0]!.value).toBe('–');
    expect(fundamentalRows(none)[0]!.value).not.toBe('—');
  });

  it('gates the cold-start sentence on the three hole-outcome percentages', () => {
    expect(hasFundamentals(none)).toBe(false);
    expect(hasFundamentals({ ...none, scramblingPct: 40 })).toBe(true);
    // Putts per round comes from a different source and does not unlock it.
    expect(hasFundamentals({ ...none, puttsPerRound: 30 })).toBe(false);
  });
});

/* ── Tour baseline ────────────────────────────────────────────────────────── */

describe('tour baseline label', () => {
  it('reads LPGA as soon as one standing row is gender anchored', () => {
    const map = new Map<string, Map<MetricId, PlayerStanding>>([
      ['a', new Map([['sg_ott' as MetricId, standing('sg_ott', 0.2)]])],
      ['b', new Map([['sg_ott' as MetricId, standing('sg_ott', 0.2, { is_womens: true })]])],
    ]);
    expect(isWomensRoster(map)).toBe(true);
    expect(tourLabel(true)).toBe('LPGA Tour');
    expect(tourLabel(false)).toBe('PGA Tour');
  });

  it('reads PGA on an empty map', () => {
    expect(isWomensRoster(new Map())).toBe(false);
  });
});

/* ── Leak maps ────────────────────────────────────────────────────────────── */

describe('worstLeakTakeaway', () => {
  const bucket = (label: string, team: number | null, pga: number | null, n = 10) => ({
    label,
    team_value: team,
    pga_value: pga,
    sample_n: n,
  });

  it('names the band the team is furthest behind on, not the biggest number', () => {
    expect(worstLeakTakeaway([bucket('3-5 ft', 80, 90), bucket('10-15 ft', 20, 33)], 'higher_better', 'percent')).toBe('10-15 ft is 13pp below Tour.');
  });

  it('ignores bands with no sample and bands the team is ahead on', () => {
    expect(worstLeakTakeaway([bucket('3-5 ft', 99, 90), bucket('5-10 ft', 10, 60, 0)], 'higher_better', 'percent')).toBeUndefined();
  });

  it('flips the wrong side for a lower-is-better family', () => {
    expect(worstLeakTakeaway([bucket('150-175 yd', 40, 32)], 'lower_better', 'feet')).toBe('150-175 yd is 8 ft farther than Tour.');
  });
});

/* ── The load-failure notice ──────────────────────────────────────────────── */

describe('statsLoadErrorMessage', () => {
  it('is empty when nothing failed', () => {
    expect(statsLoadErrorMessage(false, false, false)).toBe('');
  });

  it('names the one thing that failed', () => {
    expect(statsLoadErrorMessage(true, false, false)).toBe('Round scoring and per-player stats failed to load. Reload to try again.');
  });

  it('distinguishes all three flags in one sentence', () => {
    expect(statsLoadErrorMessage(true, true, true)).toBe(
      'Round scoring and per-player stats and team intelligence (composite ratings), and strokes-gained leak maps failed to load. The figures below may be incomplete, so reload to try again.',
    );
  });

  it('carries no em dash', () => {
    expect(statsLoadErrorMessage(true, true, false)).not.toContain('—');
  });
});

/* ── Export ───────────────────────────────────────────────────────────────── */

describe('buildBoardCsv', () => {
  it('writes a header and one line per player, with an empty cell for an unranked category', () => {
    const csv = buildBoardCsv([
      row({
        id: 'a',
        name: 'Alvarez, Jo',
        roundsPlayed: 12,
        scoringAverage: '73.4',
        composite: 81.6,
        ranks: { tee: rank(1, 2), app: null, short: null, putt: rank(2, 2), scoring: rank(1, 2) },
        signal: { tone: 'hot', label: 'Most improved' },
      }),
    ]);
    const [header, line] = csv.split('\n');
    expect(header).toContain('Player,Rounds,Scoring Avg');
    // A name carrying a comma is quoted, not allowed to shift every column.
    expect(line).toBe('"Alvarez, Jo",12,73.4,1/2,,,2/2,1/2,82,Most improved');
  });

  it('carries no arrow glyph in a signal label', () => {
    const csv = buildBoardCsv([row({ id: 'a', name: 'A', signal: { tone: 'hot', label: 'Most improved' } })]);
    expect(csv).not.toContain('▲');
  });
});

describe('teamSlug', () => {
  it('slugifies a team name for the export filename', () => {
    expect(teamSlug('Guilford College')).toBe('guilford-college');
  });

  it('falls back rather than producing an empty filename', () => {
    expect(teamSlug('!!!')).toBe('team');
  });
});
