import { LazyMotion, domAnimation } from 'framer-motion';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Q-123 on the screens: a round posted as a total only is in the scores and in no hole-level figure, and a card or section whose
 * round count is fewer than the window's says how many rounds it covers ("Hole stats from 3 of 5 rounds"). The numbers come from the
 * loaders (stats-total-only.test.tsx); these tests are the words.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/stats' }));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));

import { filterFor } from '../data/stats-filter';
import type { ChPlayerProfile } from '../data/stats-player';
import type { ChTeamStats } from '../data/stats-team';
import { StatsPlayer } from '../screens/stats/StatsPlayer';
import { StatsTeam } from '../screens/stats/StatsTeam';
import { CrumbProvider } from '../shell/crumbs';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_PLAYER, PREVIEW_TEAM_STATS } from '../preview/fixtures-stats';

function shell(node: React.ReactNode) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <CrumbProvider>
          <PhoneChromeProvider>
            <div className="ch-root" data-ui="clubhouse">
              {node}
            </div>
          </PhoneChromeProvider>
        </CrumbProvider>
      </ToastProvider>
    </LazyMotion>,
  );
}
function SlotHost() {
  const { setSlot } = usePhoneChromeState();
  return <div ref={setSlot} data-testid="phone-top" />;
}
const player = (win: Partial<ChPlayerProfile['win']>, extra: Partial<ChPlayerProfile['extra']>): ChPlayerProfile => ({
  ...PREVIEW_PLAYER,
  win: { ...PREVIEW_PLAYER.win, ...win },
  extra: { ...PREVIEW_PLAYER.extra, ...extra },
});
const team = (over: Partial<ChTeamStats> = {}): ChTeamStats => ({ ...PREVIEW_TEAM_STATS, ...over });
const openTab = (name: RegExp) => userEvent.setup().click(screen.getByRole('tab', { name }));
const COVERAGE = 'Hole stats from 3 of 5 rounds';

afterEach(() => cleanup());

describe('Player stats · desktop', () => {
  it('Overview: greens, fairways, putts and scrambling say how many rounds they read, and count that many, when some are totals', () => {
    shell(<StatsPlayer data={player({ rounds: 5, effRounds: 5, holeRounds: 3 }, { holeRounds: 3 })} coachId="c1" />);
    const notes = [...document.querySelectorAll('.ch-fg__n')].map((n) => n.textContent);
    expect(notes).toEqual([COVERAGE, COVERAGE, COVERAGE, COVERAGE]);
    // The scoring card is a score: it counts all five.
    expect(screen.getAllByText(/\b5 rounds\b/).length).toBeGreaterThan(0);
  });

  it('Overview: the table against the team or the Tour says it too, and that the scoring rows read every round', () => {
    shell(<StatsPlayer data={player({ rounds: 5, effRounds: 5, holeRounds: 3 }, { holeRounds: 3 })} coachId="c1" />);
    expect(screen.getByText(/^Hole stats from 3 of 5 rounds; the scoring average and the pressure gap read all 5\. /)).toBeTruthy();
  });

  it('Overview: with every round holed there is no coverage line', () => {
    shell(<StatsPlayer data={player({ rounds: 10, effRounds: 10, holeRounds: 10 }, { holeRounds: 10 })} coachId="c1" />);
    expect(document.querySelector('.ch-fg__n')).toBeNull();
    expect(screen.queryByText(/Hole stats from/)).toBeNull();
  });

  it('Game detail: every section says the hole stats come from 3 of the 5 rounds, the rest posted as a total only', async () => {
    shell(<StatsPlayer data={player({ rounds: 5, effRounds: 5, holeRounds: 3 }, { holeRounds: 3 })} coachId="c1" />);
    await openTab(/Game detail/);
    const rules = [...document.querySelectorAll('.ch-gx-rule')].map((r) => r.textContent ?? '');
    expect(rules.filter((r) => r.includes(`${COVERAGE}, the rest posted as a total only`)).length).toBeGreaterThanOrEqual(5);
    // The rounds line counts the hole rounds: the putts and approaches are theirs.
    expect(screen.getByText(/^3 rounds · \d+ putts · \d+ approaches logged$/)).toBeTruthy();
  });

  it('Game detail: a window with every round holed says nothing of coverage', async () => {
    shell(<StatsPlayer data={player({ rounds: 10, effRounds: 10, holeRounds: 10 }, { holeRounds: 10 })} coachId="c1" />);
    await openTab(/Game detail/);
    expect([...document.querySelectorAll('.ch-gx-rule')].some((r) => (r.textContent ?? '').includes('Hole stats from'))).toBe(false);
  });

  it('Rounds tab: the comparison with the ten before says how many rounds greens, fairways and putts read', async () => {
    const compare = { ...PREVIEW_PLAYER.extra.compare!, lastRounds: 10, previousRounds: 8, lastHoleRounds: 8, previousHoleRounds: 8 };
    shell(<StatsPlayer data={player({}, { compare })} coachId="c1" />);
    await openTab(/^Rounds/);
    expect(screen.getByText('Greens, fairways and putts: hole stats from 8 of 10 latest rounds and 8 of 8 before them.')).toBeTruthy();
  });

  it('Rounds tab: no line when every round has its holes', async () => {
    shell(<StatsPlayer data={player({}, {})} coachId="c1" />);
    await openTab(/^Rounds/);
    expect(screen.queryByText(/hole stats from/)).toBeNull();
  });
});

describe('Team stats · phone', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
  });

  it('says under the figures how many of the window’s rounds the hole stats read', () => {
    shell(
      <>
        <SlotHost />
        <StatsTeam data={team({ filter: filterFor('season'), window: 'season', roundCount: 5, holeRoundCount: 3 })} />
      </>,
    );
    expect(screen.getByText(COVERAGE)).toBeTruthy();
  });

  it('says nothing when every round has its holes, or when the loader did not say', () => {
    shell(
      <>
        <SlotHost />
        <StatsTeam data={team({ roundCount: 5, holeRoundCount: 5 })} />
      </>,
    );
    expect(screen.queryByText(/Hole stats from/)).toBeNull();
    cleanup();
    shell(
      <>
        <SlotHost />
        <StatsTeam data={team({ roundCount: 5 })} />
      </>,
    );
    expect(screen.queryByText(/Hole stats from/)).toBeNull();
  });
});
