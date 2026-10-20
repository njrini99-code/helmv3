import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PuttBands } from '../PuttBands';
import { PUTT_NEEDS, puttBandViews, puttCount, puttReadout, puttSummary, type PuttBandInput } from '../putt-bands';

afterEach(cleanup);

/** The preview player's six bands (fixtures-stats PREVIEW_PLAYER.puttBands). */
const SIX: PuttBandInput[] = [
  { label: '0–3 ft', made: 57, attempts: 64, bench: null },
  { label: '3–5 ft', made: 24, attempts: 38, bench: 90.5 },
  { label: '5–10 ft', made: 20, attempts: 51, bench: 62.2 },
  { label: '10–15 ft', made: 8, attempts: 40, bench: 35.7 },
  { label: '15–25 ft', made: 5, attempts: 46, bench: 15.4 },
  { label: '25+ ft', made: 1, attempts: 34, bench: 5.5 },
];

/** A test-only window with thin bands: 10–15 ft is an early read (18 putts), 25+ ft is under its floor (7 putts). */
const THIN: PuttBandInput[] = SIX.map((b) =>
  b.label === '10–15 ft' ? { ...b, made: 4, attempts: 18 } : b.label === '25+ ft' ? { ...b, made: 1, attempts: 7 } : b,
);

const cols = () => [...document.querySelectorAll<HTMLElement>('.ch-sv-pb__col')];
const read = () => document.querySelector('.ch-sv-read')!.textContent;
const live = () => document.querySelector('.ch-sv-pb [aria-live="polite"]')!.textContent;

describe('putt band state (floors: 10 to show, 30 to grade)', () => {
  it('a band under 10 putts has no rate, no range and no grade; 10 to 29 is early and never graded; 30 and up is steady', () => {
    const v = puttBandViews([
      { label: 'a', made: 3, attempts: 9, bench: 50 },
      { label: 'b', made: 2, attempts: 10, bench: 50 },
      { label: 'c', made: 5, attempts: 29, bench: 50 },
      { label: 'd', made: 10, attempts: 30, bench: 50 },
      { label: 'e', made: 0, attempts: 0, bench: null },
    ]);
    expect(v.map((b) => b.state)).toEqual(['none', 'early', 'early', 'steady', 'none']);
    expect(v[0]!.rate).toBeNull();
    expect(v[0]!.range).toBeNull();
    expect(v[0]!.grade).toBe('');
    expect(v[1]!.rate).toBe(20);
    // Early bands are well under the Tour's 50% and still not graded.
    expect(v[1]!.grade).toBe('');
    expect(v[2]!.grade).toBe('');
    expect(v[3]!.grade).toBe('is-loss');
    expect(v[4]!.rate).toBeNull();
  });

  it('grades by the dot, never the whisker: a steady band under the Tour is a loss even when its range reaches above it', () => {
    const [b] = puttBandViews([{ label: '5–10 ft', made: 20, attempts: 51, bench: 50 }]);
    expect(b!.range!.hi).toBeGreaterThan(50);
    expect(b!.grade).toBe('is-loss');
    const [even] = puttBandViews([{ label: 'x', made: 15, attempts: 30, bench: 50 }]);
    expect(even!.grade).toBe('is-gain');
  });

  it('no Tour value, no grade: 0–3 ft is never set against a Tour figure', () => {
    expect(puttBandViews(SIX)[0]!.grade).toBe('');
  });

  it('the range is the 95% Wilson interval of made of tried', () => {
    const r = puttBandViews(SIX)[2]!.range!;
    expect(Math.round(r.lo)).toBe(27);
    expect(Math.round(r.hi)).toBe(53);
  });

  it('a band kept only as a rate and a count (the calculator, when the putt read failed) draws the rate as kept and says its count', () => {
    const [b] = puttBandViews([{ label: '15–20 ft', made: null, rate: 13, attempts: 33, bench: null }]);
    expect(b!.rate).toBe(13);
    expect(b!.state).toBe('steady');
    expect(puttCount(b!)).toBe('33 putts');
    expect(puttReadout(b!)).toBe('15–20 ft · 33 putts, 13% · likely range 5% to 28%');
  });
});

describe('putt band words', () => {
  it('reads a steady band with its count, rate, likely range and the Tour', () => {
    expect(puttReadout(puttBandViews(SIX)[2]!)).toBe('5–10 ft · 20 of 51 made, 39% · likely range 27% to 53% · Tour 62%');
  });

  it('says an early band is an early read, and a band under its floor what it needs', () => {
    const v = puttBandViews(THIN);
    expect(puttReadout(v[3]!)).toBe('10–15 ft · 4 of 18 made, 22% · early read · likely range 9% to 45% · Tour 36%');
    expect(puttReadout(v[5]!)).toBe('25+ ft · 1 of 7 made · Needs 10 putts in the band');
    expect(PUTT_NEEDS).toBe('Needs 10 putts in the band');
  });

  it('names the chart for a screen reader, band by band, and says the spacing is even', () => {
    const s = puttSummary(puttBandViews(THIN));
    expect(s).toContain('5–10 feet 39%, 20 of 51');
    expect(s).toContain('25+ feet no rate, 7 putts');
    expect(s).toContain('Bands are evenly spaced, not to scale.');
  });
});

describe('PuttBands', () => {
  it('draws the six bands in order with made/tried under each, a dot and a whisker per band, and the Tour line from 3 feet on', () => {
    render(<PuttBands bands={SIX} />);
    expect(cols().map((c) => c.querySelector('.ch-sv-pb__lab span')!.textContent)).toEqual(['0–3 ft', '3–5 ft', '5–10 ft', '10–15 ft', '15–25 ft', '25+ ft']);
    expect(cols().map((c) => c.querySelector('.ch-sv-pb__lab small')!.textContent)).toEqual(['57/64', '24/38', '20/51', '8/40', '5/46', '1/34']);
    expect(cols().map((c) => c.querySelector('.ch-sv-pb__lab b')!.textContent)).toEqual(['89%', '63%', '39%', '20%', '11%', '3%']);
    expect(document.querySelectorAll('.ch-sv-pb__dot')).toHaveLength(6);
    expect(document.querySelectorAll('.ch-sv-pb__whisk')).toHaveLength(6);
    // No Tour mark inside 3 feet; one tick for each of the other five, joined by one line.
    expect(cols()[0]!.querySelector('.ch-sv-pb__tick')).toBeNull();
    expect(document.querySelectorAll('.ch-sv-pb__tick')).toHaveLength(5);
    const lines = document.querySelectorAll('.ch-sv-pb__tour polyline');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.getAttribute('points')!.split(' ')).toHaveLength(5);
    // Equal spacing, and the chart says so; "likely range" is named once, in the key.
    expect(document.querySelector('.ch-sv-pb__cap')!.textContent).toContain('Bands are evenly spaced, not to scale');
    expect(document.querySelector('.ch-sv-pb__key')!.textContent).toContain('Likely range (95%)');
    // Each band sits on the 0 to 100% axis: 20 of 51 is 39.2% up.
    expect(parseFloat(cols()[2]!.querySelector<HTMLElement>('.ch-sv-pb__dot')!.style.top)).toBeCloseTo(100 - (20 / 51) * 100, 3);
  });

  it('colours a graded dot and its rate by the Tour; the band with no Tour value stays neutral', () => {
    render(<PuttBands bands={[...SIX.slice(0, 5), { label: '25+ ft', made: 3, attempts: 34, bench: 5.5 }]} />);
    expect(cols()[0]!.querySelector('.ch-sv-pb__dot')!.className).not.toMatch(/is-(gain|loss)/);
    expect(cols()[2]!.querySelector('.ch-sv-pb__dot')!.className).toContain('is-loss');
    expect(cols()[2]!.querySelector('.ch-sv-pb__lab b')!.className).toContain('ch-loss');
    expect(cols()[5]!.querySelector('.ch-sv-pb__dot')!.className).toContain('is-gain');
    expect(cols()[5]!.querySelector('.ch-sv-pb__lab b')!.className).toContain('ch-gain');
  });

  it('an early band is hollow and ungraded, and a band under 10 putts draws no dot and says what it needs', () => {
    render(<PuttBands bands={THIN} />);
    const early = cols()[3]!;
    expect(early.className).toContain('is-early');
    expect(early.querySelector('.ch-sv-pb__dot')!.className).not.toMatch(/is-(gain|loss)/);
    const none = cols()[5]!;
    expect(none.className).toContain('is-none');
    expect(none.querySelector('.ch-sv-pb__dot')).toBeNull();
    expect(none.querySelector('.ch-sv-pb__whisk')).toBeNull();
    expect(none.querySelector('.ch-sv-pb__needs')!.textContent).toBe('Needs 10 putts in the band');
    expect(none.querySelector('.ch-sv-pb__lab b')!.textContent).toBe('—');
    expect(none.querySelector('.ch-sv-pb__lab small')!.textContent).toBe('1/7');
    expect(document.querySelector('.ch-sv-note')!.textContent).toBe('Hollow dots are early reads, under 30 putts (10–15 ft), and are not graded against the Tour yet.');
  });

  it('on the phone the column says the short form and the band keeps its full sentence in the readout', () => {
    render(<PuttBands bands={THIN} compact />);
    expect(document.querySelector('.ch-sv-pb')!.className).toContain('is-compact');
    expect(cols()[5]!.querySelector('.ch-sv-pb__needs')!.textContent).toBe('Needs 10 putts');
    expect(cols()[5]!.querySelector('.ch-sv-pb__lab span')!.textContent).toBe('25+');
    fireEvent.click(cols()[5]!);
    expect(read()).toBe('25+ ft · 1 of 7 made · Needs 10 putts in the band');
  });

  it('breaks the Tour line where a band has no Tour value, and invents none', () => {
    render(
      <PuttBands
        bands={[
          { label: '0–3 ft', made: 50, attempts: 60, bench: null },
          { label: '3–5 ft', made: 20, attempts: 40, bench: 90 },
          { label: '5–10 ft', made: 15, attempts: 40, bench: 60 },
          { label: '15–20 ft', made: null, rate: 13, attempts: 33, bench: null },
        ]}
      />,
    );
    expect(document.querySelectorAll('.ch-sv-pb__tick')).toHaveLength(2);
    expect(document.querySelectorAll('.ch-sv-pb__tour polyline')).toHaveLength(1);
    expect(cols()[3]!.querySelector('.ch-sv-pb__lab small')!.textContent).toBe('33 putts');
  });

  it('a mouse over a band reads it above the chart without announcing it; a click pins and announces; a second click lets go', () => {
    render(<PuttBands bands={SIX} />);
    expect(read()).toBe('Select a band to read its make rate and likely range.');
    fireEvent.pointerEnter(cols()[2]!, { pointerType: 'mouse' });
    expect(read()).toBe('5–10 ft · 20 of 51 made, 39% · likely range 27% to 53% · Tour 62%');
    expect(cols()[2]!.hasAttribute('data-active')).toBe(true);
    expect(live()).toBe('');
    fireEvent.pointerLeave(cols()[2]!, { pointerType: 'mouse' });
    expect(read()).toBe('Select a band to read its make rate and likely range.');
    fireEvent.click(cols()[1]!);
    expect(cols()[1]!.hasAttribute('data-pinned')).toBe(true);
    expect(live()).toBe('3–5 ft · 24 of 38 made, 63% · likely range 47% to 77% · Tour 91%');
    fireEvent.click(cols()[1]!);
    expect(live()).toBe('');
  });

  it('is one focusable group: the arrow keys step band to band left and right, Home and End jump, Esc lets go', () => {
    render(<PuttBands bands={SIX} />);
    const group = screen.getByRole('group');
    expect(group.tabIndex).toBe(0);
    expect(group.getAttribute('aria-label')).toContain('Use the arrow keys to read each band.');
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    // Unpinned, a step toward the end starts from the last band (useChartPin's x axis).
    expect(live()).toContain('25+ ft');
    fireEvent.keyDown(group, { key: 'Home' });
    expect(live()).toBe('0–3 ft · 57 of 64 made, 89% · likely range 79% to 95%');
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(live()).toContain('3–5 ft');
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(live()).toContain('0–3 ft');
    fireEvent.keyDown(group, { key: 'End' });
    expect(live()).toContain('25+ ft · 1 of 34 made, 3%');
    fireEvent.keyDown(group, { key: 'Escape' });
    expect(live()).toBe('');
    expect(read()).toBe('Select a band to read its make rate and likely range.');
  });
});
