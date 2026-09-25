/**
 * Summary layout (coach deep-dive): the area standing and takeaway come from
 * the aggregator's own metric tones, never a new score, and a sparse area is
 * "calibrating", never a leak or a strength.
 */
import { describe, expect, it } from 'vitest';
import type { SectionData } from '@/app/golf/actions/player-fingerprint';
import { areaStanding, fingerprintTakeaway } from './FairwayPlayerGameFingerprint';

function section(overrides: Partial<SectionData>): SectionData {
  return {
    key: 'putting',
    category: 'Putting',
    sparse: false,
    metrics: [],
    insights: [],
    chart_data: null,
    ...overrides,
  } as SectionData;
}

describe('areaStanding', () => {
  it('is calibrating for a sparse area whatever its tones', () => {
    expect(areaStanding(section({ sparse: true, metrics: [{ label: 'x', value: '1', tone: 'bad' }] }))).toBe('calibrating');
  });
  it('is unrated when no metric carries a tone', () => {
    expect(areaStanding(section({ metrics: [{ label: 'x', value: '1', tone: 'neutral' }] }))).toBe('unrated');
  });
  it('reads leak / strength / even from the tone balance', () => {
    expect(areaStanding(section({ metrics: [{ label: 'a', value: '1', tone: 'bad' }] }))).toBe('leak');
    expect(areaStanding(section({ metrics: [{ label: 'a', value: '1', tone: 'good' }] }))).toBe('strength');
    expect(
      areaStanding(
        section({
          metrics: [
            { label: 'a', value: '1', tone: 'good' },
            { label: 'b', value: '2', tone: 'bad' },
          ],
        }),
      ),
    ).toBe('even');
  });
});

describe('fingerprintTakeaway', () => {
  it('names the leak and the strength with the metric that earned them', () => {
    const text = fingerprintTakeaway([
      section({ key: 'putting', category: 'Putting', metrics: [{ label: 'SG: Putting', value: '-2.2', tone: 'bad' }] }),
      section({ key: 'approach', category: 'Approach', metrics: [{ label: 'GIR', value: '62%', tone: 'good' }] }),
    ]);
    expect(text).toBe('Needs work in putting (SG: Putting -2.2). Strongest approach (GIR 62%).');
  });
  it('says so plainly when nothing stands out, and when everything is calibrating', () => {
    expect(fingerprintTakeaway([section({ metrics: [{ label: 'a', value: '1', tone: 'neutral' }] })])).toBe(
      'No area stands apart from the benchmarks yet.',
    );
    expect(fingerprintTakeaway([section({ sparse: true })])).toBe('Every area is still calibrating.');
  });
});
