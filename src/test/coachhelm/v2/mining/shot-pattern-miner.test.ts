import { describe, it, expect } from 'vitest';
import { computeActionability } from '@/lib/coachhelm/v2/mining/shot-pattern-miner';

describe('computeActionability', () => {
  it.each([
    [{ frequency: 0.3 }, 0.6],
    [{ frequency: 0.6 }, 0.9],
    [{ frequency: 0.51 }, 0.9],
    [{ frequency: 0.5 }, 0.6],
  ])('tendency %j yields %d', (tendency, expected) => {
    expect(
      computeActionability([
        {
          frequency: tendency.frequency,
        },
      ]),
    ).toBe(expected);
  });

  it('empty array falls back to 0.6 (not 0.9)', () => {
    expect(computeActionability([])).toBe(0.6);
  });
});
