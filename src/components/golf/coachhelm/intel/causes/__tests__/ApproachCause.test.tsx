/**
 * CoachHelm Home cause visual: where approaches finish (50–250 yd).
 *
 * Pins the honesty contract: headline figures come from the slice's counted
 * shots, a slice with nothing to show says so, the band picker and the lie
 * rows re-read the figures, the pin plot draws ONLY tagged misses (at their
 * measured distance, on their tagged direction), greens hit and untagged
 * misses live on the distance strip, a shot with no measured leave is counted
 * but not drawn, tour marks come only from the refs for the picked band's
 * standard range, and no NaN / undefined ever reaches the page.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ApproachShot, IntelRound, IntelTourRefs, TeamIntelligenceData } from '@/lib/golf/team-intelligence/types';
import { NO_REFS, PGA_REFS } from '@/lib/golf/team-intelligence/__tests__/fixtures';
import { ApproachCause } from '../ApproachCause';

function round(id: string, playerId: string): IntelRound {
  return { id, playerId, date: '2026-09-01', type: 'practice', sg: { tee: null, app: null, atg: null, putt: null } };
}

function payload(p: Partial<TeamIntelligenceData> = {}): TeamIntelligenceData {
  return {
    teamId: 't1',
    baselineLabel: 'PGA Tour',
    tourLabel: 'PGA Tour',
    refs: NO_REFS,
    today: '2026-09-28',
    players: [
      { id: 'p1', name: 'Alex Moore', avatarUrl: null },
      { id: 'p2', name: 'Blake Hart', avatarUrl: null },
    ],
    rounds: [round('r1', 'p1'), round('r2', 'p2')],
    tee: [],
    approach: [],
    chips: [],
    putts: [],
    ...p,
  };
}

const BOTH_ROUNDS = new Set([0, 1]);

function expectClean(container: HTMLElement) {
  expect(container.innerHTML).not.toMatch(/NaN|undefined|Infinity/);
  expect(container.textContent).not.toMatch(/GIR|\u2014/);
}

const figure = (container: HTMLElement) => container.querySelector('[data-figure]')?.textContent;
const text = (container: HTMLElement, selector: string) => container.querySelector(selector)?.textContent ?? null;

const PIN = { x: 200, y: 172 };
/** Viewbox units per foot on the pin plot. */
const FT = 1.5;
function polarOf(el: Element): { r: number; deg: number } {
  const dx = Number(el.getAttribute('cx')) - PIN.x;
  const dy = Number(el.getAttribute('cy')) - PIN.y;
  return { r: Math.hypot(dx, dy), deg: (Math.atan2(dy, dx) * 180) / Math.PI };
}

function shot(p: Partial<ApproachShot> & Pick<ApproachShot, 'fromYards'>): ApproachShot {
  return { ri: 0, lie: 'fairway', onGreen: false, finish: null, leaveFeet: null, miss: null, ...p };
}

const approaches: ApproachShot[] = [
  shot({ ri: 0, fromYards: 130, lie: 'fairway', onGreen: true, leaveFeet: 20 }),
  shot({ ri: 0, fromYards: 140, lie: 'fairway', finish: 'rough', leaveFeet: 40, miss: 'short_left' }),
  shot({ ri: 0, fromYards: 145, lie: 'rough', finish: 'sand', leaveFeet: 30, miss: 'short_left' }),
  shot({ ri: 0, fromYards: 160, lie: 'fairway', finish: 'fairway', leaveFeet: null, miss: 'long' }),
  shot({ ri: 1, fromYards: 90, lie: 'tee', onGreen: true, leaveFeet: 10 }),
  shot({ ri: 1, fromYards: 110, lie: 'rough', finish: 'fairway', leaveFeet: 20, miss: 'long' }),
  shot({ ri: 1, fromYards: 180, lie: 'fairway', finish: 'rough', leaveFeet: 12, miss: null }),
  // Outside 50–250 yd: only the footnote counts it.
  shot({ ri: 1, fromYards: 260, lie: 'fairway', onGreen: true, leaveFeet: 5 }),
];

const renderApproach = (
  shots: ApproachShot[] = approaches,
  opts: { playerId?: string | null; playerName?: string | null; refs?: IntelTourRefs; tourLabel?: TeamIntelligenceData['tourLabel'] } = {},
) =>
  render(
    <ApproachCause
      data={payload({ approach: shots, refs: opts.refs ?? NO_REFS, tourLabel: opts.tourLabel ?? 'PGA Tour' })}
      allowed={BOTH_ROUNDS}
      playerId={opts.playerId ?? null}
      playerName={opts.playerName ?? null}
    />,
  );

const bandButton = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) });

describe('ApproachCause', () => {
  it('leads with proximity and the share that hit the green over 50–250 yd', () => {
    const { container } = renderApproach();
    // Mean of the six measured leaves (20, 40, 30, 10, 20, 12); 2 of 7 on the green.
    expect(figure(container)).toBe('22 ft');
    expect(screen.getByText('29% hit the green')).toBeInTheDocument();
    expect(screen.getByText('Whole team · 7 shots · 50–250 yd')).toBeInTheDocument();
    expect(bandButton('All')).toHaveAttribute('aria-pressed', 'true');
    expect(text(container, '[data-outside]')).toBe("1 approach in these rounds was outside 50–250 yd and isn't on this card.");
    expectClean(container);
  });

  it('offers All plus the seven bands, each with its own average', () => {
    const { container } = renderApproach();
    const picker = screen.getByRole('group', { name: 'Approach distance, yards' });
    const options = within(picker).getAllByRole('button');
    expect(options.map((b) => b.textContent)).toEqual([
      'All22 ft',
      '50–75no shots',
      '75–10010 ft',
      '100–12520 ft',
      '125–15030 ft',
      '150–175no data',
      '175–20012 ft',
      '200–250no shots',
    ]);
    expect(picker.className).toContain('grid-cols-4');
    expect(picker.className).toContain('[@container(min-width:560px)]:grid-cols-8');
    expectClean(container);
  });

  it('re-reads every figure for the picked band', () => {
    const { container } = renderApproach();
    const band = bandButton('125–150');
    fireEvent.click(band);
    expect(band).toHaveAttribute('aria-pressed', 'true');
    expect(bandButton('All')).toHaveAttribute('aria-pressed', 'false');
    expect(figure(container)).toBe('30 ft');
    expect(screen.getByText('33% hit the green')).toBeInTheDocument();
    expect(screen.getByText('Whole team · 3 shots · 125–150 yd')).toBeInTheDocument();
    expect(screen.getByText('The most common miss is short left: 100% of tagged misses.')).toBeInTheDocument();
    expectClean(container);
  });

  it('reads one player’s rounds only', () => {
    const { container } = renderApproach(approaches, { playerId: 'p2', playerName: 'Blake Hart' });
    // Round 2 only: leaves 10, 20 and 12; 1 of 3 on the green.
    expect(figure(container)).toBe('14 ft');
    expect(screen.getByText('Blake Hart · 3 shots · 50–250 yd')).toBeInTheDocument();
    expect(screen.getByText('33% hit the green')).toBeInTheDocument();
    expectClean(container);
  });

  it('plots only tagged misses, each at its measured distance on its tagged direction', () => {
    const { container } = renderApproach();
    const marks = container.querySelectorAll('circle[data-layer]');
    expect(marks).toHaveLength(3);
    expect([...marks].every((m) => m.getAttribute('data-layer') === 'miss')).toBe(true);

    // Long, 20 ft: straight up from the pin at 30 units (1.5 per foot), no sideways nudge.
    const long = container.querySelector('circle[data-layer="miss"][data-direction="long"]')!;
    expect(Number(long.getAttribute('cx'))).toBe(200);
    expect(Number(long.getAttribute('cy'))).toBeCloseTo(172 - 20 * FT, 1);

    // Short left, 40 ft and 30 ft: exactly on the 135° line.
    const shortLeft = [...container.querySelectorAll('circle[data-layer="miss"][data-direction="short_left"]')].map(polarOf);
    expect(shortLeft.map((p) => Math.round(p.r)).sort((a, b) => a - b)).toEqual([30 * FT, 40 * FT]);
    for (const p of shortLeft) expect(p.deg).toBeCloseTo(135, 0);

    // Each mark is inked by where the miss finished.
    expect(container.querySelector('g[data-mark][data-direction="long"]')).toHaveAttribute('data-finish', 'fairway');
    expect([...container.querySelectorAll('g[data-mark][data-direction="short_left"]')].map((g) => g.getAttribute('data-finish')).sort()).toEqual([
      'rough',
      'sand',
    ]);

    // The untagged miss and the tagged miss with no measured leave are counted, not drawn.
    expect(text(container, '[data-unplotted]')).toBe(
      'Not plotted: greens hit (no direction; they are on the strip below), 1 miss with no direction tag and 1 tagged miss with no measured distance.',
    );
    expectClean(container);
  });

  it('packs misses at the same spot into one mark sized by count, inside its direction’s eighth', () => {
    const at45 = (miss: 'short_right' | 'short', n: number, finish: 'rough' | 'sand'): ApproachShot[] =>
      Array.from({ length: n }, () => shot({ fromYards: 150, finish, leaveFeet: 45, miss }));
    const { container } = renderApproach([...at45('short_right', 30, 'rough'), ...at45('short_right', 10, 'sand'), ...at45('short', 40, 'rough')]);

    const marks = [...container.querySelectorAll('circle[data-layer="miss"]')];
    expect(marks).toHaveLength(2);
    const group = container.querySelector('g[data-mark][data-direction="short_right"]')!;
    expect(group).toHaveAttribute('data-count', '40');
    expect(group).toHaveAttribute('data-finish', 'mixed');
    // Two finishes: two pie wedges.
    expect(group.querySelectorAll('path')).toHaveLength(2);

    for (const [el, deg] of [
      [container.querySelector('circle[data-direction="short_right"]')!, 45],
      [container.querySelector('circle[data-direction="short"]')!, 90],
    ] as const) {
      const p = polarOf(el);
      const r = Number(el.getAttribute('r'));
      // At the measured 45 ft, on the tagged line, and never past the eighth's edge.
      expect(p.r).toBeCloseTo(45 * FT, 0);
      expect(p.deg).toBeCloseTo(deg, 0);
      expect((Math.asin(r / p.r) * 180) / Math.PI).toBeLessThan(22.5);
    }
    // Neighbouring directions never overlap.
    const [a, b] = marks;
    const gap = Math.hypot(Number(a!.getAttribute('cx')) - Number(b!.getAttribute('cx')), Number(a!.getAttribute('cy')) - Number(b!.getAttribute('cy')));
    expect(gap).toBeGreaterThan(Number(a!.getAttribute('r')) + Number(b!.getAttribute('r')));
    expect(screen.getByText('1 to 40 misses')).toBeInTheDocument();
    expectClean(container);
  });

  it('puts leaves past 90 ft in a labelled outer band', () => {
    const { container } = renderApproach([shot({ fromYards: 150, finish: 'rough', leaveFeet: 120, miss: 'long' })]);
    const mark = container.querySelector('circle[data-layer="miss"]')!;
    expect(polarOf(mark).r).toBeCloseTo(146, 0);
    expect(screen.getByText(/The outer band holds leaves past 90 ft, not to scale\./)).toBeInTheDocument();
    expectClean(container);
  });

  it('shows every measured approach on the distance strip, hits above and misses below, with the average marked', () => {
    const { container } = renderApproach();
    const sum = (selector: string) =>
      [...container.querySelectorAll(selector)].reduce((t, el) => t + Number(el.getAttribute('data-count')), 0);
    expect(sum('rect[data-lane="hit"]')).toBe(2);
    expect(sum('rect[data-lane="missed"]')).toBe(4);
    expect(sum('rect[data-seg="untagged"]')).toBe(1);
    expect(text(container, '[data-avg-mark]')).toBe('Avg 22 ft');
    expect(screen.getByText('6 of 7 shots measured')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^6 approaches with a measured leave: 2 hit the green, 4 missed\. Average 22 ft\.$/ })).toBeInTheDocument();
    expectClean(container);
  });

  it('draws the tour mark for the picked band from the refs only, and never for All', () => {
    const { container } = renderApproach(approaches, { refs: PGA_REFS });
    expect(container.querySelector('[data-tour-ring]')).toBeNull();
    expect(container.querySelector('[data-tour-tick]')).toBeNull();
    expect(container.querySelector('[data-tour-label]')).toBeNull();
    expect(screen.getByText('Pick a distance to see the tour average for its range.')).toBeInTheDocument();

    fireEvent.click(bandButton('125–150'));
    expect(Number(container.querySelector('[data-tour-ring]')!.getAttribute('r'))).toBe(30 * FT);
    expect(text(container, '[data-tour-tick]')).toBe('PGA Tour 30 ft');
    expect(text(container, '[data-tour-label]')).toBe('PGA Tour 30 ftfrom 125–175 yd');
    expect(text(container, '[data-tour-caption]')).toBe('Dashed ring: PGA Tour 30 ft, 125–175 yd, the tour range 125–150 yd falls in.');

    fireEvent.click(bandButton('75–100'));
    expect(Number(container.querySelector('[data-tour-ring]')!.getAttribute('r'))).toBe(18 * FT);
    expect(text(container, '[data-tour-caption]')).toBe('Dashed ring: PGA Tour 18 ft, 50–125 yd, the tour range 75–100 yd falls in.');
    expectClean(container);
  });

  it('names the team’s tour and draws nothing for a missing ref', () => {
    const lpga = renderApproach(approaches, { refs: PGA_REFS, tourLabel: 'LPGA' });
    fireEvent.click(bandButton('125–150'));
    expect(text(lpga.container, '[data-tour-tick]')).toBe('LPGA 30 ft');
    lpga.unmount();

    const none = renderApproach(approaches, { refs: { ...PGA_REFS, proximity: { ...PGA_REFS.proximity, '125_175': null } } });
    fireEvent.click(bandButton('125–150'));
    expect(none.container.querySelector('[data-tour-ring]')).toBeNull();
    expect(none.container.querySelector('[data-tour-tick]')).toBeNull();
    expect(none.container.querySelector('[data-tour-caption]')).toBeNull();
    none.unmount();

    const empty = renderApproach(approaches, { refs: NO_REFS });
    fireEvent.click(bandButton('125–150'));
    expect(empty.container.querySelector('[data-tour-ring]')).toBeNull();
    expectClean(empty.container);
  });

  it('breaks down where the missed greens finished', () => {
    const { container } = renderApproach();
    // Misses: 2 on short grass, 2 in the rough, 1 in a bunker; nothing else, so no "other" row.
    expect([...container.querySelectorAll('[data-finish-row]')].map((r) => r.textContent)).toEqual([
      'Short grass40%2',
      'Rough40%2',
      'Bunker20%1',
    ]);
    expect(screen.getByText('5 misses · 71% of shots')).toBeInTheDocument();
    expectClean(container);
  });

  it('keeps an "other" finish row when a miss has one', () => {
    const { container } = renderApproach([...approaches, shot({ fromYards: 120, finish: 'other', leaveFeet: 25, miss: 'right' })]);
    expect(text(container, '[data-finish-row="other"]')).toBe('Other17%1');
    expect(container.querySelector('g[data-mark][data-direction="right"]')).toHaveAttribute('data-finish', 'other');
    expectClean(container);
  });

  it('shows each direction’s share of tagged misses and inks every leader on a tie', () => {
    const { container } = renderApproach();
    const wedges = container.querySelectorAll('path[data-direction]');
    expect([...wedges].map((w) => w.getAttribute('data-direction')).sort()).toEqual(['long', 'short_left']);
    expect([...wedges].every((w) => w.getAttribute('data-dominant') === 'true')).toBe(true);
    expect(container.querySelector('[data-rose-label="short_left"]')).toHaveTextContent('50%');
    expect(container.querySelector('[data-rose-label="long"]')).toHaveTextContent('Long50%');
    expect(container.querySelector('[data-rose-label="right"]')).toHaveTextContent('Right0%');
    expect(screen.getByRole('img', { name: /Tagged misses by direction: long left 0%, long 50%/ })).toBeInTheDocument();
    expect(screen.getByText('Long and short left tie as the most common miss: 50% of tagged misses each.')).toBeInTheDocument();
    expect(screen.getByText('Where 4 tagged misses go')).toBeInTheDocument();
    expectClean(container);
  });

  it('reads each lie it was played from and filters the card on a tap', () => {
    const { container } = renderApproach();
    const row = (lie: string) => container.querySelector(`[data-lie="${lie}"]`);
    expect([...container.querySelectorAll('[data-lie]')].map((r) => r.getAttribute('data-lie'))).toEqual(['tee', 'fairway', 'rough', 'sand']);
    expect(row('tee')).toHaveTextContent('Tee (par 3s)100%10 ft1');
    expect(row('fairway')).toHaveTextContent('Fairway25%24 ft4');
    expect(row('rough')).toHaveTextContent('Rough0%25 ft2');
    expect(row('sand')).toHaveTextContent('Sand0');
    expect(row('sand')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('The tick is every lie together: 29% on the green. Grey bars have under 5 shots.')).toBeInTheDocument();

    fireEvent.click(row('fairway')!);
    expect(row('fairway')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Whole team · 4 shots · 50–250 yd · from the fairway')).toBeInTheDocument();
    expect(figure(container)).toBe('24 ft');
    expect(screen.getByText('25% hit the green')).toBeInTheDocument();
    // The picker reads the lie too.
    expect(bandButton('125–150')).toHaveTextContent('125–15030 ft');
    expect(bandButton('100–125')).toHaveTextContent('100–125no shots');

    // A lie with no shots does nothing; the picked lie clears on a second tap.
    fireEvent.click(row('sand')!);
    expect(row('sand')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(row('fairway')!);
    expect(row('fairway')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Whole team · 7 shots · 50–250 yd')).toBeInTheDocument();
    expectClean(container);
  });

  it('lists an "other" lie only when it has shots', () => {
    const { container } = renderApproach([...approaches, shot({ fromYards: 150, lie: 'other', onGreen: true, leaveFeet: 16 })]);
    expect(container.querySelector('[data-lie="other"]')).toHaveTextContent('Other100%16 ft1');
    expectClean(container);
  });

  it('keeps the picker when a band is empty so the coach can get back', () => {
    const { container } = renderApproach([approaches[0]!]);
    fireEvent.click(bandButton('175–200'));
    expect(screen.getByText('No approaches from 175–200 yd')).toBeInTheDocument();
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    fireEvent.click(bandButton('All'));
    expect(figure(container)).toBe('20 ft');
    expectClean(container);
  });

  it('ambers a band that finishes further from the pin than the slice’s own distance trend', () => {
    const many = (fromYards: number, leaveFeet: number): ApproachShot[] =>
      Array.from({ length: 8 }, () => shot({ fromYards, onGreen: true, leaveFeet }));
    // On a line of 12 ft + 0.12 ft per yard, except 110 yd, which leaves 40 ft.
    // 60 yd leaves the most feet per yard (0.32) yet sits on the trend.
    const trend = [...many(60, 19.2), ...many(90, 22.8), ...many(140, 28.8), ...many(190, 34.8)];
    const { container, unmount } = renderApproach([...trend, ...many(110, 40)]);
    expect([...container.querySelectorAll('[data-flagged]')].map((b) => b.getAttribute('data-band'))).toEqual(['100']);
    expect(container.querySelector('[data-band="50"]')).not.toHaveAttribute('data-flagged');
    expect(
      screen.getByText('Amber bands finish further from the pin than the trend across all bands predicts for their distance.'),
    ).toBeInTheDocument();
    expectClean(container);
    unmount();

    // Two bands are not a trend: nothing is judged.
    const two = renderApproach([...many(110, 40), ...many(160, 30)]);
    expect(two.container.querySelector('[data-flagged]')).toBeNull();
    expect(screen.queryByText(/^Amber bands/)).toBeNull();
  });

  it('says so when the slice has no approaches from 50 to 250 yd', () => {
    const { container, unmount } = renderApproach([approaches[7]!]);
    expect(screen.getByText('No approaches from 50 to 250 yd')).toBeInTheDocument();
    expect(screen.getByText("1 approach in these rounds was outside this card's range.")).toBeInTheDocument();
    expect(within(container).queryByRole('group')).toBeNull();
    expectClean(container);
    unmount();

    const none = renderApproach([]);
    expect(screen.getByText('No approach shots tracked in these rounds')).toBeInTheDocument();
    expect(within(none.container).queryByRole('group')).toBeNull();
    expectClean(none.container);
  });
});
