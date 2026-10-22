import { describe, expect, it } from 'vitest';
import {
  clearedLine,
  lifecycleWordOf,
  shapeLifecycle,
  shortDate,
  strategyPairLines,
  underReviewLine,
  type ShapeableRead,
} from '../delivery-shape';
import type { ConflictRecord, RecheckRecord } from '../types';

const NOW = '2026-10-20T12:00:00.000Z';

const cleared: RecheckRecord = {
  window: 'newest_15_rounds',
  rounds_n: 15,
  recent_value: 75.9,
  recent_n: 29,
  recent_unit: 'putts',
  recent_lower_90: 64.5,
  recent_upper_90: 84.6,
  old_value: 62,
  old_n: 95,
  benchmark: 72,
  polarity: 'higher_better',
  outcome: 'cleared',
  min_n: 20,
  computed_at: '2026-10-12T03:00:00.000Z',
};

function r(id: string, evidence: Record<string, unknown> = {}): ShapeableRead {
  return { id, title: `Read ${id}`, lifecycle_state: 'detected', evidence: { metric: 'putts_made_3_5ft_pct', metric_label: '4–6 ft putts', ...evidence } };
}

const strategy = (with_insight_id: string, computed_at = '2026-10-18T03:00:00.000Z'): ConflictRecord => ({
  with_insight_id,
  kind: 'opposing_strategy',
  role: 'paired',
  net_strokes: 0.9,
  resolution: 'net_favours_driver',
  subject: 'driver_vs_penalties',
  link: { penalties: 7, penalties_after_driver: 5, rounds_n: 9 },
  computed_at,
});

describe('lines', () => {
  it('shortDate', () => {
    expect(shortDate('2026-10-12T03:00:00.000Z')).toBe('Oct 12');
    expect(shortDate('2026-10-12')).toBe('Oct 12');
    expect(shortDate(null)).toBeNull();
  });

  it('Cleared line, both voices, with the counts (04 Example 5)', () => {
    expect(clearedLine(r('a', { recheck: cleared }), 'coach')).toBe(
      "4–6 ft putts · Cleared Oct 12 — 22 of the last 29 (76%), at or past the benchmark's 72%. Was 62% over 95. Stays here two more checks, then moves to history.",
    );
    expect(clearedLine(r('a', { recheck: cleared }), 'player')).toBe(
      "4–6 ft putts · Cleared — 22 of your last 29 (76%). That one's fixed. It stays here for two more checks so we're sure.",
    );
    expect(clearedLine(r('a', { recheck: { ...cleared, outcome: 'holds' } }), 'coach')).toBeNull();
  });

  it('Under review lines never claim a mechanism and keep the numbers', () => {
    const wrong = { reason: 'wrong_cause' as const, since: '2026-10-14T00:00:00.000Z' };
    expect(underReviewLine(wrong, 'coach')).toBe('Under review — the cause was marked wrong on Oct 14. The numbers stand; the why is being rechecked at the next checkpoint.');
    expect(underReviewLine(wrong, 'player')).toBe("Under review — your coach is checking the why. The numbers haven't changed.");
    expect(underReviewLine({ reason: 'integrity', since: NOW, round_ids: ['x', 'y'] }, 'coach')).toContain('2 rounds in this read have hole scores');
  });

  it('strategy pair lines carry the counted link and the net', () => {
    const lines = strategyPairLines(strategy('p'), 'coach');
    expect(lines).toContain('5 of 7 penalties in the last 9 rounds came right after a driver tee shot.');
    expect(lines).toContain('Net still favours driver, by about 0.9 strokes a round.');
    expect(strategyPairLines({ ...strategy('p'), net_strokes: null, resolution: 'net_unknown' }, 'player').at(-1)).toBe(
      'Talk to your coach about where to lay back off the tee.',
    );
  });

  it('lifecycle word priority', () => {
    expect(lifecycleWordOf({ recheck: cleared, under_review: { reason: 'integrity', since: NOW } })).toBe('Cleared');
    expect(lifecycleWordOf({ conflict: strategy('p') })).toBe('Contradicted');
    expect(lifecycleWordOf({ under_review: { reason: 'integrity', since: NOW } })).toBe('Under review');
    expect(lifecycleWordOf({})).toBeNull();
  });
});

describe('shapeLifecycle', () => {
  it('Cleared reads move to the Cleared list; a strategy pair becomes one item in the slot of the higher-ranked read', () => {
    const ranked = [
      r('x'),
      r('tee', { metric: 'sg_ott', conflict: strategy('pen') }),
      r('c', { recheck: cleared }),
      r('pen', { metric: 'penalty_rate_per_round', conflict: strategy('tee') }),
      r('u', { under_review: { reason: 'wrong_cause', since: NOW } }),
    ];
    const out = shapeLifecycle(ranked, 'coach', NOW);
    expect(out.cleared.map((c) => c.read.id)).toEqual(['c']);
    expect(out.items.map((i) => (i.kind === 'read' ? i.read.id : `pair:${i.reads.map((x) => x.id).join('+')}`))).toEqual([
      'x',
      'pair:tee+pen',
      'u',
    ]);
    const pair = out.items[1]!;
    expect(pair.kind === 'contradicted' && pair.net_strokes).toBe(0.9);
    const u = out.items[2]!;
    expect(u.kind === 'read' && u.word).toBe('Under review');
  });

  it('Contradicted is coach-first: within a day the player sees the two reads unpaired', () => {
    const fresh = '2026-10-20T03:00:00.000Z';
    const ranked = [r('tee', { conflict: strategy('pen', fresh) }), r('pen', { conflict: strategy('tee', fresh) })];
    expect(shapeLifecycle(ranked, 'player', NOW).items.every((i) => i.kind === 'read' && i.word === null)).toBe(true);
    expect(shapeLifecycle(ranked, 'coach', NOW).items[0]!.kind).toBe('contradicted');
    expect(shapeLifecycle(ranked, 'player', '2026-10-21T04:00:00.000Z').items[0]!.kind).toBe('contradicted');
  });

  it('an opposing_direction winner carries the word; a retired loser or an archived row never shows', () => {
    const win: ConflictRecord = { with_insight_id: 'old', kind: 'opposing_direction', role: 'winner', net_strokes: null, resolution: 'newest_wins', subject: 's', computed_at: '2026-10-10T00:00:00Z' };
    const ranked = [
      r('new', { conflict: win, your_value: 78, comparison_value: 72, your_value_display: '78%' }),
      r('old', { conflict: { ...win, role: 'retired', with_insight_id: 'new' } }),
      { ...r('arch'), lifecycle_state: 'archived' },
    ];
    const out = shapeLifecycle(ranked, 'coach', NOW);
    expect(out.items).toHaveLength(1);
    const item = out.items[0]!;
    expect(item.kind === 'read' && item.word).toBe('Contradicted');
    expect(item.kind === 'read' && item.line).toContain('Going with the newer read; the older one is retired.');
  });
});
