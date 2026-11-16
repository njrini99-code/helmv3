import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DeskRounds } from '../HomeDeskCrh';
import { PREVIEW_HOME } from '../../../preview/fixtures';
import { FormBars } from '../../../ui/FormLine';

afterEach(cleanup);

describe('coach Home desktop, design parity', () => {
  it('Latest rounds links to Team stats from the card head', () => {
    render(<DeskRounds rounds={PREVIEW_HOME.latestRounds.rounds} />);
    expect(screen.getByRole('link', { name: 'Team stats' }).getAttribute('href')).toMatch(/stats$/);
  });

  it('Latest rounds holds each score and its to-par in a well', () => {
    const [r] = PREVIEW_HOME.latestRounds.rounds;
    const { container } = render(<DeskRounds rounds={[r!]} />);
    const well = container.querySelector('.ch-dh-score') as HTMLElement;
    expect(within(well).getByText(String(r!.score))).toBeTruthy();
    expect(well.querySelector('em')?.textContent).toBeTruthy();
  });
});

describe('form bars', () => {
  // The form strip is a dot per round on one score scale (stats and charts audit 2026-11-15, CH-03): the old bars ran from a 30%
  // floor across the min-max range, so 70, 75 and 80 drew as 100, 65 and 30, a five-stroke gap as a third of the strip.
  it('lower scores sit higher, equal strokes are equal distances, and every dot stays on the strip', () => {
    const { container } = render(<FormBars data={[70, 75, 80]} />);
    const ups = [...container.querySelectorAll('i')].map((n) => parseFloat((n as HTMLElement).style.bottom));
    for (const u of ups) {
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(100);
    }
    expect(ups[0]).toBeGreaterThan(ups[1]!);
    expect(ups[1]).toBeGreaterThan(ups[2]!);
    expect(ups[0]! - ups[1]!).toBeCloseTo(ups[1]! - ups[2]!, 5);
  });
});
