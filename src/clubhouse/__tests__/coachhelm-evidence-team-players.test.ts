import { describe, expect, it } from 'vitest';
import type { Measurement, ToolEnvelope } from '../../lib/coachhelm/v3/chat/provenance';
import { evidenceBlocks } from '../data/coachhelm-chat-thread';

/**
 * W49 (preview, 12 Nov): "Who's our best putter?" read team stats, which carry the team's own figures and each player's
 * putting. Mixed, it drew as a many-measure comparison table with one column. The players are a ranking; the team is its own card.
 */
const TEAM = { kind: 'team' as const, id: 't1', label: 'Test Team' };
const player = (i: number) => ({ kind: 'player' as const, id: `p${i}`, label: `Player ${String.fromCharCode(64 + i)}` });
function m(metric_id: string, value: number, entity: Measurement['entity'], over: Partial<Measurement> = {}): Measurement {
  return { metric_id, metric_label: metric_id, unit: 'strokes', value, entity, window_start: '2026-08-01', window_end: '2026-11-11', sample_size: 10, sample_unit: 'rounds', as_of: '2026-11-12T00:00:00.000Z', coverage: 'complete', coverage_note: null, source: 'rounds', method: 'test', denominator: null, benchmark: null, direction: 'higher_better', ...over };
}
const env = (measurements: Measurement[]): ToolEnvelope => ({ summary: 'Test Team: Team Stats, last 10 rounds.', measurements, series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-12T00:00:00.000Z' });

const teamFigures = [m('scoring_average', 75.8, TEAM, { unit: 'score', direction: 'lower_better' }), m('gir_pct', 54, TEAM, { unit: 'percent' }), m('sg_putting', -3.03, TEAM)];
const putting = [1, 2, 3, 4, 5].map((i) => m('sg_putting', -1.9 - i / 10, player(i)));

describe('a team read that lists each player on one measure', () => {
  it('ranks the players, and draws the team figures as their own card, never a one-column comparison', () => {
    const blocks = evidenceBlocks(env([...teamFigures, ...putting]));
    expect(blocks.map((b) => b.kind)).not.toContain('compare');
    expect(blocks[0]?.kind).toBe('ranking');
    expect(blocks[0]?.kind === 'ranking' && blocks[0].rows.map((r) => r.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(blocks.length).toBeGreaterThan(1);
  });

  it('players on two measures are still a comparison', () => {
    const two = [...putting, ...[1, 2, 3].map((i) => m('sg_tee', 0.1 * i, player(i)))];
    expect(evidenceBlocks(env([...teamFigures, ...two])).map((b) => b.kind)).toContain('compare');
  });

  it('a team with only two players beside it is left as it was', () => {
    const before = evidenceBlocks(env([...teamFigures, ...putting.slice(0, 2)]));
    expect(before.some((b) => b.kind === 'ranking')).toBe(false);
  });
});
