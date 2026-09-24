import { describe, expect, it } from 'vitest';
import type { GenomeVector } from '@/lib/coachhelm/v3/genome/types';
import { buildArchetype, buildTendencies } from '../tendencies-model';

const vector = {
  driver_usage: { value: 0.82, label: 'Bomber', confidence: 0.9 },
  miss_side_bias: { value: 0.4, label: 'Right bias', confidence: 0.55 },
  back_nine_delta: { value: -0.12, label: 'Closes well', confidence: 0.3 },
  // Duplicates of strand metrics: never listed as tendencies.
  pressure_delta: { value: 1.2, label: 'x', confidence: 1 },
  par3_proficiency: { value: 0.1, label: 'x', confidence: 1 },
  scrambling_rate: { value: 0.5, label: 'x', confidence: 1 },
} as unknown as GenomeVector;

describe('buildTendencies', () => {
  const t = buildTendencies(vector);

  it('lists only how-they-play dimensions, never strand duplicates', () => {
    expect(t.map((x) => x.id)).toEqual([
      'driver_usage',
      'miss_side_bias',
      'back_nine_delta',
      'scoring_trend',
      'weather_sensitivity_stub',
    ]);
  });

  it('re-expresses stored values in plain units with a confidence word', () => {
    expect(t[0]).toMatchObject({ status: 'live', word: 'Bomber', detail: '82% of tee shots', read: 'Solid read' });
    expect(t[1]).toMatchObject({ detail: '70% of side misses go right', read: 'Fair read' });
    expect(t[2]).toMatchObject({ detail: '−0.12 strokes a hole vs the front', read: 'Early read' });
  });

  it('marks uncomputed dimensions locked and weather not tracked', () => {
    expect(t[3].status).toBe('locked');
    expect(t[4].status).toBe('not_tracked');
  });

  it('locks everything when there is no genome', () => {
    expect(buildTendencies(null).filter((x) => x.status === 'live')).toHaveLength(0);
  });
});

describe('buildArchetype', () => {
  it('reads the tee profile and miss side', () => {
    expect(buildArchetype(vector)).toBe('Bomber off the tee, misses right');
  });

  it('invents nothing without a genome', () => {
    expect(buildArchetype(null)).toBeNull();
    expect(buildArchetype({} as GenomeVector)).toBeNull();
  });
});
