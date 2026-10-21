import { describe, expect, it } from 'vitest';
import {
  countDriverPenaltyLink,
  directionOf,
  isSupported,
  pairReads,
  subjectOf,
  type LinkShot,
} from '../contradiction';
import { NOW, read } from './fixtures';

const LINK = { penalties: 7, penalties_after_driver: 5, rounds_n: 9 };

function tee(id: string, pattern: 'sharp' | 'laggy', extra: Record<string, unknown> = {}) {
  return read(
    id,
    { insight_type: 'tee_strategy', signature: `tee_strategy:${pattern}`, title: 'Driver' },
    { metric: 'sg_ott', metric_label: 'Tee Strategy', polarity: 'higher_better', your_value: 55, comparison_value: 50, sample_n: 42, ...extra },
  );
}

function penalty(id: string, your: number, extra: Record<string, unknown> = {}) {
  return read(
    id,
    { insight_type: 'course_management', signature: 'course_management:penalty', title: 'Penalties' },
    { metric: 'penalty_rate_per_round', metric_label: 'Penalties a round', unit: 'count', your_value: your, comparison_value: 0.35, sample_n: 9, strokes_impact: 0.6, ...extra },
  );
}

describe('directionOf / subjectOf / isSupported', () => {
  it('reads the side of the benchmark with polarity', () => {
    expect(directionOf(read('a'))).toBe('worse'); // 62 vs 72, higher better
    expect(directionOf(read('a', {}, { your_value: 80 }))).toBe('better');
    expect(directionOf(read('a', {}, { your_value: 72 }))).toBeNull();
    expect(directionOf(penalty('p', 0.78))).toBe('worse'); // lower better
    expect(directionOf(penalty('p', 0.2))).toBe('better');
  });

  it('tee strategy direction comes from the signature', () => {
    expect(directionOf(tee('t', 'sharp'))).toBe('better');
    expect(directionOf(tee('t', 'laggy'))).toBe('worse');
    expect(directionOf(read('t', { insight_type: 'tee_strategy', signature: 'tee_strategy:inconclusive' }))).toBeNull();
  });

  it('subject folds v2 par aliases like the delivery dedupe', () => {
    expect(subjectOf(read('a', {}, { metric: 'par_scoring_par4' }))).toBe('scoring_par_4');
    expect(subjectOf(read('a', {}, { metric: 'Putts_Made_3_5ft_pct' }))).toBe('putts_made_3_5ft_pct');
  });

  it('supported = visible, at the family floor, and q <= 0.10 when Slice 1 has written it', () => {
    expect(isSupported(read('a'))).toBe(true);
    expect(isSupported(read('a', { lifecycle_state: 'tentative' }))).toBe(false);
    expect(isSupported(read('a', { dismissed: true }))).toBe(false);
    expect(isSupported(read('a', {}, { sample_n: 19 }))).toBe(false);
    expect(isSupported(read('a', {}, { support: { q_adj: 0.2 } }))).toBe(false);
    expect(isSupported(read('a', {}, { support: { q_adj: 0.05 } }))).toBe(true);
  });
});

describe('pairReads: opposing_direction', () => {
  it('newest supported read wins; the older opposite read is retired; both carry conflict', () => {
    const older = read('old', {}, { your_value: 62, window_end: '2026-08-01' });
    const newer = read('new', { signature: 'composite:x' }, { your_value: 78, window_end: '2026-10-15' });
    const { conflicts, retire } = pairReads([older, newer], null, NOW);
    expect([...retire]).toEqual(['old']);
    expect(conflicts.get('old')).toMatchObject({ with_insight_id: 'new', kind: 'opposing_direction', role: 'retired', resolution: 'newest_wins', subject: 'putts_made_3_5ft_pct' });
    expect(conflicts.get('new')).toMatchObject({ with_insight_id: 'old', role: 'winner' });
  });

  it('no pairing when the newer read does not clear the floor', () => {
    const older = read('old', {}, { your_value: 62, window_end: '2026-08-01' });
    const newer = read('new', {}, { your_value: 78, window_end: '2026-10-15', sample_n: 12 });
    const { conflicts, retire } = pairReads([older, newer], null, NOW);
    expect(retire.size).toBe(0);
    expect(conflicts.size).toBe(0);
  });

  it('same direction or different subjects never pair', () => {
    const a = read('a', {}, { window_end: '2026-08-01' });
    const b = read('b', {}, { window_end: '2026-10-15' });
    const c = read('c', {}, { metric: 'putts_made_5_10ft_pct', your_value: 80, comparison_value: 60 });
    expect(pairReads([a, b, c], null, NOW).conflicts.size).toBe(0);
  });
});

describe('pairReads: opposing_strategy (04 Example 7)', () => {
  it('driver favoured + penalty leak + counted link → both paired, net unknown without a gain estimate', () => {
    const { conflicts, retire } = pairReads([tee('t', 'sharp'), penalty('p', 0.78)], LINK, NOW);
    expect(retire.size).toBe(0);
    expect(conflicts.get('t')).toMatchObject({ kind: 'opposing_strategy', role: 'paired', with_insight_id: 'p', resolution: 'net_unknown', net_strokes: null, subject: 'driver_vs_penalties', link: LINK });
    expect(conflicts.get('p')).toMatchObject({ with_insight_id: 't' });
  });

  it('net strokes when the tee read carries a gain a round', () => {
    const { conflicts } = pairReads([tee('t', 'sharp', { detail: { driver_strokes_gained_per_round: 1.5 } }), penalty('p', 0.78)], LINK, NOW);
    expect(conflicts.get('t')).toMatchObject({ net_strokes: 0.9, resolution: 'net_favours_driver' });
    const { conflicts: c2 } = pairReads([tee('t', 'sharp', { detail: { driver_strokes_gained_per_round: 0.2 } }), penalty('p', 0.78)], LINK, NOW);
    expect(c2.get('p')).toMatchObject({ net_strokes: -0.4, resolution: 'net_favours_layback' });
  });

  it('no pair without the counted link, with a laggy driver, or when penalties are fine', () => {
    expect(pairReads([tee('t', 'sharp'), penalty('p', 0.78)], null, NOW).conflicts.size).toBe(0);
    expect(pairReads([tee('t', 'sharp'), penalty('p', 0.78)], { penalties: 7, penalties_after_driver: 3, rounds_n: 9 }, NOW).conflicts.size).toBe(0);
    expect(pairReads([tee('t', 'sharp'), penalty('p', 0.78)], { penalties: 20, penalties_after_driver: 5, rounds_n: 9 }, NOW).conflicts.size).toBe(0);
    expect(pairReads([tee('t', 'laggy'), penalty('p', 0.78)], LINK, NOW).conflicts.size).toBe(0);
    expect(pairReads([tee('t', 'sharp'), penalty('p', 0.2)], LINK, NOW).conflicts.size).toBe(0);
  });
});

describe('countDriverPenaltyLink', () => {
  const s = (round: string, hole: number, n: number, type: string, club: string | null = null, isPenalty: boolean | null = null): LinkShot => ({
    round_id: round,
    hole_number: hole,
    shot_number: n,
    shot_type: type,
    club_type: club,
    is_penalty: isPenalty,
  });

  it('counts penalties and the ones right after a driver tee shot, in the given rounds', () => {
    const shots = [
      s('r0', 4, 1, 'tee', 'driver'),
      s('r0', 4, 2, 'penalty', 'non_driver'),
      s('r0', 7, 1, 'tee', 'non_driver'),
      s('r0', 7, 2, 'penalty'),
      s('r1', 11, 2, 'approach', null, true),
      s('r1', 11, 1, 'tee', 'driver'),
      s('r9', 4, 1, 'tee', 'driver'),
      s('r9', 4, 2, 'penalty'),
    ];
    expect(countDriverPenaltyLink(shots, new Set(['r0', 'r1']))).toEqual({ penalties: 3, penalties_after_driver: 2, rounds_n: 2 });
  });
});
