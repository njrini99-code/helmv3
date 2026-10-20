// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FigureGauge, SgChangeChip } from '../charts';
import { OverviewZones } from '../OverviewZones';
import { FormLine } from '../../../ui/FormLine';
import { POOLED_SD } from '../../../lib/stats-signal';
import { PREVIEW_PLAYER } from '../../../preview/fixtures-stats';
import type { ChPlayerProfile } from '../../../data/stats-player';

afterEach(cleanup);

/** Stats visuals 4.6 and decision Q4: a change is green or amber only when it clears one standard error of the difference. */
describe('SgChangeChip', () => {
  const chip = (se: number | null | undefined, delta: number | null = -1.3, context = 'vs previous 10', subject?: string) => {
    const { container } = render(<SgChangeChip change={{ delta, context, se }} subject={subject} code="CH-5310" />);
    return container.querySelector('.ch-sgchg')!;
  };

  it('is neutral ink with the signed number and "No clear change" inside its standard error', () => {
    const c = chip(1.7);
    expect(c.querySelector('.ch-delta')!.className).toContain('is-flat');
    expect(c.querySelector('.ch-delta')!.textContent).toBe('−1.3');
    expect(c.lastElementChild!.textContent).toBe('No clear change vs previous 10');
  });

  it('is amber or green, and says worse or better, once the change clears it', () => {
    expect(chip(0.9).querySelector('.ch-delta')!.className).toContain('is-bad');
    expect(chip(0.9).lastElementChild!.textContent).toBe('Worse than previous 10');
    cleanup();
    const up = chip(0.9, 1.3);
    expect(up.querySelector('.ch-delta')!.className).toContain('is-good');
    expect(up.lastElementChild!.textContent).toBe('Better than previous 10');
  });

  it('never paints a change with no standard error, and never says "Improving"', () => {
    const c = chip(undefined, 4);
    expect(c.querySelector('.ch-delta')!.className).toContain('is-flat');
    expect(c.textContent).not.toMatch(/Improving/);
  });

  it('names its figure when it sits away from it, and says why there is no change', () => {
    expect(chip(1.7, -1.3, 'vs previous 10', 'SG a round').lastElementChild!.textContent).toBe('SG a round · No clear change vs previous 10');
    cleanup();
    const none = chip(null, null, 'No earlier rounds');
    expect(none.querySelector('.ch-delta')).toBeNull();
    expect(none.textContent).toBe('No earlier rounds');
    expect(none.querySelector('[data-ch-code="CH-5310"]')).not.toBeNull();
  });
});

describe('FigureGauge', () => {
  const fill = (el: Element) => el.querySelector('.ch-fg__track i') as HTMLElement;

  it('draws strokes gained on a scale its value sets, so nothing clamps at ±3', () => {
    // −0.9 on a scale of 1: 45% of the half-track; −4.6 on a scale of 5: 46%, not a full bar.
    let { container } = render(<FigureGauge gauge={{ kind: 'sg' }} n={-0.9} />);
    expect(fill(container).style.width).toBe('45%');
    expect(fill(container).className).toBe('is-loss');
    cleanup();
    ({ container } = render(<FigureGauge gauge={{ kind: 'sg' }} n={-4.6} />));
    expect(fill(container).style.width).toBe('46%');
    cleanup();
    ({ container } = render(<FigureGauge gauge={{ kind: 'sg' }} n={2.4} />));
    expect(fill(container).style.width).toBe('40%');
    expect(fill(container).className).toBe('is-gain');
  });

  it('colours a rate only against its mark: at or above green, below amber, no mark neutral', () => {
    const tone = (ref: number | null) => {
      cleanup();
      const { container } = render(<FigureGauge gauge={{ kind: 'rate', ref }} n={58} />);
      return fill(container).className;
    };
    expect([tone(52), tone(66), tone(null)]).toEqual(['is-gain', 'is-loss', 'is-neutral']);
  });
});

describe('FormLine', () => {
  const tone = (data: number[]) => {
    cleanup();
    const { container } = render(<FormLine data={data} label="form" />);
    return container.querySelector('svg')!.getAttribute('class');
  };

  it('is ink when the newer half has not moved past the change’s standard error', () => {
    // 76, 75 against 74, 73: down 2, with a standard error of 3.6 on two rounds a half (3.6), no clear change.
    expect(tone([76, 75, 74, 74, 73])).toBe('ch-form ch-form--flat');
  });

  it('is green when scoring clearly fell and amber when it clearly rose', () => {
    // Three rounds a half on the pooled 3.6: a standard error of about 2.9, cleared by a five-stroke move.
    const se = Math.sqrt(2 * (POOLED_SD.score ** 2 / 3));
    expect(se).toBeLessThan(5);
    expect(tone([78, 78, 78, 73, 73, 73])).toBe('ch-form ch-form--gain');
    expect(tone([72, 72, 72, 77, 77, 77])).toBe('ch-form ch-form--loss');
  });

  it('draws lower scores higher, as its comment says', () => {
    cleanup();
    const { container } = render(<FormLine data={[80, 70]} label="form" />);
    const end = container.querySelector('circle')!;
    // The last score (70, the lower) sits near the top of the 34px box.
    expect(Number(end.getAttribute('cy'))).toBeLessThan(17);
  });
});

describe('the Overview’s strokes gained track', () => {
  const zones = (over: Partial<ChPlayerProfile['win']> = {}, coach = false) => {
    cleanup();
    const data = { ...PREVIEW_PLAYER, win: { ...PREVIEW_PLAYER.win, ...over } } as ChPlayerProfile;
    return render(<OverviewZones data={data} coach={coach} ribbon={null} />).container;
  };

  it('takes its ends from the data, always around zero, so a value above +1 is not clamped', () => {
    let c = zones({ sgPerRound: 2.4 });
    expect(c.textContent).toContain('Total strokes gained a round, −3 to +3.');
    const pin = c.querySelector('.ch-zpin span') as HTMLElement;
    expect(pin.style.left).toBe('90%');
    c = zones({ sgPerRound: -0.9 });
    expect(c.textContent).toContain('Total strokes gained a round, −1 to +1.');
  });

  it('says the change against the previous 10 in the same words as the chip', () => {
    const c = zones();
    expect(c.textContent).toContain('−1.3 · No clear change vs previous 10');
    expect(c.textContent).not.toMatch(/Down 1\.3 on the previous 10/);
  });
});
