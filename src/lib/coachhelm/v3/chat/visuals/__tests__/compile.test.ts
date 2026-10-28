import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { UIMessage } from 'ai';
import { buildAssistantTurn } from '@/clubhouse/data/coachhelm-chat-thread';
import type { Measurement, ToolEnvelope } from '../../provenance';
import { compileVisual } from '../compile';
import { ValidatedVisualArtifact, VisualSpec } from '../schema';

const NOW = new Date('2026-10-25T12:00:00.000Z');

function sg(metric: string, value: number | null, over: Partial<Measurement> = {}): Measurement {
  return {
    metric_id: metric,
    metric_label: `Strokes gained: ${metric.replace('sg_', '')}`,
    unit: 'strokes',
    value,
    entity: { kind: 'player', id: 'p1', label: 'Jonah Okafor' },
    window_start: '2026-09-01',
    window_end: '2026-10-20',
    sample_size: 8,
    sample_unit: 'rounds',
    as_of: '2026-10-21T00:00:00.000Z',
    coverage: 'complete',
    coverage_note: null,
    source: 'stats cache',
    method: 'sg v1',
    denominator: null,
    benchmark: null,
    direction: 'higher_better',
    ...over,
  };
}
const env = (measurements: Measurement[]): ToolEnvelope => ({ summary: 'x', measurements, series: [], detail: undefined, coverage: 'complete', coverage_note: null, as_of: '2026-10-21T00:00:00.000Z' });
const spec = (over: Record<string, unknown> = {}) => VisualSpec.parse({ kind: 'sg_anatomy', title: 'Where Jonah gains and loses', evidenceRefs: ['e1'], ...over });
const four = [sg('sg_tee', 0.2), sg('sg_approach', -0.9), sg('sg_around_green', 0.1), sg('sg_putting', -0.3), sg('sg_total', -0.9)];
const withE1 = (ms: Measurement[]) => new Map([['e1', env(ms)]]);

describe('compileVisual · sg_anatomy', () => {
  it('draws the four legs in a fixed order with their own samples, and says the legs add to the total', () => {
    const r = compileVisual(spec({ highlightedMetricId: 'sg_approach' }), withE1(four), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.artifact.legs.map((l) => l.metricId)).toEqual(['sg_tee', 'sg_approach', 'sg_around_green', 'sg_putting']);
    expect(r.artifact.legs[1]).toMatchObject({ value: -0.9, sampleSize: 8, sampleUnit: 'rounds' });
    expect(r.artifact.total).toEqual({ value: -0.9, sampleSize: 8, reconciles: true });
    expect(r.artifact.highlightedMetricId).toBe('sg_approach');
    expect(r.artifact.window).toEqual({ start: '2026-09-01', end: '2026-10-20' });
    expect(ValidatedVisualArtifact.safeParse(r.artifact).success).toBe(true);
  });

  it('flags a total the legs do not add to, and says nothing about one it was not given', () => {
    const off = compileVisual(spec(), withE1([...four.slice(0, 4), sg('sg_total', 0.8)]), NOW);
    expect(off.ok && off.artifact.total?.reconciles).toBe(false);
    const two = compileVisual(spec(), withE1([sg('sg_approach', -0.9), sg('sg_putting', -0.3), sg('sg_total', -1.2)]), NOW);
    expect(two.ok && two.artifact.total?.reconciles).toBeNull();
  });

  it('keeps the same hash for the same figures however often it is compiled', () => {
    const a = compileVisual(spec(), withE1(four), NOW);
    const b = compileVisual(spec({ title: 'A different title' }), withE1([...four].reverse()), new Date('2026-10-26T00:00:00Z'));
    expect(a.ok && b.ok && a.artifact.dataHash === b.artifact.dataHash && a.artifact.artifactId === b.artifact.artifactId).toBe(true);
    const changed = compileVisual(spec(), withE1([sg('sg_tee', 0.3), ...four.slice(1)]), NOW);
    expect(changed.ok && a.ok && changed.artifact.dataHash !== a.artifact.dataHash).toBe(true);
  });

  it('refuses a ref the server never issued', () => {
    const r = compileVisual(spec({ evidenceRefs: ['e9'] }), withE1(four), NOW);
    expect(r).toMatchObject({ ok: false, reason: 'unknown_evidence' });
  });

  it('refuses two players, two windows, two values for one leg, one leg, and a failed read', () => {
    expect(compileVisual(spec(), withE1([...four.slice(0, 3), sg('sg_putting', -0.3, { entity: { kind: 'player', id: 'p2', label: 'Eli' } })]), NOW)).toMatchObject({ reason: 'mixed_players' });
    expect(compileVisual(spec(), withE1([...four.slice(0, 3), sg('sg_putting', -0.3, { window_end: '2026-10-01' })]), NOW)).toMatchObject({ reason: 'mixed_windows' });
    expect(compileVisual(spec({ evidenceRefs: ['e1', 'e2'] }), new Map([['e1', env(four)], ['e2', env([sg('sg_putting', -0.5)])]]), NOW)).toMatchObject({ reason: 'conflicting_values' });
    expect(compileVisual(spec(), withE1([sg('sg_approach', -0.9)]), NOW)).toMatchObject({ reason: 'not_enough_legs' });
    expect(compileVisual(spec(), withE1([...four.slice(0, 3), sg('sg_putting', -0.3, { coverage: 'unavailable' })]), NOW)).toMatchObject({ reason: 'unavailable' });
  });

  it('never plots a leg whose value is missing, and calls partial data partial', () => {
    const r = compileVisual(spec(), withE1([sg('sg_tee', 0.2), sg('sg_approach', null), sg('sg_putting', -0.3, { coverage: 'partial', coverage_note: 'Awaiting a refresh.' })]), NOW);
    expect(r.ok && r.artifact.legs.map((l) => l.metricId)).toEqual(['sg_tee', 'sg_putting']);
    expect(r.ok && r.artifact.coverage).toBe('partial');
  });

  it('drops a note that carries a figure of its own or names a leg that is not drawn', () => {
    const r = compileVisual(
      spec({ annotations: [{ metricId: 'sg_approach', kind: 'association', label: 'Down 0.9 a round' }, { metricId: 'sg_approach', kind: 'hypothesis', label: 'Worth testing from the rough' }, { metricId: 'sg_total', kind: 'measured', label: 'The whole game' }] }),
      withE1(four),
      NOW,
    );
    expect(r.ok && r.artifact.annotations).toEqual([{ metricId: 'sg_approach', kind: 'hypothesis', label: 'Worth testing from the rough' }]);
  });

  it('refuses a title that carries a figure: every number on screen comes from the reads', () => {
    for (const title of ['Approach costs 0.9 a round', 'Last 8 rounds', 'Top 3 losses']) {
      expect(compileVisual(spec({ title }), withE1(four), NOW)).toMatchObject({ ok: false, reason: 'figure_in_text' });
    }
    const words = compileVisual(spec({ title: 'Where Jonah gains and loses' }), withE1(four), NOW);
    expect(words.ok && words.artifact.title).toBe('Where Jonah gains and loses');
  });
});

describe('compileVisual · the reads an artifact stands in for', () => {
  const teamRounds = env([
    { ...sg('avg_score', 74.2), metric_label: 'Average score', unit: 'strokes', entity: { kind: 'team', id: 't1', label: 'Team' } } as Measurement,
  ]);

  it('names only the reads it plotted, so a read named alongside keeps its evidence block', () => {
    const r = compileVisual(spec({ evidenceRefs: ['e1', 'e2'] }), new Map([['e1', env(four)], ['e2', teamRounds]]), NOW);
    expect(r.ok && r.artifact.evidenceRefs).toEqual(['e1']);
  });

  it('keeps a read that holds anything the chart does not draw: another metric, a missing leg, a series', () => {
    const extra = compileVisual(spec(), withE1([...four, { ...sg('gir_pct', 61), unit: 'percent' }]), NOW);
    expect(extra.ok && extra.artifact.evidenceRefs).toEqual([]);
    const missing = compileVisual(spec(), withE1([sg('sg_tee', 0.2), sg('sg_approach', null), sg('sg_putting', -0.3)]), NOW);
    expect(missing.ok && missing.artifact.evidenceRefs).toEqual([]);
    const series = compileVisual(spec(), new Map([['e1', { ...env(four), series: [{} as ToolEnvelope['series'][number]] }]]), NOW);
    expect(series.ok && series.artifact.evidenceRefs).toEqual([]);
  });

  it('a read the total came from counts as drawn, and a ref named twice is named once', () => {
    const r = compileVisual(spec({ evidenceRefs: ['e1', 'e2', 'e1'] }), new Map([['e1', env(four.slice(0, 4))], ['e2', env([sg('sg_total', -0.9)])]]), NOW);
    expect(r.ok && r.artifact.evidenceRefs).toEqual(['e1', 'e2']);
  });

  it('in the thread, the team rounds read named alongside stays on screen beside the visual', () => {
    const r = compileVisual(spec({ evidenceRefs: ['e1', 'e2'] }), new Map([['e1', env(four)], ['e2', teamRounds]]), NOW);
    if (!r.ok) throw new Error('compiled artifact expected');
    const part = (id: string, ref: string, envelope: ToolEnvelope) => ({ type: 'data-evidence', id, data: { tool: 'get_player_metrics', envelope, ref } });
    const message = {
      id: 'a1',
      role: 'assistant',
      parts: [part('x1', 'e1', env(four)), part('x2', 'e2', teamRounds), { type: 'data-visual-artifact', id: 'visual-1', data: r.artifact }],
    } as unknown as UIMessage;
    const turn = buildAssistantTurn(message, { isLast: false, busy: false });
    if (turn.role !== 'assistant') throw new Error('assistant turn expected');
    expect(turn.blocks.map((b) => (b.kind === 'evidence' ? `evidence:${b.envelope.measurements[0]?.metric_id}` : b.kind))).toEqual(['evidence:avg_score', 'visual']);
  });
});
