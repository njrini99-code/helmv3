import { describe, expect, it } from 'vitest';
import { type Measurement, type ToolEnvelope } from '../provenance';
import { auditNumericClaims, collectEnvelopeNumbers } from './grounded';

// 145001c828: the level comparison is Helm's own cohort, "Division I players on Helm (n=22)", with a value, the player's own value, a place when there is one, and a
// note naming the count. The cohort figure and its n must be groundable from the comparison itself.
const OWEN = '8091da4b-dbc9-47f3-80f1-be37c96b2c91';
const measurement = (comparison: Record<string, unknown>): Measurement => ({ metric_id: 'gir_pct', metric_label: 'GIR', unit: 'percent', value: 61.11, entity: { kind: 'player', id: OWEN, label: 'Owen Carter' }, window_start: '2026-06-01', window_end: '2026-09-26', sample_size: 144, sample_unit: 'holes', as_of: '2026-11-08T00:00:00.000Z', coverage: 'complete', coverage_note: null, source: 'x', method: 'x', denominator: 144, benchmark: null, direction: 'higher_better', comparisons: [comparison] }) as unknown as Measurement;
const level = { kind: 'level', label: 'Division I players on Helm (n=22)', value: 58.4, your_value: 61.11, place_percent: null, place_of: null, place: null, note: 'The mean of the other 22 Division I players on Helm over all recorded rounds.', missing_reason: null };
const read = (c: Record<string, unknown>): ToolEnvelope => ({ summary: 'Owen Carter against his level.', measurements: [measurement(c)], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00.000Z', detail: { kind: 'benchmark_read' } }) as unknown as ToolEnvelope;
const audit = (text: string, env: ToolEnvelope) => auditNumericClaims(text, env.measurements, [], collectEnvelopeNumbers(env), [], 'America/New_York', { players: [{ id: OWEN, name: 'Owen Carter' }] }).map((c) => c.text);

describe('the cohort level in a comparison', () => {
  it('its n grounds when the comparison states it, and when only the label does', () => {
    expect(audit('Owen Carter hits 61.11% of greens, against 58.4% for the 22 Division I players on Helm.', read({ ...level, place_percent: 70, place_of: 22 }))).toEqual([]);
    expect(audit('Owen Carter hits 61.11% of greens, against 58.4% for Division I players on Helm (n=22).', read(level))).toEqual([]);
    expect(audit('Owen Carter hits 61.11% of greens, against 58.4% for Division I players on Helm (n=31).', read(level))).toEqual(['31']);
  });
});
