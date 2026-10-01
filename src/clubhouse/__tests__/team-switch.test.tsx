import { LazyMotion, domAnimation } from 'framer-motion';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { use, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The team switcher (catalog/shell.md: CH-1003, CH-1305, CH-1813, CH-1814), found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard' }));
vi.mock('../lib/fonts', () => ({ clubhouseFontVariables: '' }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: true, updatePreferences: vi.fn() }) }));
vi.mock('@/contexts/notification-badge-context', () => ({
  useNotificationBadges: () => ({ notificationsUnread: 0, calendarNotifications: 0, messages: 0, announcements: 0, tasks: 0, travel: 0, refetch: vi.fn() }),
}));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }));
vi.mock('../lib/sign-out', () => ({ chSignOut: vi.fn() }));
const setActiveTeam = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/team-switcher', () => ({ setActiveTeam }));

import type { GolfUserData } from '@/contexts/golf-user-context';
import { ToastProvider } from '../ui/Toast';
import { ClubhouseFrame } from '../shell/ClubhouseFrame';
import { Sidebar } from '../shell/Sidebar';
import { TabBar } from '../shell/TabBar';
import { teamSwitchFor } from '../shell/team-switch';
import type { ChShellData } from '../data/shell';
import './dialog-polyfill';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
function wrap(node: React.ReactNode) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}

const MEN = { id: 't-men', name: "UNCW Men's Golf", gender: 'mens' };
const WOMEN = { id: 't-women', name: "UNCW Women's Golf", gender: 'womens' };
const shell: ChShellData = { nextEvent: null, pendingJoinRequests: null };
const head = (over: Partial<GolfUserData> = {}): GolfUserData =>
  ({ role: 'coach', userId: 'u1', name: 'Maya Reyes', teamName: MEN.name, coachId: 'c1', teamId: MEN.id, coachTeams: [MEN, WOMEN], canSwitchTeams: true, ...over }) as GolfUserData;

const sidebar = (user: GolfUserData) => <Sidebar userData={user} shell={shell} pathname="/golf/dashboard" teamSwitch={teamSwitchFor(user)} />;
const trigger = () => screen.getByRole('button', { name: /Switch team/ });
// TabBar's `role` is the user's role, not an ARIA role; spread so jsx-a11y doesn't read it as one.
const asCoach = { role: 'coach' as const };
const phoneBar = (user: GolfUserData) => <TabBar pathname="/golf/dashboard" shell={shell} {...asCoach} user={{ name: user.name, teamName: user.teamName }} teamSwitch={teamSwitchFor(user)} />;
async function openMore(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^More/ }));
  return (await screen.findByRole('dialog', { name: 'More' })) as HTMLElement;
}

beforeEach(() => {
  // jsdom has no scrolling: RouteFrame sends a new page to the top.
  Element.prototype.scrollTo = vi.fn();
  window.scrollTo = vi.fn() as typeof window.scrollTo;
  hapticSpy.mockClear();
  router.refresh.mockClear();
  setActiveTeam.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('Team switcher · who gets one', () => {
  it('CH-1305 10803 a coach with one team, a coach who cannot switch, and a player see the team as a plain label', () => {
    const cases: GolfUserData[] = [
      head({ coachTeams: [MEN], canSwitchTeams: false }),
      // An assistant staffed on two teams: setActiveTeam refuses them, so no switch is offered.
      head({ canSwitchTeams: false }),
      // The gate passed but the list is one team (the layout's own rule is two or more).
      head({ coachTeams: [MEN] }),
      { role: 'player', userId: 'p1', name: 'Theo Marchetti', teamName: MEN.name, playerId: 'p1', teamId: MEN.id, coachTeams: [MEN, WOMEN], canSwitchTeams: true } as GolfUserData,
    ];
    for (const u of cases) {
      const { unmount } = wrap(sidebar(u));
      expect(screen.queryByRole('button', { name: /Switch team/ })).toBeNull();
      const label = code('CH-1305')!;
      expect(label.tagName).toBe('SPAN');
      expect(label.textContent).toBe(MEN.name);
      unmount();
    }
  });

  it('10803 a coach with no resolved team is not offered a switch either', () => {
    expect(teamSwitchFor(head({ teamId: undefined }))).toBeNull();
  });

  it('two teams that share a name are told apart by their gender', () => {
    const model = teamSwitchFor(head({ coachTeams: [{ id: 'a', name: 'Varsity', gender: 'mens' }, { id: 'b', name: 'Varsity', gender: 'womens' }, { id: 'c', name: 'JV', gender: 'mens' }] }))!;
    expect(model.choices.map((c) => c.label)).toEqual(["Men's · Varsity", "Women's · Varsity", 'JV']);
  });

  it('10803 the phone More sheet lists no teams for a coach who cannot switch', async () => {
    const user = userEvent.setup();
    wrap(phoneBar(head({ canSwitchTeams: false })));
    const sheet = await openMore(user);
    expect(within(sheet).queryByRole('group', { name: 'Team' })).toBeNull();
  });
});

describe('Team switcher · desktop', () => {
  it('CH-1813 the team line is a menu button; it opens both teams with the current one selected', async () => {
    const user = userEvent.setup();
    wrap(sidebar(head()));
    const btn = trigger();
    expect(btn.getAttribute('aria-label')).toBe("GolfHelm, UNCW Men's Golf. Switch team");
    expect(btn.getAttribute('aria-haspopup')).toBe('listbox');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    await user.click(btn);
    const list = await screen.findByRole('listbox', { name: 'Switch team' });
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const options = within(list).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([MEN.name, WOMEN.name]);
    expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    // Nothing is switched by looking.
    expect(setActiveTeam).not.toHaveBeenCalled();
  });

  it('CH-1813 picking the other team calls the action with its id, shows it at once, and refreshes every screen', async () => {
    const user = userEvent.setup();
    setActiveTeam.mockResolvedValue({ success: true });
    wrap(sidebar(head()));
    await user.click(trigger());
    await user.click(await screen.findByRole('option', { name: WOMEN.name }));
    expect(setActiveTeam).toHaveBeenCalledTimes(1);
    expect(setActiveTeam).toHaveBeenCalledWith(WOMEN.id);
    // The new team is on the button before the refresh brings the server's answer.
    expect(trigger().getAttribute('aria-label')).toBe("GolfHelm, UNCW Women's Golf. Switch team");
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    // A pick is a selection tick; a switch that lands says nothing more (the new team is the confirmation).
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(hapticSpy).not.toHaveBeenCalledWith('success');
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('while a switch is in flight the old team\'s page is marked switching (faded, no taps), and the mark lifts once it lands', async () => {
    const user = userEvent.setup();
    let answer!: (r: { success: boolean }) => void;
    setActiveTeam.mockReturnValue(new Promise((r) => (answer = r)));
    wrap(
      <>
        {sidebar(head())}
        <div id="ch-content">Men&apos;s roster</div>
      </>,
    );
    const root = document.querySelector('.ch-root')!;
    await user.click(trigger());
    await user.click(await screen.findByRole('option', { name: WOMEN.name }));
    // The new name is on the button at once; the old team's page is not shown under it.
    await waitFor(() => expect(root.hasAttribute('data-ch-switching')).toBe(true));
    expect(document.getElementById('ch-content')!.getAttribute('aria-busy')).toBe('true');
    answer({ success: true });
    await waitFor(() => expect(root.hasAttribute('data-ch-switching')).toBe(false));
    expect(document.getElementById('ch-content')!.hasAttribute('aria-busy')).toBe(false);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('a refused switch lifts the switching mark too', async () => {
    const user = userEvent.setup();
    setActiveTeam.mockResolvedValue({ success: false, reason: 'unauthorized' });
    wrap(sidebar(head()));
    await user.click(trigger());
    await user.click(await screen.findByRole('option', { name: WOMEN.name }));
    await expectCode('CH-1003');
    expect(document.querySelector('.ch-root')!.hasAttribute('data-ch-switching')).toBe(false);
  });

  it('picking the team you are already on does nothing', async () => {
    const user = userEvent.setup();
    wrap(sidebar(head()));
    await user.click(trigger());
    await user.click(await screen.findByRole('option', { name: MEN.name }));
    expect(setActiveTeam).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('CH-1003 a switch the server refuses says why, goes back to the team you were on, and offers no Retry', async () => {
    const user = userEvent.setup();
    setActiveTeam.mockResolvedValue({ success: false, reason: 'unauthorized' });
    wrap(sidebar(head()));
    await user.click(trigger());
    await user.click(await screen.findByRole('option', { name: WOMEN.name }));
    await expectCode('CH-1003', /Couldn't switch to UNCW Women's Golf/);
    expect(code('CH-1003')!.textContent).toMatch(/You aren't staffed on that team\./);
    expect(within(code('CH-1003') as HTMLElement).queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(trigger().getAttribute('aria-label')).toBe("GolfHelm, UNCW Men's Golf. Switch team");
    expect(router.refresh).not.toHaveBeenCalled();
    expect(hapticSpy).toHaveBeenCalledWith('error');
  });

  it('CH-1003 a switch that fails on the network keeps Retry, and Retry switches', async () => {
    const user = userEvent.setup();
    setActiveTeam.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ success: true });
    wrap(sidebar(head()));
    await user.click(trigger());
    await user.click(await screen.findByRole('option', { name: WOMEN.name }));
    await expectCode('CH-1003', /You're still on UNCW Men's Golf\. Try again\./);
    expect(trigger().getAttribute('aria-label')).toBe("GolfHelm, UNCW Men's Golf. Switch team");
    await user.click(within(code('CH-1003') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(setActiveTeam).toHaveBeenCalledTimes(2);
    expect(setActiveTeam).toHaveBeenLastCalledWith(WOMEN.id);
  });

  it('CH-1813 the keyboard drives it: Arrow opens on the current team, arrows move, Enter picks, Esc closes and gives focus back', async () => {
    const user = userEvent.setup();
    setActiveTeam.mockResolvedValue({ success: true });
    wrap(sidebar(head()));
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    const men = await screen.findByRole('option', { name: MEN.name });
    await waitFor(() => expect(document.activeElement).toBe(men));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('option', { name: WOMEN.name }));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(men);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('option', { name: WOMEN.name }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(document.activeElement).toBe(trigger());
    expect(setActiveTeam).not.toHaveBeenCalled();

    await user.keyboard('{ArrowDown}');
    // Focus lands on the current team a frame after it opens; keys pressed before then would still be the button's.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('option', { name: MEN.name })));
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(setActiveTeam).toHaveBeenCalledWith(WOMEN.id));
    expect(document.activeElement).toBe(trigger());
  });

  it('a click outside closes it without switching', async () => {
    const user = userEvent.setup();
    wrap(
      <>
        {sidebar(head())}
        <p>Elsewhere</p>
      </>,
    );
    await user.click(trigger());
    await screen.findByRole('listbox');
    await user.click(screen.getByText('Elsewhere'));
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(setActiveTeam).not.toHaveBeenCalled();
  });
});

describe('Team switcher · phone', () => {
  it('CH-1814 the More sheet lists the coach\'s teams under who they are, the current one marked', async () => {
    const user = userEvent.setup();
    wrap(phoneBar(head()));
    const sheet = await openMore(user);
    const group = within(sheet).getByRole('group', { name: 'Team' });
    const rows = within(group).getAllByRole('button');
    expect(rows.map((r) => r.textContent)).toEqual([MEN.name, WOMEN.name]);
    expect(rows.map((r) => r.getAttribute('aria-current'))).toEqual(['true', null]);
    // Under the me card, above the app's own rows.
    const me = within(sheet).getByRole('link', { name: /^Maya Reyes/ });
    expect(me.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('on the phone the sheet stays open and the old page stays marked until the new team\'s payload lands', async () => {
    const user = userEvent.setup();
    setActiveTeam.mockResolvedValue({ success: true });
    // The refresh suspends inside its transition, as the real one does while the server payload is on its way.
    let landPayload!: () => void;
    const payload = new Promise<void>((r) => (landPayload = r));
    let request!: (p: Promise<void>) => void;
    function Payload() {
      const [p, setP] = useState<Promise<void> | null>(null);
      request = setP;
      if (p) use(p);
      return null;
    }
    router.refresh.mockImplementationOnce(() => request(payload));
    wrap(
      <>
        {phoneBar(head())}
        <Payload />
      </>,
    );
    const sheet = await openMore(user);
    await user.click(within(sheet).getByRole('button', { name: WOMEN.name }));
    const root = document.querySelector('.ch-root')!;
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    // The action has answered; the payload has not: the sheet and the mark hold.
    // Longer than the sheet's exit, so a sheet that closed early would be gone by now.
    await new Promise((r) => setTimeout(r, 1200));
    expect(root.hasAttribute('data-ch-switching')).toBe(true);
    expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeNull();
    await act(async () => landPayload());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull());
    expect(root.hasAttribute('data-ch-switching')).toBe(false);
  });

  it('CH-1814 picking the other team switches, refreshes, and closes the sheet on the new team', async () => {
    const user = userEvent.setup();
    setActiveTeam.mockResolvedValue({ success: true });
    wrap(phoneBar(head()));
    const sheet = await openMore(user);
    await user.click(within(sheet).getByRole('button', { name: WOMEN.name }));
    expect(setActiveTeam).toHaveBeenCalledWith(WOMEN.id);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull());
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(hapticSpy).not.toHaveBeenCalledWith('success');
  });

  it('CH-1003 on the phone a refused switch leaves the sheet open on the team you were on, with the reason', async () => {
    const user = userEvent.setup();
    setActiveTeam.mockResolvedValue({ success: false, reason: 'switching-not-permitted' });
    wrap(phoneBar(head()));
    const sheet = await openMore(user);
    await user.click(within(sheet).getByRole('button', { name: WOMEN.name }));
    await expectCode('CH-1003', /Only a head coach staffed on more than one team can switch\./);
    expect(screen.getByRole('dialog', { name: 'More' })).toBeTruthy();
    const group = within(screen.getByRole('dialog', { name: 'More' })).getByRole('group', { name: 'Team' });
    expect(within(group).getByRole('button', { name: MEN.name }).getAttribute('aria-current')).toBe('true');
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe('Team switcher · every screen reads for the new team', () => {
  function Counter() {
    const [n, setN] = useState(0);
    return (
      <button type="button" onClick={() => setN(n + 1)}>
        count {n}
      </button>
    );
  }
  const frame = (user: GolfUserData) => (
    <ClubhouseFrame userData={user} shell={shell} pathname="/golf/dashboard" forceRebuilt>
      <Counter />
    </ClubhouseFrame>
  );

  it('10103 a new team remounts the page, so nothing the old team\'s screen held carries over', async () => {
    const user = userEvent.setup();
    const { rerender } = render(frame(head()));
    await user.click(screen.getByRole('button', { name: 'count 0' }));
    expect(screen.getByRole('button', { name: 'count 1' })).toBeTruthy();
    rerender(frame(head({ teamId: WOMEN.id, teamName: WOMEN.name })));
    expect(screen.getByRole('button', { name: 'count 0' })).toBeTruthy();
    // The same team (a refresh with new data) keeps its state.
    await user.click(screen.getByRole('button', { name: 'count 0' }));
    rerender(frame(head({ teamId: WOMEN.id, teamName: WOMEN.name })));
    expect(screen.getByRole('button', { name: 'count 1' })).toBeTruthy();
  });

  it('the frame draws the switcher for a head coach on two teams, in the sidebar and in the More sheet', async () => {
    const user = userEvent.setup();
    render(frame(head()));
    expect(trigger()).toBeTruthy();
    const sheet = await openMore(user);
    expect(within(sheet).getByRole('group', { name: 'Team' })).toBeTruthy();
  });
});
