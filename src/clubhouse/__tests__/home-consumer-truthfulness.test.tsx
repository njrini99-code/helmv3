import { LazyMotion, domAnimation } from 'framer-motion';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import type { ChHomeEvent } from '../data/home';
import type { ChScoringPoint } from '../data/player-home';
import { PREVIEW_PLAYER_HOME } from '../preview/fixtures-player-home';
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
