import '../../../__tests__/dialog-polyfill';
import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_TEAM_STATS } from '../../../preview/fixtures-stats';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));

const { TeamCharts, trendSpan } = await import('../StatsTeamIslands');
type Charts = Parameters<typeof TeamCharts>[0]['data'];

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

const WEEKS = ['May 25', 'Jun 8', 'Jun 15', 'Jun 29', 'Jul 6', 'Sep 21'];
const STARTS = ['2026-05-25', '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-06', '2026-09-21'];

describe('trendSpan', () => {
  it('drops the weeks at the end that no series has a value in', () => {
    expect(trendSpan([[1, 2, null, null]])).toEqual({ from: 0, to: 2 });
  });
  it('keeps a week one player has a value in, though the team has none', () => {
    expect(
      trendSpan([
        [1, 2, null],
        [null, null, 3],
      ]),
    ).toEqual({ from: 0, to: 3 });
  });
  it('keeps a gap inside the range', () => {
    expect(trendSpan([[1, null, 3]])).toEqual({ from: 0, to: 3 });
  });
  it('drops the empty weeks at the start too', () => {
    expect(trendSpan([[null, null, 3, 4]])).toEqual({ from: 2, to: 4 });
  });
  it('with no value anywhere keeps the range, so the chart has its axis', () => {
    expect(trendSpan([[null, null]])).toEqual({ from: 0, to: 2 });
    expect(trendSpan([])).toEqual({ from: 0, to: 0 });
  });
});

/** The owner's real shape: six weeks of scores, strokes gained only to Jul 6. */
function charts(sg: Array<number | null>): Charts {
  const score = [74, 75, 73, 76, 74, 72];
  return {
    ...PREVIEW_TEAM_STATS,
    weeks: WEEKS,
    weekStarts: STARTS,
    team: { ...PREVIEW_TEAM_STATS.team, sg, score, sgHalves: null, scoreHalves: null },
    players: PREVIEW_TEAM_STATS.players.slice(0, 2).map((p) => ({ ...p, sg, score, sgHalves: null, scoreHalves: null })),
  } as Charts;
}
function draw(data: Charts) {
  return render(
    <LazyMotion features={domAnimation}>
      <div className="ch-root" data-ui="clubhouse">
        <TeamCharts data={data} />
      </div>
    </LazyMotion>,
  );
}
const axis = (c: HTMLElement) => [...c.querySelectorAll('.ch-sgt__svg text.ch-tick')].map((t) => t.textContent).filter((t) => WEEKS.includes(t ?? ''));
const noteLine = /Newer rounds have no shot data, so the line stops at Jul 6\./;

describe('the team trend', () => {
  const SG = [0.5, -1.2, 0.4, -2.1, -6.6, null];

  it('Strokes gained: the empty last week leaves the axis and the note says why', () => {
    const { container } = draw(charts(SG));
    expect(axis(container)).toEqual(['May 25', 'Jun 8', 'Jun 15', 'Jun 29', 'Jul 6']);
    expect(container.querySelector('.ch-sgt .ch-note')!.textContent).toMatch(noteLine);
  });

  it('the last week the plot lists sits at its right edge, not part way along', () => {
    const { container } = draw(charts(SG));
    const last = [...container.querySelectorAll<SVGTextElement>('.ch-sgt__svg text.ch-tick')].find((t) => t.textContent === 'Jul 6')!;
    // viewBox 900 wide with 28 of padding on the right.
    expect(Number(last.getAttribute('x'))).toBe(872);
  });

  it('Scoring: every week has a score, so all six stay and nothing is said about shots', () => {
    const { container } = draw(charts(SG));
    expect(axis(container)).not.toContain('Sep 21');
    fireEvent.click(screen.getByRole('radio', { name: /scoring/i }));
    // The lens crossfades, so the outgoing plot can still be in the DOM here; the new one is the only one with Sep 21.
    expect(axis(container)).toContain('Sep 21');
    expect(container.querySelector('.ch-sgt .ch-note')!.textContent).not.toMatch(/shot data/);
  });

  it('a gap inside the range stays on the axis, and no note appears when nothing was dropped', () => {
    const { container } = draw(charts([0.5, null, 0.4, -2.1, -1, 0.2]));
    expect(axis(container)).toEqual(WEEKS);
    expect(container.querySelector('.ch-sgt .ch-note')!.textContent).not.toMatch(/shot data/);
  });
});
