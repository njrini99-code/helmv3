import { describe, expect, it } from 'vitest';
import type { AskEvidence } from '../../../../../data/coachhelm-chat-thread';
import { trendTone } from '../drawings';

/**
 * The Ask studio's ruled trend (stats and charts audit 2026-11-15, CH-24): the last point turned green or amber whenever that one
 * round was better or worse than the reference, so one round set the colour. Now only past the shown rounds' usual spread.
 */
type TrendBlock = Extract<AskEvidence, { kind: 'trend' }>;
const block = (values: number[], ref: number | null, goodDirection: 'up' | 'down' | null = 'down') =>
  ({ kind: 'trend', unit: 'strokes', points: values.map((value, i) => ({ label: `R${i + 1}`, value, n: 1 })), reference: ref == null ? null : { label: 'Average', value: ref }, summary: '', goodDirection }) as unknown as TrendBlock;

describe('trendTone · one round inside the usual spread is plain ink (CH-24)', () => {
  it('74, 75, 73 then 74.5 against an average of 74 is no colour', () => {
    expect(trendTone(block([74, 75, 73, 74.5], 74))).toBe('');
  });

  it('a last round well past the spread is coloured by the measure’s direction', () => {
    expect(trendTone(block([74, 75, 73, 74, 80], 74))).toBe('is-loss');
    expect(trendTone(block([74, 75, 73, 74, 68], 74))).toBe('is-gain');
    expect(trendTone(block([60, 62, 61, 70], 61, 'up'))).toBe('is-gain');
  });

  it('under three rounds, no reference or no known direction: plain ink', () => {
    expect(trendTone(block([74, 80], 74))).toBe('');
    expect(trendTone(block([74, 75, 73, 80], null))).toBe('');
    expect(trendTone(block([74, 75, 73, 80], 74, null))).toBe('');
  });
});
