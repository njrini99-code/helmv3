import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P003 wiring audit (2026-10-17): Roster against production. Who gets which screen follows the resolved dashboard
 * role, the bell's join-request link opens the requests, and open focus areas are counted as Fairway counts them.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const actions = vi.hoisted(() => ({ requests: vi.fn(), accept: vi.fn(), reject: vi.fn() }));
vi.mock('@/app/golf/actions/teams', () => ({ getTeamJoinRequests: actions.requests, acceptJoinRequest: actions.accept, rejectJoinRequest: actions.reject }));
vi.mock('@/app/golf/actions/roster', () => ({ removePlayerFromTeam: vi.fn() }));
vi.mock('@/app/golf/actions/team-management', () => ({ updatePlayerStatus: vi.fn() }));
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn() }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: vi.fn() }));

import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadRoster, type ChRoster } from '../data/roster';
import { PREVIEW_ROSTER } from '../preview/fixtures-roster';
import { ClubhouseRosterRoute } from '../routes/roster';
import { resolveClubhouseTeam } from '../routes/team';
import { Roster } from '../screens/roster/Roster';
import { RosterNoTeam } from '../screens/roster/RosterNoTeam';
import { TeamRoster } from '../screens/roster/TeamRoster';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

beforeEach(() => {
  vi.mocked(getGolfSessionProfile).mockReset();
  vi.mocked(resolveClubhouseTeam).mockReset();
  actions.requests.mockReset().mockResolvedValue({ success: true, data: [] });
  tables.current = {};
});

describe('P003 · the screen follows the resolved role, not "has a coach row"', () => {
  it('a user with an unfinished coach profile whose dashboard role is player gets their team roster, never the coach no-team page', async () => {
    tables.current = { golf_teams: { data: { name: 'Varsity', season: null } }, golf_team_members: { data: [] } };
    vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: { id: 'c1', onboarding_completed: false }, player: { id: 'p1', onboarding_completed: true } } as never);
    vi.mocked(resolveClubhouseTeam).mockResolvedValue({ role: 'player', teamId: 't1', playerId: 'p1' });
    const el = (await ClubhouseRosterRoute()) as React.ReactElement<{ data: unknown }>;
    expect(el.type).toBe(TeamRoster);
    // The coach's loader (join requests, notes) is never asked for a player.
    expect(actions.requests).not.toHaveBeenCalled();
  });

  it('with no team, the no-team page speaks to the role the dashboard drew: player for that user, coach for a coach', async () => {
    vi.mocked(resolveClubhouseTeam).mockResolvedValue(null);
    vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: { id: 'c1', onboarding_completed: false }, player: { id: 'p1', onboarding_completed: true } } as never);
    const asPlayer = (await ClubhouseRosterRoute()) as React.ReactElement<{ viewer?: string }>;
    expect(asPlayer.type).toBe(RosterNoTeam);
    expect(asPlayer.props.viewer).toBe('player');
    vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: { id: 'c1', onboarding_completed: true }, player: null } as never);
    const asCoach = (await ClubhouseRosterRoute()) as React.ReactElement<{ viewer?: string }>;
    expect(asCoach.props.viewer).toBe('coach');
  });

  it('a coach still gets the coach roster for the resolved team', async () => {
    tables.current = { golf_teams: { data: { name: 'Varsity', join_code: 'X', season: null } }, golf_team_members: { data: [] } };
    vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: { id: 'c1', onboarding_completed: true }, player: null } as never);
    vi.mocked(resolveClubhouseTeam).mockResolvedValue({ role: 'coach', teamId: 't1', coachId: 'c1' });
    const el = (await ClubhouseRosterRoute()) as React.ReactElement;
    expect(el.type).toBe(Roster);
  });
});

describe('P003 · loader parity with Fairway', () => {
  it('counts open focus areas as Fairway does: active or in_progress', async () => {
    const seen: Array<[string, unknown[]]>[] = [];
    tables.current = {
      golf_teams: { data: { name: 'Varsity', join_code: 'X', season: null } },
      golf_team_members: { data: [{ status: 'active', jersey_number: null, joined_at: null, player: { id: 'p1', first_name: 'Theo', last_name: 'M', graduation_year: 2027, hometown: null, state: null, high_school_name: null, handicap: 1, handicap_index: null } }] },
      golf_rounds: { data: [] },
      golf_player_focus_areas: (f) => {
        seen.push(f);
        return { data: [{ player_id: 'p1' }, { player_id: 'p1' }] };
      },
      golf_goals: { data: [] },
      golf_coach_player_intent: { data: [] },
    };
    const data = await loadRoster({ teamId: 't1', coachId: 'c1' });
    expect(seen[0]).toContainEqual(['in', ['status', ['active', 'in_progress']]]);
    expect(seen[0]!.some(([k, a]) => k === 'eq' && a[0] === 'status')).toBe(false);
    expect(data.players[0]!.focusAreas).toBe(2);
  });
});

describe('P003 · 30102 the bell’s join-request link (?tab=requests)', () => {
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({
      matches: q === '(max-width: 820px)',
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as never;
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    window.history.replaceState(null, '', '/');
  });
  function SlotHost() {
    const { setSlot } = usePhoneChromeState();
    return <div ref={setSlot} data-testid="phone-top" />;
  }
  const phone = (data: ChRoster) =>
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <PhoneChromeProvider>
            <div className="ch-root" data-ui="clubhouse">
              <SlotHost />
              <Roster data={data} />
            </div>
          </PhoneChromeProvider>
        </ToastProvider>
      </LazyMotion>,
    );

  it('on the phone it opens the requests sheet once and drops the param, so a reload shows the list', async () => {
    window.history.replaceState(null, '', '/golf/dashboard/roster?tab=requests');
    phone({ ...PREVIEW_ROSTER });
    expect(await screen.findByRole('dialog', { name: 'Join requests' })).toBeTruthy();
    expect(window.location.search).toBe('');
  });

  it('with no request waiting it opens nothing (the notice was already decided)', async () => {
    window.history.replaceState(null, '', '/golf/dashboard/roster?tab=requests');
    phone({ ...PREVIEW_ROSTER, requests: [] });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('dialog', { name: 'Join requests' })).toBeNull();
    expect(window.location.search).toBe('');
  });

  it('without the param the sheet stays closed until the banner is pressed', async () => {
    window.history.replaceState(null, '', '/golf/dashboard/roster');
    phone({ ...PREVIEW_ROSTER });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('dialog', { name: 'Join requests' })).toBeNull();
  });
});

describe('P003 · 30102 Home’s first-run Invite players (?invite=1)', () => {
  const realMatchMedia = window.matchMedia;
  const media = (phone: boolean) =>
    ((q: string) => ({
      matches: phone && q === '(max-width: 820px)',
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as never;
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    window.history.replaceState(null, '', '/');
  });
  function SlotHost() {
    const { setSlot } = usePhoneChromeState();
    return <div ref={setSlot} data-testid="phone-top" />;
  }
  const mount = (data: ChRoster) =>
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <PhoneChromeProvider>
            <div className="ch-root" data-ui="clubhouse">
              <SlotHost />
              <Roster data={data} />
            </div>
          </PhoneChromeProvider>
        </ToastProvider>
      </LazyMotion>,
    );

  it.each([
    ['desktop', false],
    ['phone', true],
  ])('%s: the invite sheet opens once and the param is dropped; closing it does not bring it back', async (_, phone) => {
    window.matchMedia = media(phone);
    window.history.replaceState(null, '', '/golf/dashboard/roster?invite=1');
    mount({ ...PREVIEW_ROSTER });
    const sheet = await screen.findByRole('dialog', { name: 'Invite players' });
    expect(window.location.search).toBe('');
    // Closed by the coach: the arrival is spent, so the roster mounted again (a reload, Back) opens no sheet.
    within(sheet).getByRole('button', { name: 'Close' }).click();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Invite players' })).toBeNull());
    cleanup();
    mount({ ...PREVIEW_ROSTER });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('dialog', { name: 'Invite players' })).toBeNull();
  });

  it('a remount before the sheet is closed (dropping the param can cause one) still opens it', async () => {
    window.history.replaceState(null, '', '/golf/dashboard/roster?invite=1');
    const first = mount({ ...PREVIEW_ROSTER });
    await screen.findByRole('dialog', { name: 'Invite players' });
    first.unmount();
    mount({ ...PREVIEW_ROSTER });
    const again = await screen.findByRole('dialog', { name: 'Invite players' });
    within(again).getByRole('button', { name: 'Close' }).click();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Invite players' })).toBeNull());
  });

  it('without the param the roster opens with no sheet', async () => {
    window.history.replaceState(null, '', '/golf/dashboard/roster');
    mount({ ...PREVIEW_ROSTER });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('dialog', { name: 'Invite players' })).toBeNull();
  });

  it('a player and a coach with no team are other screens and never read it', async () => {
    window.history.replaceState(null, '', '/golf/dashboard/roster?invite=1');
    render(<TeamRoster data={{ teamName: 'Varsity', season: null, teamError: false, players: [], playersError: false }} />);
    render(<RosterNoTeam />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('dialog', { name: 'Invite players' })).toBeNull();
  });
});
