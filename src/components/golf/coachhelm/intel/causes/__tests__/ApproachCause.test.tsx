/**
 * CoachHelm Home cause visuals: off the tee and approach.
 *
 * Pins the honesty contract: headline figures come from the slice's counted
 * shots, a slice with nothing to show says so, the band picker re-reads the
 * figures, a tagged miss is drawn at its measured distance on its tagged
 * direction, greens hit are a separate distance-only layer, a shot with no
 * measured leave is counted but not drawn, and no NaN / undefined ever
 * reaches the page.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ApproachMiss, ApproachShot, IntelRound, TeamIntelligenceData, TeeShot } from '@/lib/golf/team-intelligence/types';
import { ApproachCause } from '../ApproachCause';

function round(id: string, playerId: string): IntelRound {
  return { id, playerId, date: '2026-09-01', type: 'practice', sg: { tee: null, app: null, atg: null, putt: null } };
}

function payload(p: Partial<TeamIntelligenceData> = {}): TeamIntelligenceData {
  return {
    teamId: 't1',
    baselineLabel: 'PGA Tour',
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
}

const figure = (container: HTMLElement) => container.querySelector('[data-figure]')?.textContent;

const PIN = { x: 200, y: 170 };
function polarOf(el: Element): { r: number; deg: number } {
  const dx = Number(el.getAttribute('cx')) - PIN.x;
  const dy = Number(el.getAttribute('cy')) - PIN.y;
  return { r: Math.hypot(dx, dy), deg: (Math.atan2(dy, dx) * 180) / Math.PI };
}

// ---------------------------------------------------------------------------
// Tee
// ---------------------------------------------------------------------------

const approaches: ApproachShot[] = [
  { ri: 0, fromYards: 130, onGreen: true, leaveFeet: 20, miss: null },
  { ri: 0, fromYards: 140, onGreen: false, leaveFeet: 40, miss: 'short_left' },
  { ri: 0, fromYards: 145, onGreen: false, leaveFeet: 30, miss: 'short_left' },
  { ri: 0, fromYards: 160, onGreen: false, leaveFeet: null, miss: 'long' },
  { ri: 1, fromYards: 90, onGreen: true, leaveFeet: 10, miss: null },
  { ri: 1, fromYards: 110, onGreen: false, leaveFeet: 20, miss: 'long' },
  { ri: 1, fromYards: 180, onGreen: false, leaveFeet: 12, miss: null },
  // Outside 75–200 yd: never counted.
  { ri: 1, fromYards: 220, onGreen: true, leaveFeet: 5, miss: null },
];

const renderApproach = (shots: ApproachShot[] = approaches, playerId: string | null = null) =>
  render(<ApproachCause data={payload({ approach: shots })} allowed={BOTH_ROUNDS} playerId={playerId} playerName={null} />);

describe('ApproachCause', () => {
  it('leads with proximity and GIR over 75–200 yd', () => {
    const { container } = renderApproach();
    // Mean of the six measured leaves (20, 40, 30, 10, 20, 12); 2 of 7 on the green.
    expect(figure(container)).toBe('22 ft');
    expect(screen.getByText('29% GIR')).toBeInTheDocument();
    expect(screen.getByText('Whole team · 7 shots · 75–200 yd')).toBeInTheDocument();
    expect(screen.getByText('Distance from the pin is measured; direction is the tagged one of eight.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
    expectClean(container);
  });

  it('re-reads every figure for the picked band', () => {
    const { container } = renderApproach();
    const band = screen.getByRole('button', { name: /^125–150/ });
    expect(band).toHaveTextContent('125–15030 ft');
    fireEvent.click(band);
    expect(band).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'false');
    expect(figure(container)).toBe('30 ft');
    expect(screen.getByText('33% GIR')).toBeInTheDocument();
    expect(screen.getByText('Whole team · 3 shots · 125–150 yd')).toBeInTheDocument();
    expect(screen.getByText('The most common miss is short left: 100% of tagged misses.')).toBeInTheDocument();
    expectClean(container);
  });

  it('draws a tagged miss at its measured distance on its tagged direction', () => {
    const { container } = renderApproach();
    const misses = container.querySelectorAll('circle[data-layer="miss"]');
    expect(misses).toHaveLength(3);

    // Long, 20 ft: straight up from the pin at 44 units (2.2 per foot), nudged only sideways.
    const long = container.querySelector('circle[data-direction="long"]')!;
    expect(Number(long.getAttribute('cy'))).toBeCloseTo(126, 1);
    expect(Math.abs(Number(long.getAttribute('cx')) - 200)).toBeLessThanOrEqual(7);

    // Short left (40 ft and 30 ft): down-left at 135°, each within its octant.
    const shortLeft = [...container.querySelectorAll('circle[data-direction="short_left"]')].map(polarOf);
    expect(shortLeft).toHaveLength(2);
    const radii = shortLeft.map((p) => p.r).sort((a, b) => a - b);
    expect(radii[0]).toBeGreaterThanOrEqual(66 - 0.2);
    expect(radii[0]).toBeLessThan(67);
    expect(radii[1]).toBeGreaterThanOrEqual(88 - 0.2);
    expect(radii[1]).toBeLessThan(89);
    for (const p of shortLeft) expect(Math.abs(p.deg - 135)).toBeLessThanOrEqual(15);
    expectClean(container);
  });

  it('draws greens hit and untagged misses as separate distance-only layers, and never draws an unmeasured leave', () => {
    const { container } = renderApproach();
    const gir = [...container.querySelectorAll('circle[data-layer="gir"]')].map(polarOf);
    expect(gir.map((p) => Math.round(p.r)).sort((a, b) => a - b)).toEqual([22, 44]);
    expect(container.querySelectorAll('circle[data-layer="untagged"]')).toHaveLength(1);
    // 7 shots counted, 6 drawn: the long miss with no measured leave is noted instead.
    expect(container.querySelectorAll('circle[data-layer]')).toHaveLength(6);
    expect(container.querySelector('[data-unplotted]')).toHaveTextContent('1 shot has no measured distance and is counted but not drawn.');
    expect(container.querySelector('[data-legend="untagged"]')).toHaveTextContent('Missed, no direction14%');
    expectClean(container);
  });

  it('shows each direction’s share of tagged misses and ambers every leader on a tie', () => {
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

  it('keeps the picker when a band is empty so the coach can get back', () => {
    const { container } = renderApproach([approaches[0]!]);
    fireEvent.click(screen.getByRole('button', { name: /^175–200/ }));
    expect(screen.getByText('No approaches from 175–200 yd')).toBeInTheDocument();
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    const all = screen.getByRole('button', { name: /^All/ });
    fireEvent.click(all);
    expect(figure(container)).toBe('20 ft');
    expectClean(container);
  });

  it('ambers a band that finishes further from the pin for its distance than the rest', () => {
    const many = (fromYards: number, leaveFeet: number, miss: ApproachMiss | null): ApproachShot[] =>
      Array.from({ length: 8 }, () => ({ ri: 0, fromYards, onGreen: miss == null, leaveFeet, miss }));
    const { container } = renderApproach([...many(110, 40, 'short'), ...many(160, 30, null)]);
    expect(container.querySelector('[data-band="100"]')).toHaveAttribute('data-flagged', 'true');
    expect(container.querySelector('[data-band="150"]')).not.toHaveAttribute('data-flagged');
    expect(screen.getByText('Amber bands finish further from the pin, for their distance, than the other bands.')).toBeInTheDocument();
    expectClean(container);
  });

  it('says so when the slice has no approaches from 75–200 yd', () => {
    const { container } = renderApproach([approaches[7]!]);
    expect(screen.getByText('No approach shots tracked in these rounds')).toBeInTheDocument();
    expect(within(container).queryByRole('group')).toBeNull();
    expectClean(container);
  });
});
