import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../../__tests__/dialog-polyfill';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
vi.mock('@/app/golf/actions/team-management', () => ({ updatePlayerStatus: vi.fn(), setPlayerAvailability: vi.fn(), setPlayerAvailabilityCoachNote: vi.fn() }));
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: vi.fn() }));
vi.mock('@/app/golf/actions/roster', () => ({ removePlayerFromTeam: vi.fn() }));
vi.mock('@/app/golf/actions/teams', () => ({ acceptJoinRequest: vi.fn(), rejectJoinRequest: vi.fn(), getTeamJoinRequests: vi.fn() }));

import type { ChRosterPlayer } from '../../../data/roster';
import { PREVIEW_ROSTER } from '../../../preview/fixtures-roster';
import { ToastProvider } from '../../../ui/Toast';
import { Roster } from '../Roster';
import { RosterPeek } from '../RosterPeek';
import { RosterProfileCrh } from '../RosterProfileCrh';

/*
 * F-0005 (audit 2026-11-13): Cole's card read "Strokes gained −6.1 a round" beside "Rounds 2" under "over the season", and the
 * phone profile drew it in the "This season" card; the figure was his last eight rounds with strokes gained, from June and July.
 * Wherever the roster draws the figure it now names its window.
 */

afterEach(cleanup);

const CLOCK = { tz: 'America/New_York', day: '2026-11-13' };
const cole: ChRosterPlayer = { ...PREVIEW_ROSTER.players[0]!, rounds: 2, sgPerRound: -6.08, sgWindow: { n: 8, from: '2026-06-08', to: '2026-07-10' } };
const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);
const availability = { set: vi.fn(), pending: false };

describe('F-0005 a roster strokes gained figure names its window', () => {
  it('the phone profile names it inside the "This season" card', () => {
    const { container } = render(wrap(<RosterProfileCrh p={cole} notesLocked={false} statsError={false} onNoteSaved={vi.fn()} availability={availability} helm={{ status: 'off' }} clock={CLOCK} sgVs="vs Tour" onNoteDirty={vi.fn()} />));
    const sg = [...container.querySelectorAll('.ch-rsx-figs > div')].find((d) => d.querySelector('dt')?.textContent === 'SG / round')!;
    expect(within(sg as HTMLElement).getByText('Last 8 · Jun–Jul')).toBeTruthy();
    expect(sg.textContent).toContain('vs Tour');
  });

  it('the desktop peek names it under SG / round', () => {
    const { container } = render(wrap(<RosterPeek p={cole} notesLocked={false} onClose={vi.fn()} onNoteSaved={vi.fn()} availability={availability} helm={{ status: 'off' }} clock={CLOCK} />));
    const sg = [...container.querySelectorAll('.ch-rs-peek__figs > div')].find((d) => d.querySelector('dt')?.textContent === 'SG / round')!;
    expect(sg.textContent).toContain('Last 8 · Jun–Jul');
  });

  it("the desktop card names it under the strokes gained bar", () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({ matches: query.includes('hover: hover'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList);
    const { container } = render(wrap(<Roster data={{ ...PREVIEW_ROSTER, players: [cole, ...PREVIEW_ROSTER.players.slice(1)] }} />));
    const fig = [...container.querySelectorAll('.ch-rs-fig')].find((f) => f.querySelector('.ch-rs-fig__k')?.textContent === 'Strokes gained' && f.textContent?.includes('6.1'))!;
    expect(fig.querySelector('.ch-rs-fig__m')?.textContent).toBe('Last 8 · Jun–Jul');
  });

  it('a player with no strokes gained draws no window', () => {
    const { container } = render(wrap(<RosterPeek p={{ ...cole, sgPerRound: null, sgWindow: null }} notesLocked={false} onClose={vi.fn()} onNoteSaved={vi.fn()} availability={availability} helm={{ status: 'off' }} clock={CLOCK} />));
    expect(container.textContent).not.toContain('Last ');
  });
});
