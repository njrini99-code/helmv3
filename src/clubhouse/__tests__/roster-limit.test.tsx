import { LazyMotion, domAnimation } from 'motion/react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F-05, the roster limit (NCAA Division I Bylaw 17.2: 9 in golf). Catalog: CH-3081 (the limit doesn't save), CH-3082 (a
 * mark doesn't save), CH-3283 (who doesn't count didn't load), CH-3981 (over the limit), CH-3982 (can't be changed yet),
 * CH-16981 (the lineup builder's chip). The fixture is the preview roster: seven active players and one inactive.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const actions = vi.hoisted(() => ({ limit: vi.fn(), exempt: vi.fn() }));
vi.mock('@/app/golf/actions/roster-limit', () => ({ saveRosterLimit: actions.limit, setRosterExemption: actions.exempt }));
vi.mock('@/app/golf/actions/roster', () => ({ removePlayerFromTeam: vi.fn() }));
vi.mock('@/app/golf/actions/team-management', () => ({ setPlayerAvailabilityCoachNote: vi.fn(), updatePlayerStatus: vi.fn(), setPlayerAvailability: vi.fn() }));
vi.mock('@/app/golf/actions/teams', () => ({ acceptJoinRequest: vi.fn(), rejectJoinRequest: vi.fn(), getTeamJoinRequests: vi.fn() }));
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: vi.fn() }));
vi.mock('@/app/golf/actions/tournaments', () => ({ setTournamentEntries: vi.fn(), publishTournamentLineup: vi.fn(), lockTournamentLineup: vi.fn() }));

import type { ChRoster, ChRosterLimit } from '../data/roster';
import { PREVIEW_ROSTER } from '../preview/fixtures-roster';
import { tourFixture } from '../preview/fixtures-tournaments';
import { Roster } from '../screens/roster/Roster';
import { LineupBuilder } from '../screens/tournaments/LineupBuilder';
import { PhoneChromeProvider } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const D1: ChRosterLimit = { limit: { enabled: true, max: 9 }, from: 'division', missing: false, error: false };
const data = (limit: ChRosterLimit | undefined, over: Partial<ChRoster> = {}): ChRoster => ({
  ...PREVIEW_ROSTER,
  teamId: '00000000-0000-4000-8000-000000000001',
  rosterLimit: limit,
  ...over,
});
/** Three more active players: ten count against a limit of nine. */
const ten = (): ChRoster['players'] => [
  ...PREVIEW_ROSTER.players,
  ...['x1', 'x2', 'x3'].map((id, i) => ({ ...PREVIEW_ROSTER.players[0]!, id, name: `Extra ${i + 1}`, firstName: `Extra${i + 1}`, status: 'active' as const })),
];
const tree = (d: ChRoster) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <PhoneChromeProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Roster data={d} />
        </div>
      </PhoneChromeProvider>
    </ToastProvider>
  </LazyMotion>
);

const realMatchMedia = window.matchMedia;
function asPhone(on: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: on && q === '(max-width: 820px), (max-height: 500px) and (pointer: coarse)',
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as never;
}

beforeEach(() => {
  actions.limit.mockReset();
  actions.exempt.mockReset();
  asPhone(false);
});
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
  window.history.replaceState(null, '', '/');
});

describe('Roster · the roster limit (F-05)', () => {
  it('30180 states the count against the limit under the head: active players only, the inactive one left out', () => {
    render(tree(data(D1)));
    const line = document.querySelector('[data-ch-roster-limit]')!;
    // Seven active players (Mia is inactive).
    expect(line.getAttribute('data-ch-roster-limit')).toBe('on');
    expect(line.textContent).toContain('7 of 9 count toward the roster limit.');
    expect(code('CH-3981')).toBeNull();
  });

  it('CH-3981 over the limit: the line counts over, an amber badge, and a sentence saying what to do', () => {
    render(tree(data(D1, { players: ten() })));
    expect(document.querySelector('[data-ch-roster-limit]')!.getAttribute('data-ch-roster-limit')).toBe('over');
    expect(document.querySelector('[data-ch-roster-limit]')!.textContent).toContain('10 count toward the roster limit of 9: 1 over.');
    expect(code('CH-3981')!.textContent).toMatch(/The roster is 1 player over its limit of 9\. Mark a player inactive, or mark one who doesn’t count/);
    expect(code('CH-3981')!.getAttribute('role')).toBe('status');
  });

  it('a player marked as not counting is left out of the count and says "Not counted" in their row', () => {
    const players = ten().map((p) => (p.id === 'x1' ? { ...p, rosterExempt: 'designated' as const } : p));
    render(tree(data(D1, { players })));
    expect(document.querySelector('[data-ch-roster-limit]')!.textContent).toContain('9 of 9 count toward the roster limit. 1 player doesn’t count.');
    expect(code('CH-3981')).toBeNull();
    expect(document.body.textContent).toContain('Not counted');
  });

  it('with the limit off there is no count, only the way to set one; with no limit sent (fixtures) nothing is drawn', () => {
    render(tree(data({ ...D1, limit: { enabled: false, max: 9 } })));
    expect(document.querySelector('[data-ch-roster-limit]')!.getAttribute('data-ch-roster-limit')).toBe('off');
    expect(screen.getByRole('button', { name: 'Set a roster limit' })).toBeTruthy();
    cleanup();
    render(tree(data(undefined)));
    expect(document.querySelector('[data-ch-roster-limit]')).toBeNull();
  });

  it('CH-3982 before the held migration the sheet states the limit and has no Save', async () => {
    const user = userEvent.setup();
    render(tree(data({ ...D1, missing: true })));
    await user.click(screen.getByRole('button', { name: 'Roster limit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Roster limit' });
    expect(code('CH-3982')!.textContent).toBe('The limit is 9, from your division. Changing it arrives with the next update.');
    expect(within(dialog).queryByRole('button', { name: 'Save' })).toBeNull();
    expect(dialog.textContent).toContain('NCAA Division I Manual 2026-27, Bylaw 17.2');
  });

  it('CH-3283 when who doesn’t count didn’t load, the line says every active player is counted', () => {
    render(tree(data({ ...D1, error: true })));
    expect(code('CH-3283')!.textContent).toBe('Couldn’t read who doesn’t count toward the limit, so every active player is counted.');
  });

  it('30980 CH-3081 the sheet saves a new number; a refusal says so and keeps the sheet open', async () => {
    const user = userEvent.setup();
    actions.limit.mockResolvedValueOnce({ success: false, error: 'Only a coach of the team can change its roster limit.', code: 'CH-3081' });
    render(tree(data(D1)));
    await user.click(screen.getByRole('button', { name: 'Roster limit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Roster limit' });
    await user.selectOptions(within(dialog).getByLabelText('Players who count'), '8');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(code('CH-3081')).not.toBeNull());
    expect(code('CH-3081')!.textContent).toMatch(/Couldn’t save the roster limit/);
    expect(actions.limit).toHaveBeenCalledWith({ teamId: '00000000-0000-4000-8000-000000000001', enabled: true, max: 8 });
    expect(screen.getByRole('dialog', { name: 'Roster limit' })).toBeTruthy();

    actions.limit.mockResolvedValueOnce({ success: true });
    await user.click(within(screen.getByRole('dialog', { name: 'Roster limit' })).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Roster limit set to 8')).toBeTruthy();
    await waitFor(() => expect(document.querySelector('[data-ch-roster-limit]')!.textContent).toContain('7 of 8 count toward the roster limit.'));
  });
});

describe('Roster on the phone · marking who counts (F-05)', () => {
  beforeEach(() => {
    asPhone(true);
    window.history.replaceState(null, '', '/golf/dashboard/roster?player=theo');
  });

  async function pick(user: ReturnType<typeof userEvent.setup>, item: string) {
    await user.click(screen.getByRole('button', { name: 'Player actions' }));
    await user.click(await screen.findByRole('menuitem', { name: item }));
  }

  it('30181 30981 CH-3082 marks a player as not counting from their actions, at once; a refusal puts them back', async () => {
    const user = userEvent.setup();
    let finish!: (v: unknown) => void;
    actions.exempt.mockReturnValueOnce(new Promise((r) => (finish = r)));
    render(tree(data(D1)));
    await pick(user, 'Doesn’t count toward the limit…');
    const dialog = await screen.findByRole('dialog', { name: 'Theo doesn’t count' });
    await user.selectOptions(within(dialog).getByLabelText('Why'), 'medical');
    expect(dialog.textContent).toContain('can never compete again');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(actions.exempt).toHaveBeenCalledWith({ teamId: '00000000-0000-4000-8000-000000000001', playerId: 'theo', reason: 'medical' });
    await waitFor(() =>
      expect(document.querySelector('[data-ch-roster-limit]')!.textContent).toContain('6 of 9 count toward the roster limit. 1 player doesn’t count.'),
    );
    await act(async () => finish({ success: false, error: 'Only a coach of the team can mark who counts toward the limit.', code: 'CH-3082' }));
    await waitFor(() => expect(code('CH-3082')).not.toBeNull());
    expect(code('CH-3082')!.textContent).toMatch(/Couldn’t mark Theo Marchetti as not counting/);
    await waitFor(() => expect(document.querySelector('[data-ch-roster-limit]')!.textContent).toContain('7 of 9 count toward the roster limit.'));
  });

  it('a marked player offers to count again, and nothing is offered while the limit cannot be changed', async () => {
    const user = userEvent.setup();
    actions.exempt.mockResolvedValue({ success: true });
    const players = PREVIEW_ROSTER.players.map((p) => (p.id === 'theo' ? { ...p, rosterExempt: 'designated' as const } : p));
    const view = render(tree(data(D1, { players })));
    await pick(user, 'Count toward the roster limit');
    expect(actions.exempt).toHaveBeenCalledWith({ teamId: '00000000-0000-4000-8000-000000000001', playerId: 'theo', reason: null });
    view.unmount();
    window.history.replaceState(null, '', '/golf/dashboard/roster?player=theo');
    render(tree(data({ ...D1, missing: true })));
    await user.click(screen.getByRole('button', { name: 'Player actions' }));
    await screen.findAllByRole('menuitem');
    expect(screen.queryByRole('menuitem', { name: 'Doesn’t count toward the limit…' })).toBeNull();
  });
});

describe('LineupBuilder · the roster count (F-05)', () => {
  const fx = tourFixture('ready').lineup;
  it('CH-16981 the lineup states the Roster header’s count, amber when over, and nothing with the limit off', () => {
    const { container, unmount } = render(
      <LineupBuilder
        data={{ ...fx, rosterLimit: { chip: 'Roster 10 of 9, 1 over', over: 1, text: 'The roster is 1 player over its limit of 9.' } }}
        load="ready"
        phone={false}
      />,
    );
    expect(code('CH-16981')!.textContent).toBe('Roster 10 of 9, 1 over');
    expect(code('CH-16981')!.querySelector('.ch-tour-chip.is-warn')).not.toBeNull();
    unmount();
    const ok = render(<LineupBuilder data={{ ...fx, rosterLimit: { chip: 'Roster 8 of 9', over: 0, text: null } }} load="ready" phone={false} />);
    expect(ok.container.textContent).toContain('Roster 8 of 9');
    expect(code('CH-16981')).toBeNull();
    ok.unmount();
    const off = render(<LineupBuilder data={fx} load="ready" phone={false} />);
    expect(off.container.textContent).not.toContain('Roster ');
    expect(container).toBeTruthy();
  });
});
