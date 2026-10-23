// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * A8.4, A8.5, A8.8 and A8.10: the strokes gained and par gauge stays inside its half and labels its end; putts by round reads
 * lower as better; a putting ring under 10 putts keeps the early fill; the team phone's mean weighs each day by its rounds.
 */

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));

import { FigureGauge, ringOpacity, RING_EARLY_OPACITY } from '../charts';
import { RoundLine } from '../detail';
import { teamDaysMean } from '../StatsTeamPhone';

afterEach(cleanup);

const bar = () => document.querySelector<HTMLElement>('.ch-fg__track i')!;
const pct = (s: string) => Number(s.replace('%', ''));

describe('FigureGauge (A8.4)', () => {
  it('a value past the end fills only its half and says the end was passed', () => {
    render(<FigureGauge gauge={{ kind: 'par', toPar: 9 }} n={81} />);
    expect(pct(bar().style.width)).toBeLessThanOrEqual(50);
    expect(document.querySelector('.ch-fg__end')!.textContent).toBe('≥+6');
  });

  it('a value inside the end is drawn to scale, with the end value labelled', () => {
    render(<FigureGauge gauge={{ kind: 'par', toPar: -3 }} n={69} />);
    expect(pct(bar().style.width)).toBe(25);
    expect(document.querySelector('.ch-fg__end')!.textContent).toBe('−6');
    expect(document.querySelector('.ch-fg__end')!.className).toContain('ch-num');
  });

  it("names the women's Tour at zero for a women's team (A8.3)", () => {
    render(<FigureGauge gauge={{ kind: 'sg', tour: 'lpga' }} n={-0.6} />);
    expect(document.querySelector('.ch-fg__gauge em')!.textContent).toBe("Women's Tour");
  });
});

describe('putts by round (A8.5)', () => {
  it('more putts is drawn lower and the line says lower is better', () => {
    render(<RoundLine points={[{ label: 'Sep 1', value: 29 }, { label: 'Sep 8', value: 33 }]} label="Putts by round" lowerIsBetter />);
    const [first, last] = [...document.querySelectorAll('.ch-gx-line circle')].map((c) => Number(c.getAttribute('cy')));
    expect(last!).toBeGreaterThan(first!);
    expect(document.querySelector('.ch-gx-line')!.getAttribute('aria-label')).toContain('lower is better');
  });
});

describe('putting rings (A8.8)', () => {
  it('four putts keep the early fill whatever they made; ten read the rate', () => {
    expect(ringOpacity(4, 1)).toBe(RING_EARLY_OPACITY);
    expect(ringOpacity(4, 0)).toBe(RING_EARLY_OPACITY);
    expect(ringOpacity(10, 1)).toBeCloseTo(0.95, 5);
    expect(ringOpacity(0, null)).toBe(1);
  });
});

describe('team phone mean (A8.10)', () => {
  it('weighs each round day by its rounds', () => {
    expect(teamDaysMean([{ score: 70, n: 1 }, { score: 80, n: 3 }])).toBe(77.5);
    expect(teamDaysMean([{ score: 70 }, { score: 80 }])).toBe(75);
  });
});
