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
import { TeeCause } from '../TeeCause';

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

const drives: TeeShot[] = [
  { ri: 0, zone: 'fairway', yards: 280 },
  { ri: 0, zone: 'right', yards: 300 },
  { ri: 0, zone: 'right', yards: null },
  { ri: 1, zone: 'left', yards: 260 },
];

describe('TeeCause', () => {
  it('leads with the average drive and fairway %, and plots every sided drive', () => {
    const { container } = render(<TeeCause data={payload({ tee: drives })} allowed={BOTH_ROUNDS} playerId={null} playerName={null} />);
    expect(figure(container)).toBe('280 yd');
    expect(screen.getByText('avg drive')).toBeInTheDocument();
    expect(screen.getByText('25% fairways')).toBeInTheDocument();
    expect(screen.getByText('Whole team · 4 drives')).toBeInTheDocument();
    expect(screen.getByText('Dots sit in the zone each drive finished in.')).toBeInTheDocument();

    expect(container.querySelectorAll('circle[data-zone]')).toHaveLength(4);
    expect(container.querySelectorAll('circle[data-zone="right"]')).toHaveLength(2);
    // The drive with no measured length is drawn hollow, and the caption says so.
    expect(container.querySelectorAll('circle[data-measured="false"]')).toHaveLength(1);
    expect(screen.getByText(/hollow dots had no length measured/)).toBeInTheDocument();
    expectClean(container);
  });

  it('shows the untagged-miss legend entry only when there is one', () => {
    const { container, unmount } = render(
      <TeeCause data={payload({ tee: drives })} allowed={BOTH_ROUNDS} playerId={null} playerName={null} />,
    );
    expect(container.querySelector('[data-legend="miss"]')).toBeNull();
    expect(container.querySelector('[data-legend="penalty"]')).not.toBeNull();
    expect(screen.queryByText('Not on the map')).toBeNull();
    unmount();

    const withMiss = [...drives, { ri: 0, zone: 'miss' as const, yards: 250 }, { ri: 0, zone: 'penalty' as const, yards: null }];
    const view = render(<TeeCause data={payload({ tee: withMiss })} allowed={BOTH_ROUNDS} playerId={null} playerName={null} />);
    expect(view.container.querySelector('[data-legend="miss"]')).toHaveTextContent('Missed, no side17%');
    // Neither has a side, so neither is drawn on the hole; both sit in the strip under it.
    expect(view.container.querySelectorAll('circle[data-zone]')).toHaveLength(4);
    expect(screen.getByText('Not on the map')).toBeInTheDocument();
    expect(view.container.querySelector('[data-offmap="penalty"]')).toHaveTextContent('1 penalty');
    expect(view.container.querySelector('[data-offmap="miss"]')).toHaveTextContent('1 missed with no side tagged');
    expectClean(view.container);
  });

  it('falls back to fairway % when no drive length was measured', () => {
    const noYards: TeeShot[] = [
      { ri: 0, zone: 'fairway', yards: null },
      { ri: 0, zone: 'left', yards: null },
      { ri: 0, zone: 'penalty', yards: null },
    ];
    const { container } = render(<TeeCause data={payload({ tee: noYards })} allowed={BOTH_ROUNDS} playerId={null} playerName={null} />);
    expect(figure(container)).toBe('33%');
    expect(screen.getByText('fairways hit')).toBeInTheDocument();
    expect(screen.getByText('1 penalty')).toBeInTheDocument();
    expect(screen.getByText('No drive lengths were measured in this slice.')).toBeInTheDocument();
    expect(screen.queryByText(/\d+ yd/)).toBeNull();
    expectClean(container);
  });

  it("filters to the picked player's drives", () => {
    const { container } = render(
      <TeeCause data={payload({ tee: drives })} allowed={BOTH_ROUNDS} playerId="p2" playerName="Blake Hart" />,
    );
    expect(screen.getByText('Blake Hart · 1 drive')).toBeInTheDocument();
    expect(figure(container)).toBe('260 yd');
    expect(container.querySelectorAll('circle[data-zone]')).toHaveLength(1);
    expectClean(container);
  });

  it('says so when the slice has no tee shots', () => {
    const { container } = render(<TeeCause data={payload({ tee: drives })} allowed={new Set()} playerId={null} playerName={null} />);
    expect(screen.getByText('No tee shots tracked in these rounds')).toBeInTheDocument();
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    expectClean(container);
  });
});

// ---------------------------------------------------------------------------
// Approach
// ---------------------------------------------------------------------------

