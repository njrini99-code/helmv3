import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { Measurement, MeasurementSeries, ToolEnvelope } from '../../provenance';
import { compileComposition } from '../compile-composition';
import { CompositionSpec, ValidatedComposition } from '../composition';

const NOW = new Date('2026-10-29T12:00:00.000Z');
const P1 = { kind: 'player' as const, id: 'p1', label: 'Maya Chen' };
const P2 = { kind: 'player' as const, id: 'p2', label: 'Jules Ortega' };

function m(metric_id: string, value: number | null, over: Partial<Measurement> = {}): Measurement {
  return {
    metric_id,
    metric_label: metric_id,
    unit: 'score',
    value,
    entity: P1,
    window_start: '2026-05-18',
    window_end: '2026-09-26',
    sample_size: 12,
    sample_unit: 'rounds',
    as_of: '2026-10-27T00:00:00.000Z',
    coverage: 'complete',
    coverage_note: null,
    source: 'rounds',
    method: 'test',
    denominator: null,
    benchmark: null,
    direction: 'lower_better',
    ...over,
  };
}

function series(metric_id: string, values: number[], over: Partial<MeasurementSeries> = {}): MeasurementSeries {
  return {
    metric_id,
    metric_label: metric_id,
    unit: 'score',
    entity: P1,
    points: values.map((value, i) => ({ at: `2026-06-${String(i + 10)}`, value, bucket: null, sample_size: 1 })),
    window_start: '2026-05-18',
    window_end: '2026-09-26',
    as_of: '2026-10-27T00:00:00.000Z',
    coverage: 'complete',
    coverage_note: null,
    source: 'rounds',
    method: 'test',
    benchmark: null,
    direction: 'lower_better',
    ...over,
  };
}

const env = (over: Partial<ToolEnvelope>): ToolEnvelope => ({
  summary: 'x',
  measurements: [],
  series: [],
  coverage: 'complete',
  coverage_note: null,
  as_of: '2026-10-27T00:00:00.000Z',
  ...over,
});

const spec = (blocks: unknown[], over: Record<string, unknown> = {}) =>
  CompositionSpec.parse({ title: 'How Maya is scoring', blocks, ...over });

const trendRead = env({ measurements: [m('scoring_average_mean', 73.2)], series: [series('scoring_average', [76, 74, 73, 71])] });
const sgRead = env({
  measurements: [
    m('sg_tee', 0.6, { unit: 'strokes', direction: 'higher_better' }),
    m('sg_approach', -1.2, { unit: 'strokes', direction: 'higher_better' }),
    m('sg_putting', -0.4, { unit: 'strokes', direction: 'higher_better' }),
    m('sg_total', -1.0, { unit: 'strokes', direction: 'higher_better' }),
  ],
});
const teamRead = env({
  measurements: [m('scoring_average', 74.2, { entity: P2 }), m('scoring_average', 72.6), m('scoring_average', 75.1, { entity: { kind: 'player', id: 'p3', label: 'Ava' } })],
});
const reads = new Map<string, ToolEnvelope>([
  ['e1', trendRead],
  ['e2', sgRead],
  ['e3', teamRead],
]);

describe('compileComposition', () => {
  it('draws a model-designed composition with every figure copied from the reads', () => {
    const r = compileComposition(
      spec(
        [
          { type: 'headline', ref: 'e2', metricId: 'sg_approach', label: 'Biggest leak' },
          { type: 'trend', ref: 'e1' },
          { type: 'split', refs: ['e2'] },
          { type: 'bars', ref: 'e3', order: 'best_first', highlight: 'Maya Chen' },
          { type: 'note', kind: 'association', text: 'Her approach misses track the scoring jumps.' },
        ],
        { lede: 'Scoring is improving while approach play still leaks.', layout: 'split' },
      ),
      reads,
      NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dropped).toEqual([]);
    expect(r.composition.blocks.map((b) => b.type)).toEqual(['headline', 'trend', 'split', 'ranking', 'note']);
    const head = r.composition.blocks[0];
    expect(head?.type === 'headline' && head.measurement.value).toBe(-1.2);
    const split = r.composition.blocks[2];
    // The total is the whole, not a part.
    expect(split?.type === 'split' && split.measurements.map((x) => x.metric_id)).toEqual(['sg_tee', 'sg_approach', 'sg_putting']);
    const rank = r.composition.blocks[3];
    expect(rank?.type === 'ranking' && rank.order).toBe('best_first');
    expect(rank?.type === 'ranking' && rank.highlight).toBe('p1');
    expect(ValidatedComposition.safeParse(r.composition).success).toBe(true);
  });

  it('refuses a figure in the title or lede', () => {
    expect(compileComposition(spec([{ type: 'trend', ref: 'e1' }], { title: 'Down 4 strokes' }), reads, NOW)).toMatchObject({ ok: false, reason: 'figure_in_text' });
    expect(compileComposition(spec([{ type: 'trend', ref: 'e1' }], { lede: 'She shot 71.' }), reads, NOW)).toMatchObject({ ok: false, reason: 'figure_in_text' });
  });

  it('drops blocks it cannot draw honestly and says why', () => {
    const short = new Map([...reads, ['e4', env({ series: [series('putts', [31, 30])] })]]);
    const r = compileComposition(
      spec([
        { type: 'trend', ref: 'e1' },
        { type: 'trend', ref: 'e4' },
        { type: 'headline', ref: 'e9', metricId: 'x' },
        { type: 'note', kind: 'measured', text: 'Down 4 since May.' },
        { type: 'compare', refs: ['e1'] },
      ]),
      short,
      NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.composition.blocks.map((b) => b.type)).toEqual(['trend']);
    expect(r.dropped).toHaveLength(4);
    expect(r.dropped.join(' ')).toMatch(/at least 3 rounds/);
    expect(r.dropped.join(' ')).toMatch(/no usable read named e9/);
    expect(r.dropped.join(' ')).toMatch(/may not contain a number/);
    expect(r.dropped.join(' ')).toMatch(/at least two players/);
  });

  it('refuses when nothing but notes is left', () => {
    const r = compileComposition(spec([{ type: 'note', kind: 'hypothesis', text: 'Maybe fatigue.' }, { type: 'trend', ref: 'e9' }]), reads, NOW);
    expect(r).toMatchObject({ ok: false, reason: 'nothing_to_draw' });
  });

  it('never orders best-first without a direction, and ignores a highlight that is not in the data', () => {
    const noDir = new Map([['e3', env({ measurements: teamRead.measurements.map((x) => ({ ...x, direction: null })) })]]);
    const r = compileComposition(spec([{ type: 'bars', ref: 'e3', order: 'best_first', highlight: 'Nobody' }]), noDir, NOW);
    const b = r.ok ? r.composition.blocks[0] : null;
    expect(b?.type === 'ranking' && b.order).toBe('as_read');
    expect(b?.type === 'ranking' && b.highlight).toBeNull();
  });

  it('falls back to the average when asked for a benchmark the read does not have', () => {
    const r = compileComposition(spec([{ type: 'trend', ref: 'e1', reference: 'benchmark' }]), reads, NOW);
    const b = r.ok ? r.composition.blocks[0] : null;
    expect(b?.type === 'trend' && b.reference).toBe('average');
  });

  it('hides only the reads it draws in full, and keeps their coverage notes', () => {
    const partial = new Map([...reads, ['e1', { ...trendRead, coverage: 'partial' as const, coverage_note: 'Two rounds have no score.' }]]);
    const r = compileComposition(spec([{ type: 'trend', ref: 'e1' }, { type: 'headline', ref: 'e2', metricId: 'sg_tee' }]), partial, NOW);
    expect(r.ok && r.composition.evidenceRefs).toEqual(['e1']);
    expect(r.ok && r.composition.coverageNotes).toEqual(['Two rounds have no score.']);
  });

  it('refuses a split over two players or two reads that disagree', () => {
    const two = new Map([['e5', env({ measurements: [m('sg_tee', 0.2, { unit: 'strokes' }), m('sg_putting', 0.1, { unit: 'strokes', entity: P2 })] })]]);
    expect(compileComposition(spec([{ type: 'split', refs: ['e5'] }]), two, NOW)).toMatchObject({ ok: false, reason: 'nothing_to_draw' });
    const clash = new Map([...reads, ['e6', env({ measurements: [m('sg_approach', -0.8, { unit: 'strokes' })] })]]);
    const r = compileComposition(spec([{ type: 'split', refs: ['e2', 'e6'] }]), clash, NOW);
    expect(r.ok).toBe(false);
    expect(r.dropped.join(' ')).toMatch(/disagree/);
  });

  it('hashes the same design over the same figures the same way', () => {
    const a = compileComposition(spec([{ type: 'trend', ref: 'e1' }]), reads, NOW);
    const b = compileComposition(spec([{ type: 'trend', ref: 'e1' }]), reads, new Date('2026-11-01T00:00:00Z'));
    expect(a.ok && b.ok && a.composition.artifactId === b.composition.artifactId).toBe(true);
  });
});
