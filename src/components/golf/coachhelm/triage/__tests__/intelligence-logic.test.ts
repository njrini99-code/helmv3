/**
 * ============================================================================
 * intelligence-logic — the arithmetic behind the Intelligence field sheet
 * ----------------------------------------------------------------------------
 * Every rule these cover is one the screen gets wrong silently if it breaks:
 * a roster roll-up double-counted into the ranking it summarises, a null
 * stroke impact summed as a zero, a mean drawn from a single reading, a
 * verdict that says "all clear" about a read that failed.
 * ========================================================================== */

import { describe, expect, it } from 'vitest';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';
import {
  activeFocusCount,
  aggregateCategoryLeaks,
  buildIntelligenceVerdict,
  buildLeakField,
  compactScanAge,
  filterLabel,
  focusRows,
  formatSignalStrokes,
  occurrencesOf,
  openSignalCount,
  playerRows,
  queueEntries,
  queueSignalCount,
  rollupCount,
  severityMix,
  tableEntries,
  LEAK_ROW_CAP,
  MIN_BAR_PCT,
} from '../intelligence-logic';

function sig(over: Partial<GroupedSignal> = {}): GroupedSignal {
  return {
    id: 'signal-1',
    kind: 'insight',
    category: 'putting',
    severity: 'high',
    title: 'Putting leak',
    claim: 'Short putts are costing strokes.',
    ageDays: 2,
    status: 'active',
    strokeImpact: 1,
    playerId: 'player-1',
    supersededCount: 0,
    ...over,
  };
}

function grp(playerId: string | null, signals: GroupedSignal[], over: Partial<SignalGroup> = {}): SignalGroup {
  return {
    playerId,
    playerName: playerId ? `Player ${playerId}` : 'Team',
    attentionScore: 10,
    worstSeverity: signals[0]?.severity ?? 'low',
    signals,
    ...over,
  };
}

const hrefs = {
  filterHref: (f: string) => `/x?filter=${f}`,
  playerHref: (id: string) => `/golf/dashboard/roster/${id}`,
  effectivenessHref: '/x?view=effectiveness',
};

/* ── The team_synthesis exclusion ─────────────────────────────────────────── */

describe('aggregateCategoryLeaks — the roll-up exclusion', () => {
  it('never sums a team_synthesis row into the category it summarises', () => {
    // The roll-up's 9.95 IS the sum of the two per-player leaks beside it.
    // Counting it would report 11.95 strokes at risk for a 2-stroke leak.
    const groups = [
      grp(null, [sig({ id: 'team:putting', kind: 'team_synthesis', playerId: null, strokeImpact: 9.95 })]),
      grp('p1', [sig({ id: 'a', strokeImpact: 1.2 })]),
      grp('p2', [sig({ id: 'b', playerId: 'p2', strokeImpact: 0.8 })]),
    ];
    const leaks = aggregateCategoryLeaks(groups);
    expect(leaks).toHaveLength(1);
    expect(leaks[0]!.strokesAtRisk).toBeCloseTo(2.0, 10);
    expect(leaks[0]!.signalCount).toBe(2);
  });

  it('takes magnitude, never the sign — strokes_impact is documented as direction-only', () => {
    const groups = [grp('p1', [sig({ id: 'a', strokeImpact: -1.5 }), sig({ id: 'b', strokeImpact: 0.5 })])];
    expect(aggregateCategoryLeaks(groups)[0]!.strokesAtRisk).toBeCloseTo(2.0, 10);
  });
});

/* ── Null is not zero ─────────────────────────────────────────────────────── */

describe('aggregateCategoryLeaks — null is not zero', () => {
  it('reports null, not 0, when NO signal in the bucket carries an impact', () => {
    const groups = [grp('p1', [sig({ id: 'a', strokeImpact: null }), sig({ id: 'b', strokeImpact: null })])];
    const leak = aggregateCategoryLeaks(groups)[0]!;
    expect(leak.strokesAtRisk).toBeNull();
    expect(leak.signalCount).toBe(2);
  });

  it('sums only the measured signals but still counts the unmeasured ones', () => {
    const groups = [grp('p1', [sig({ id: 'a', strokeImpact: 2 }), sig({ id: 'b', strokeImpact: null })])];
    const leak = aggregateCategoryLeaks(groups)[0]!;
    expect(leak.strokesAtRisk).toBe(2);
    expect(leak.signalCount).toBe(2);
  });

  it('keeps a genuine zero distinct from an unknown', () => {
    const groups = [grp('p1', [sig({ id: 'a', strokeImpact: 0 })])];
    expect(aggregateCategoryLeaks(groups)[0]!.strokesAtRisk).toBe(0);
  });
});

/* ── The rail ─────────────────────────────────────────────────────────────── */

describe('buildLeakField', () => {
  const leak = (category: string, strokesAtRisk: number | null, signalCount = 1) => ({
    category,
    label: category,
    strokesAtRisk,
    signalCount,
  });

  it('ranks measured categories by magnitude and scales the bars off the largest', () => {
    const field = buildLeakField([leak('a', 1), leak('b', 4), leak('c', 2)]);
    expect(field.rows.map((r) => r.category)).toEqual(['b', 'c', 'a']);
    expect(field.rows[0]!.pct).toBe(100);
    expect(field.rows[1]!.pct).toBe(50);
  });

  it('sorts every unmeasured category after every measured one, and draws no bar for it', () => {
    const field = buildLeakField([leak('unknown', null, 9), leak('known', 0.1)]);
    expect(field.rows.map((r) => r.category)).toEqual(['known', 'unknown']);
    expect(field.rows[1]!.pct).toBe(0);
    expect(field.rows[1]!.value).toBe('Not measured');
    expect(field.rows[1]!.sample).toBe('9 signals');
  });

  it('gives a tiny measured leak a visible floor without changing its printed figure', () => {
    const field = buildLeakField([leak('big', 100), leak('tiny', 0.01)]);
    expect(field.rows[1]!.pct).toBe(MIN_BAR_PCT);
    expect(field.rows[1]!.value).toBe('0.0 str/rd');
  });

  it('omits the mean rule when only one category has a reading', () => {
    // A mean of one value lands exactly on that value's own bar tip and tells
    // the reader nothing they cannot already see.
    const field = buildLeakField([leak('a', 3), leak('b', null)]);
    expect(field.meanPct).toBeNull();
    expect(field.meanStrokes).toBeNull();
  });

  it('draws the mean across the measured categories only', () => {
    const field = buildLeakField([leak('a', 4), leak('b', 2), leak('c', null)]);
    expect(field.meanStrokes).toBe(3);
    expect(field.meanPct).toBe(75);
  });

  it('falls back to signal count when nothing at all is measured, and says so', () => {
    const field = buildLeakField([leak('a', null, 2), leak('b', null, 7)]);
    expect(field.allUnmeasured).toBe(true);
    expect(field.rows.map((r) => r.category)).toEqual(['b', 'a']);
    expect(field.rows.every((r) => r.pct === 0)).toBe(true);
  });

  it('caps the rail and reports the overflow rather than hiding it', () => {
    const many = Array.from({ length: LEAK_ROW_CAP + 3 }, (_, i) => leak(`c${i}`, LEAK_ROW_CAP + 3 - i));
    const field = buildLeakField(many);
    expect(field.rows).toHaveLength(LEAK_ROW_CAP);
    expect(field.overflow).toBe(3);
  });

  it('survives a roster whose every measured category sums to a real zero', () => {
    const field = buildLeakField([leak('a', 0), leak('b', 0)]);
    expect(field.rows.every((r) => r.pct === 0)).toBe(true);
    expect(field.rows.every((r) => r.value === '0.0 str/rd')).toBe(true);
    expect(field.meanPct).toBeNull();
  });
});

/* ── Counts that must not disagree under one caption ──────────────────────── */

describe('the two signal counts', () => {
  const groups = [
    grp(null, [sig({ id: 'team:x', kind: 'team_synthesis', playerId: null })]),
    grp('p1', [sig({ id: 'a' }), sig({ id: 'b' })]),
  ];

  it('separates every open signal from the ones a coach can triage one by one', () => {
    expect(openSignalCount(groups)).toBe(3);
    expect(queueSignalCount(groups)).toBe(2);
    expect(rollupCount(groups)).toBe(1);
    // The table lists all three; the rail and the Queue column rank two. The
    // difference is exactly the roll-up count, which is what the readout
    // discloses rather than leaving the reader to find it.
    expect(tableEntries(groups)).toHaveLength(3);
    expect(queueEntries(groups)).toHaveLength(2);
  });

  it('keeps roll-ups out of the queue and out of the player column', () => {
    expect(queueEntries(groups).every((e) => e.signal.kind !== 'team_synthesis')).toBe(true);
    expect(playerRows(groups).map((r) => r.playerId)).toEqual(['p1']);
  });

  it('respects the queue cap in the order the grouping already produced', () => {
    const wide = [grp('p1', Array.from({ length: 10 }, (_, i) => sig({ id: `s${i}` })))];
    expect(queueEntries(wide)).toHaveLength(6);
    expect(queueEntries(wide)[0]!.signal.id).toBe('s0');
  });
});

describe('severityMix', () => {
  it('measures the same population the rail ranks', () => {
    const groups = [
      grp(null, [sig({ id: 'team:x', kind: 'team_synthesis', playerId: null, severity: 'urgent' })]),
      grp('p1', [sig({ id: 'a', severity: 'urgent' }), sig({ id: 'b', severity: 'low' })]),
    ];
    const mix = severityMix(groups);
    expect(mix.map((s) => s.count)).toEqual([1, 0, 0, 1]);
    expect(mix[0]!.pct).toBe(50);
  });

  it('reports zeroes rather than NaN for an empty queue', () => {
    expect(severityMix([]).every((s) => s.count === 0 && s.pct === 0)).toBe(true);
  });
});

/* ── The verdict ──────────────────────────────────────────────────────────── */

describe('buildIntelligenceVerdict', () => {
  const counts = { urgent: 0, playersFlagged: 0 };

  it('never says "all clear" about a read that failed', () => {
    const parts = buildIntelligenceVerdict({
      groupsError: 'Supabase timed out',
      groups: [],
      counts,
      outcomesAwaiting: 0,
      ...hrefs,
    });
    expect(parts.map((p) => p.text).join('')).toBe('Couldn’t load signals. Try again.');
    expect(parts.some((p) => p.href)).toBe(false);
  });

  it('still appends outcomes on the failure branch — that read is independent', () => {
    const parts = buildIntelligenceVerdict({
      groupsError: 'Supabase timed out',
      groups: [],
      counts,
      outcomesAwaiting: 2,
      ...hrefs,
    });
    expect(parts.map((p) => p.text).join('')).toContain('2 outcomes awaiting a resolved result.');
  });

  it('says all clear — and appends nothing — for a genuinely empty queue', () => {
    const parts = buildIntelligenceVerdict({
      groupsError: null,
      groups: [],
      counts,
      outcomesAwaiting: 4,
      ...hrefs,
    });
    expect(parts.map((p) => p.text).join('')).toBe('All clear. No open signals right now.');
  });

  it('links the urgent count and the leading player', () => {
    const groups = [grp('p1', [sig({ severity: 'urgent' })])];
    const parts = buildIntelligenceVerdict({
      groupsError: null,
      groups,
      counts: { urgent: 1, playersFlagged: 1 },
      outcomesAwaiting: 0,
      ...hrefs,
    });
    const text = parts.map((p) => p.text).join('');
    expect(text).toBe('1 urgent signal needs review across 1 player. Player p1 needs the most attention right now.');
    expect(parts.find((p) => p.text === '1 urgent')?.href).toBe('/x?filter=urgent');
    expect(parts.find((p) => p.text === 'Player p1')?.href).toBe('/golf/dashboard/roster/p1');
  });

  it('drops the second sentence when every urgent signal is team-level', () => {
    const groups = [grp(null, [sig({ severity: 'urgent', kind: 'team_synthesis', playerId: null })])];
    const parts = buildIntelligenceVerdict({
      groupsError: null,
      groups,
      counts: { urgent: 1, playersFlagged: 0 },
      outcomesAwaiting: 0,
      ...hrefs,
    });
    expect(parts.map((p) => p.text).join('')).toBe('1 urgent signal needs review across 0 players.');
  });

  it('reads calmly when nothing is urgent but a player leads', () => {
    const groups = [grp('p1', [sig({ severity: 'medium' })])];
    const parts = buildIntelligenceVerdict({ groupsError: null, groups, counts, outcomesAwaiting: 0, ...hrefs });
    expect(parts.map((p) => p.text).join('')).toBe(
      'Nothing urgent. Player p1 has the highest-priority open signal.',
    );
  });

  it('counts the queue when only team-level signals are open', () => {
    const groups = [grp(null, [sig({ kind: 'team_synthesis', playerId: null, severity: 'medium' })])];
    const parts = buildIntelligenceVerdict({ groupsError: null, groups, counts, outcomesAwaiting: 0, ...hrefs });
    expect(parts.map((p) => p.text).join('')).toBe('1 open signal to review. Nothing urgent right now.');
  });
});

/* ── Focus areas + small formatters ───────────────────────────────────────── */

describe('focusRows', () => {
  const areas = [
    { id: 'f1', player_id: 'p1', status: 'active', title: 'Lag putting' },
    { id: 'f2', player_id: 'p2', status: 'completed', title: 'Wedges' },
    { id: 'f3', player_id: 'p3', status: 'in_progress', title: '', area_type: 'short_game' },
  ];

  it('keeps only what is actually being worked on', () => {
    expect(focusRows(areas, { p1: 'Alex Rivera', p3: 'Cole Bennett' }).map((r) => r.id)).toEqual(['f1', 'f3']);
    expect(activeFocusCount(areas)).toBe(2);
  });

  it('falls back from a blank title to the area type, never to an empty row', () => {
    expect(focusRows(areas, {})[1]!.title).toBe('Short Game');
  });

  it('resolves a player name from the row when the map has no entry', () => {
    const [row] = focusRows(
      [{ id: 'f1', player_id: 'p9', status: 'active', title: 'x', player: { first_name: 'Dana', last_name: 'Kim' } }],
      {},
    );
    expect(row!.playerName).toBe('Dana Kim');
  });
});

describe('small formatters', () => {
  it('prints stroke magnitude to two places, and an honest gap for a null', () => {
    expect(formatSignalStrokes(-1.234)).toBe('1.23 str');
    expect(formatSignalStrokes(0)).toBe('0.00 str');
    expect(formatSignalStrokes(null)).toBeNull();
  });

  it('counts occurrences as the superseded rows plus the live one, blank when there are none', () => {
    expect(occurrencesOf(sig({ supersededCount: 3 }))).toBe(4);
    expect(occurrencesOf(sig({ supersededCount: 0 }))).toBeNull();
  });

  it('names the active filter so a filtered count never wears an unfiltered caption', () => {
    expect(filterLabel('all')).toBeNull();
    expect(filterLabel('urgent')).toBe('Urgent');
    expect(filterLabel('category:short_game')).toBe('Short Game');
  });

  it('restates the scan label without re-deriving it', () => {
    expect(compactScanAge('Last scan 3h ago')).toBe('3h ago');
    expect(compactScanAge('No scans yet')).toBe('Never');
  });
});
