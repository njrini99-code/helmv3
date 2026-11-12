import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Team rounds' season figures leave practice out, as Stats does (owner, 11 Nov 2026), and say so; the list runs back past
 * 1 August, so it marks where the season's figures stop.
 */
const phone = vi.hoisted(() => ({ on: false }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => phone.on }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/rounds' }));

import '../../../__tests__/dialog-polyfill';
import { PREVIEW_TEAM_ROUNDS, PREVIEW_TEAM_ROUNDS_EARLIER } from '../../../preview/fixtures-team-rounds';
import { CrumbProvider } from '../../../shell/crumbs';
import { PhoneChromeProvider } from '../../../shell/phone-chrome';
import { ToastProvider } from '../../../ui/Toast';
import { TeamRounds } from '../TeamRounds';
import type { ChTeamRounds } from '../../../data/team-rounds-shape';

const show = (data: ChTeamRounds, onPhone = false) => {
  phone.on = onPhone;
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <CrumbProvider>
          <PhoneChromeProvider>
            <div className="ch-root" data-ui="clubhouse">
              <TeamRounds data={data} teamId="t1" />
            </div>
          </PhoneChromeProvider>
        </CrumbProvider>
      </ToastProvider>
    </LazyMotion>,
  );
};
const figures = () => [...screen.getByLabelText('The team this season').querySelectorAll('.ch-fgr__c')].map((c) => [...c.children].map((x) => x.textContent));

afterEach(() => {
  cleanup();
  phone.on = false;
  sessionStorage.clear();
});

describe('Team rounds · the season figures leave practice out', () => {
  // The fixture: 14 eighteen-hole rounds since 1 August by five players, eight of them practice. The six others are 72, 75, 71, 74, 76 and 70.
  it('counts every round, and reads the average, under par and the low round from the six that are not practice', () => {
    show(PREVIEW_TEAM_ROUNDS);
    expect(figures()).toEqual([
      ['Rounds', '14', '5 players · 8 practice'],
      ['Average', '73.0', '18 holes, no practice'],
      ['Under par', '0', 'of 6'],
      ['Low round', '70', 'Priya · E'],
    ]);
    expect(screen.getByText('Varsity · Since August 1 · 6 counted rounds')).toBeTruthy();
  });

  it('on a phone each figure keeps one short caption, and the average still says practice is out', () => {
    show(PREVIEW_TEAM_ROUNDS, true);
    expect(figures().map((f) => f[2])).toEqual(['5 players', 'no practice', 'of 6', 'Priya · E']);
  });

  it('a month’s caption averages the same rounds: October’s 72, 75 and 71', () => {
    show(PREVIEW_TEAM_ROUNDS);
    const table = screen.getByRole('table', { name: 'Team rounds' });
    expect(within(table).getByText('7 rounds · avg 72.7')).toBeTruthy();
    // August has one round, a practice round: listed and counted, with no average to show.
    expect([...table.querySelectorAll('.ch-trd-grp__m')].map((m) => m.textContent)).toEqual(['7 rounds · avg 72.7', '6 rounds · avg 73.3', '1 round']);
  });

  it('with no practice round the captions are as they were', () => {
    const list = PREVIEW_TEAM_ROUNDS.rounds.list.filter((r) => r.type !== 'practice');
    show({ ...PREVIEW_TEAM_ROUNDS, rounds: { list, error: false }, season: { ...PREVIEW_TEAM_ROUNDS.season, rounds: 6, players: 3, practice: 0 } });
    expect(figures().map((f) => f[2])).toEqual(['3 players', '18 holes', 'of 6', 'Priya · E']);
  });
});

describe('Team rounds · where the season ends', () => {
  const LINE = 'Before this season, not in the figures above';

  it('by month, the table says so once, above the first month before 1 August', () => {
    show(PREVIEW_TEAM_ROUNDS_EARLIER);
    const lines = screen.getAllByText(LINE);
    expect(lines).toHaveLength(1);
    const group = lines[0]!.closest('[role="rowgroup"]')!;
    expect(within(group as HTMLElement).getByRole('heading', { name: 'May 2026' })).toBeTruthy();
    // The line is a row of the table, above the month's band.
    expect(lines[0]!.closest('[role="row"]')!.nextElementSibling!.className).toBe('ch-trd-grp');
    // Last season's rounds are listed and are in none of the figures.
    expect(figures()[0]).toEqual(['Rounds', '14', '5 players · 8 practice']);
  });

  it('on a phone the line sits between the two month cards', () => {
    show(PREVIEW_TEAM_ROUNDS_EARLIER, true);
    const line = screen.getByText(LINE);
    expect(line.tagName).toBe('P');
    expect(within(line.nextElementSibling as HTMLElement).getByRole('heading', { name: 'May 2026' })).toBeTruthy();
    expect(within(line.previousElementSibling as HTMLElement).getByRole('heading', { name: 'August 2026' })).toBeTruthy();
  });

  it('is not drawn when every listed round is in the season, or when the list is by player', () => {
    show(PREVIEW_TEAM_ROUNDS);
    expect(screen.queryByText(LINE)).toBeNull();
    cleanup();
    show(PREVIEW_TEAM_ROUNDS_EARLIER);
    fireEvent.click(screen.getByRole('radio', { name: 'By player' }));
    expect(screen.getByRole('table', { name: 'Team rounds' }).className).toContain('is-by-player');
    expect(screen.queryByText(LINE)).toBeNull();
  });
});
