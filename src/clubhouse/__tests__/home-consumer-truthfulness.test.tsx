import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import type { ChHomeEvent } from '../data/home';
import type { ChScoringPoint } from '../data/player-home';
import { PREVIEW_LEGS, PREVIEW_QUEUE } from '../preview/fixtures';
import { PREVIEW_PLAYER_HOME } from '../preview/fixtures-player-home';
import { CoachQueue } from '../screens/home/CoachQueue';
import { TeamLegs, TeamLegsPhone } from '../screens/home/TeamLegs';
import { UpNext, whenLabel } from '../screens/home/HomePhone';
import { PlayerGame } from '../screens/home/PlayerGame';
import { ToastProvider } from '../ui/Toast';

afterEach(cleanup);

const event = (over: Partial<ChHomeEvent> = {}): ChHomeEvent => ({
  id: 'e1', title: 'Tournament', type: 'tournament', date: '2026-10-02', timezone: 'Pacific/Kiritimati',
  startIso: '2026-10-02T00:00:00Z', endIso: null, allDay: true, startLabel: 'All day', rangeLabel: 'All day',
  location: null, invitees: null, going: null, conflict: false, ...over,
});

describe('Home event labels use the team clock', () => {
  it('says Today in a team zone already on tomorrow relative to the device', () => {
    expect(whenLabel(event(), new Date('2026-10-01T16:00:00Z')).text).toBe('Today · all day');
  });

  it('says Tomorrow for a timed event on the team’s tomorrow even while the device is on the prior day', () => {
    const next = event({ date: '2026-10-03', allDay: false, startIso: '2026-10-02T18:00:00Z', startLabel: '8:00 AM' });
    expect(whenLabel(next, new Date('2026-10-01T16:00:00Z')).text).toBe('Tomorrow · 8:00 AM');
  });

  it('preserves the instant-based Happening now label across different device and team dates', () => {
    const live = event({ allDay: false, startIso: '2026-10-01T15:30:00Z', endIso: '2026-10-01T17:00:00Z', startLabel: '5:30 AM' });
    expect(whenLabel(live, new Date('2026-10-01T16:00:00Z'))).toEqual({ text: 'Happening now', soon: true });
  });

  it('omits the paired attendance claim when identities cannot supply the complete denominator', () => {
    render(<UpNext e={event({ invitees: ['Ada Lin', 'Bo Fox'], going: null })} now={new Date('2026-10-01T16:00:00Z')} />);
    expect(screen.queryByText(/of 2 going/)).toBeNull();
    expect(screen.getByRole('link', { name: /Tournament/ })).toBeTruthy();
  });
});

function showScoring(points: ChScoringPoint[]) {
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <PlayerGame data={{ ...PREVIEW_PLAYER_HOME, scoring: { points, error: false }, legs: null }} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}
const point = (id: string, score: number, par: number | null): ChScoringPoint => ({ id, label: id, score, par });
const underFigure = () => screen.getByText('Under par').closest('div')!;
const chart = () => screen.getByRole('img', { name: /Your scores over/ });

describe('Home scoring distinguishes unknown par', () => {
  it('uses only rounds with recorded par for the under-par figure and does not invent a common chart par', () => {
    showScoring([point('Oct 1', 71, 72), point('Oct 2', 70, null)]);
    expect(within(underFigure()).getByText('1 of 1')).toBeTruthy();
    expect(within(underFigure()).getByText('Rounds with par recorded')).toBeTruthy();
    expect(within(chart()).queryByText('Par 72')).toBeNull();
  });

  it('leaves Under par absent rather than zero when no round has a par', () => {
    showScoring([point('Oct 1', 71, null), point('Oct 2', 70, null)]);
    expect(within(underFigure()).queryByText('0 of 2')).toBeNull();
    expect(within(underFigure()).getByText('—')).toBeTruthy();
    expect(within(chart()).queryByText(/Par/)).toBeNull();
  });

  it('retains the complete denominator and chart par when every round has the same recorded par', () => {
    showScoring([point('Oct 1', 71, 72), point('Oct 2', 73, 72)]);
    expect(within(underFigure()).getByText('1 of 2')).toBeTruthy();
    expect(within(chart()).getByText('Par 72')).toBeTruthy();
  });
});

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);

describe('Coach Home’s four parts say what didn’t load, and only that', () => {
  it.each([
    ['desktop', TeamLegs],
    ['phone', TeamLegsPhone],
  ])('%s: the up-and-down (CH-2218) and Tour (CH-2219) notices show only with their own flag', (_, Legs) => {
    const { unmount } = render(<Legs legs={PREVIEW_LEGS} />);
    expect(code('CH-2218')).toBeNull();
    expect(code('CH-2219')).toBeNull();
    unmount();
    const r2 = render(<Legs legs={{ ...PREVIEW_LEGS, cacheError: true }} />);
    expect(code('CH-2218')!.textContent).toMatch(/Up-and-down figures didn’t load/);
    expect(code('CH-2219')).toBeNull();
    r2.unmount();
    render(<Legs legs={{ ...PREVIEW_LEGS, tourError: true }} />);
    expect(code('CH-2219')!.textContent).toMatch(/Tour marks didn’t load/);
    expect(code('CH-2218')).toBeNull();
  });

  it('covered: the page’s notice carries Try again, so each inline notice keeps only its title', () => {
    render(<TeamLegs legs={{ ...PREVIEW_LEGS, cacheError: true, tourError: true }} covered />);
    for (const c of ['CH-2218', 'CH-2219']) {
      expect(code(c)!.textContent).toMatch(/didn’t load$/);
      expect(within(code(c) as HTMLElement).queryByRole('button')).toBeNull();
    }
  });
});

describe('20104 “Waiting on you” counts only what loaded', () => {
  const zeros = { joinRequests: 0, replies: { missing: 0, events: [] }, overdueTasks: 0, unackedPosts: 0 };
  it('is absent when every part is 0, and when there is no queue', () => {
    const { container, rerender } = render(<CoachQueue queue={zeros} />);
    expect(container.innerHTML).toBe('');
    rerender(<CoachQueue queue={undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('CH-2220 shows only with a part that failed; that part is left out, never shown as 0', () => {
    const { rerender } = render(<CoachQueue queue={PREVIEW_QUEUE} />);
    expect(code('CH-2220')).toBeNull();
    rerender(<CoachQueue queue={{ ...PREVIEW_QUEUE, overdueTasks: null }} />);
    const nav = screen.getByRole('navigation', { name: 'Waiting on you' });
    expect(within(nav).queryByText(/task/)).toBeNull();
    expect(within(nav).queryByText(/^0 /)).toBeNull();
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['1 join request', '3 replies missing', '1 post awaiting acknowledgement']);
    expect(code('CH-2220')!.textContent).toBe('· some items didn’t load');
  });

  it('CH-2220 with every part failing, the row says so alone; covered by the page’s notice, nothing is drawn', () => {
    const failed = { joinRequests: null, replies: null, overdueTasks: null, unackedPosts: null };
    const { container, rerender } = render(<CoachQueue queue={failed} />);
    expect(code('CH-2220')!.textContent).toBe('some items didn’t load');
    rerender(<CoachQueue queue={failed} covered />);
    expect(container.innerHTML).toBe('');
    rerender(<CoachQueue queue={{ ...PREVIEW_QUEUE, unackedPosts: null }} covered />);
    expect(code('CH-2220')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });
});
