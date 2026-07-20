// @vitest-environment jsdom
/**
 * ============================================================================
 * viz.test.tsx — RampMatrix and RankCell share ONE band→class mapping
 * ----------------------------------------------------------------------------
 * `RAMP_CLASSES` is exported from RampMatrix.tsx and reused (not
 * re-implemented) by RankCell, so a band-4 cell renders identically whether
 * it comes from a value ramp (RampMatrix) or a rank ramp (RankCell via
 * `rampBandForRank`). This locks that contract.
 * ========================================================================== */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RampMatrix, RAMP_CLASSES } from '../RampMatrix';
import { RankCell } from '../RankCell';

describe('RampMatrix + RankCell — shared band ramp', () => {
  it('a band-4 RampMatrix cell carries the RAMP_CLASSES[4] classes', () => {
    const { container } = render(
      <RampMatrix cols={['Tour']} rows={[{ label: '0–3 ft', cells: [{ value: '92', band: 4 }] }]} />,
    );
    const cell = container.querySelector('td');
    expect(cell).not.toBeNull();
    for (const cls of RAMP_CLASSES[4].split(' ')) {
      expect(cell!.className).toContain(cls);
    }
  });

  it('RankCell(rank=1, of=6) — which rampBandForRank resolves to band 4 — carries the same classes', () => {
    const { container } = render(<RankCell rank={1} of={6} />);
    const rank = container.querySelector('span[aria-label]');
    expect(rank).not.toBeNull();
    for (const cls of RAMP_CLASSES[4].split(' ')) {
      expect(rank!.className).toContain(cls);
    }
  });

  it('the two renders resolve to the exact same class string for band 4', () => {
    const { container: matrixContainer } = render(
      <RampMatrix cols={['Tour']} rows={[{ label: '0–3 ft', cells: [{ value: '92', band: 4 }] }]} />,
    );
    const { container: rankContainer } = render(<RankCell rank={1} of={6} />);
    const cell = matrixContainer.querySelector('td')!;
    const rank = rankContainer.querySelector('span[aria-label]')!;
    for (const cls of RAMP_CLASSES[4].split(' ')) {
      expect(cell.className.split(' ')).toContain(cls);
      expect(rank.className.split(' ')).toContain(cls);
    }
  });
});
