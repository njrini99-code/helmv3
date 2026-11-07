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
  it('the highest score still draws a bar: a 30% floor, the lowest at full height', () => {
    const { container } = render(<FormBars data={[70, 75, 80]} />);
    const heights = [...container.querySelectorAll('i')].map((n) => parseInt((n as HTMLElement).style.height, 10));
    expect(Math.max(...heights)).toBeLessThanOrEqual(100);
    expect(heights[0]).toBeGreaterThan(heights[1]!);
    expect(heights[1]).toBeGreaterThan(heights[2]!);
    expect(heights[2]).toBeGreaterThanOrEqual(30);
  });
});
