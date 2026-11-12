import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import type { Measurement, ToolEnvelope } from '../../lib/coachhelm/v3/chat/provenance';
import { buildTurns, focusComparison, followUpsFor, suggestionsOf } from '../data/coachhelm-chat-thread';
import { scopeWho } from '../screens/coachhelm/chat/ask-scope-window';

/**
 * #17 (staging, 11 Nov): "Compare Cole Bennett and Jackson Hale off the tee." The scope line named Cole alone, the card under the
 * answer was a 29-row table of every Stats measure, and the next steps offered putting work for Cole. Names are replaced.
 */
const A = { kind: 'player' as const, id: 'pa', label: 'Player A' };
const B = { kind: 'player' as const, id: 'pb', label: 'Player B' };
const METRICS = ['scoring_average', 'sg_total', 'sg_tee', 'sg_approach', 'sg_around_green', 'sg_putting', 'driving_accuracy_pct', 'penalties_per_round', 'gir_pct', 'putts_per_round', 'make_3_5_ft', 'scrambling_pct', 'sand_save_pct', 'proximity_50_125_yd'];
function m(metric_id: string, entity: Measurement['entity'], value = 1): Measurement {
  return { metric_id, metric_label: metric_id, unit: 'strokes', value, entity, window_start: '2026-08-01', window_end: '2026-10-21', sample_size: 8, sample_unit: 'rounds', as_of: '2026-11-11T00:00:00.000Z', coverage: 'complete', coverage_note: null, source: 'rounds', method: 'test', denominator: null, benchmark: null, direction: 'higher_better' };
}
const stats: ToolEnvelope = { summary: 'Player A, Player B: Stats, last 10 rounds.', measurements: METRICS.flatMap((id) => [m(id, A), m(id, B)]), series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-11T00:00:00.000Z' };
const metricsOf = (e: ToolEnvelope) => [...new Set(e.measurements.map((x) => x.metric_id))];

describe('the scope line names everyone the question names', () => {
  const names = ['Ava Stone', 'Ben Cruz', 'Cal Reed'];
  it('two players, in the question\'s order', () => {
    expect(scopeWho('Compare Ben Cruz and Ava off the tee', 'Test Team', names)).toBe('Ben Cruz and Ava Stone');
  });
  it('one player, or the team when nobody or three are named', () => {
    expect(scopeWho('How is Ava Stone putting?', 'Test Team', names)).toBe('Ava Stone');
    expect(scopeWho('How is the team putting?', 'Test Team', names)).toBe('Test Team');
    expect(scopeWho('Ava, Ben and Cal on approach', 'Test Team', names)).toBe('Test Team');
  });
});

describe('the comparison card shows what the question is about', () => {
  it('"off the tee" keeps the tee measures', () => {
    expect(metricsOf(focusComparison(stats, 'Compare Player A and Player B off the tee.'))).toEqual(['sg_tee', 'driving_accuracy_pct', 'penalties_per_round']);
  });
  it('putting keeps the putting measures', () => {
    expect(metricsOf(focusComparison(stats, 'Who putts better, Player A or Player B?'))).toEqual(['sg_putting', 'putts_per_round', 'make_3_5_ft']);
  });
  it('a question with no subject keeps scoring and strokes gained', () => {
    expect(metricsOf(focusComparison(stats, 'Compare Player A and Player B'))).toEqual(['scoring_average', 'sg_total', 'sg_tee', 'sg_approach', 'sg_around_green', 'sg_putting']);
  });
  it('one player, or a short read, is left whole', () => {
    const one = { ...stats, measurements: stats.measurements.filter((x) => x.entity.id === 'pa') };
    expect(focusComparison(one, 'off the tee')).toBe(one);
    const short = { ...stats, measurements: stats.measurements.slice(0, 6) };
    expect(focusComparison(short, 'off the tee')).toBe(short);
  });
  it('in the thread, the card is narrowed and Sources keeps the whole read', () => {
    const messages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Compare Player A and Player B off the tee.' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'data-evidence', id: 'x1', data: { tool: 'get_player_stats', ref: 'e1', envelope: stats } }, { type: 'text', text: 'Player B is better off the tee.' }] },
    ] as unknown as UIMessage[];
    const turn = buildTurns(messages, { busy: false }).at(-1);
    if (!turn || turn.role !== 'assistant') throw new Error('assistant turn expected');
    const card = turn.blocks.find((b) => b.kind === 'evidence');
    expect(card?.kind === 'evidence' && metricsOf(card.envelope)).toEqual(['sg_tee', 'driving_accuracy_pct', 'penalties_per_round']);
    expect(turn.reads?.[0]?.envelope.measurements).toHaveLength(METRICS.length * 2);
  });
});

describe('next steps', () => {
  it('a comparison of two players offers no step for the first of them alone', () => {
    expect(followUpsFor([stats])).toEqual([]);
  });
  it('the server\'s suggestions are used: the label shown, the prompt sent', () => {
    const parts = [{ type: 'data-suggestions', id: 'suggestions', data: { items: [{ kind: 'read', label: 'Fairways by round', prompt: 'Show Player A and Player B fairways round by round.' }] } }];
    expect(suggestionsOf(parts)).toEqual([{ label: 'Fairways by round', prompt: 'Show Player A and Player B fairways round by round.' }]);
    const messages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Compare Player A and Player B off the tee.' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'data-evidence', id: 'x1', data: { tool: 'get_player_stats', ref: 'e1', envelope: stats } }, { type: 'text', text: 'Player B is better.' }, ...parts] },
    ] as unknown as UIMessage[];
    const turn = buildTurns(messages, { busy: false }).at(-1);
    expect(turn?.role === 'assistant' && [turn.followUps, turn.followUpPrompts]).toEqual([['Fairways by round'], ['Show Player A and Player B fairways round by round.']]);
  });
  it('no suggestions part: the evidence-based steps; an empty one: none', () => {
    expect(suggestionsOf([{ type: 'text' }])).toBeNull();
    expect(suggestionsOf([{ type: 'data-suggestions', data: { items: [] } }])).toEqual([]);
  });
});
