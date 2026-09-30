import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Settings, the parts that are not the screen: the server loader, the route and
 * the three addresses that hand it a section, the live writes (with a fake
 * Supabase client), and the loading files. The screen itself is settings.test.tsx.
 * Docs: docs/clubhouse/pages/P008-settings/.
 */

const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

// The server client: the shared table fake, plus the auth call the loader makes.
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
const auth = vi.hoisted(() => ({ user: { email: 'maya.reyes@unc.edu' } as { email: string } | null }));
vi.mock('@/lib/supabase/server', async () => {
  const fake = (await import('./supabase-fake')).fakeServer(tables);
  return { createClient: async () => ({ ...(await fake.createClient()), auth: { getUser: async () => ({ data: { user: auth.user }, error: null }) } }) };
});

// The browser client the live writes use.
const clientTables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
const client = vi.hoisted(() => ({
  updateUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));
vi.mock('@/lib/supabase/client', async () => {
  const fake = await (await import('./supabase-fake')).fakeServer(clientTables).createClient();
  return {
    createClient: () => ({
      from: fake.from,
      auth: { updateUser: client.updateUser, signInWithPassword: client.signInWithPassword, signOut: client.signOut },
      storage: { from: () => ({ upload: client.upload, getPublicUrl: client.getPublicUrl }) },
    }),
  };
});

const actions = vi.hoisted(() => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
  getTeamCoachHelmAccess: vi.fn(),
  getOrCreateTeamCoachHelmSettings: vi.fn(),
  updateTeamCoachHelmSettings: vi.fn(),
  getPlayerJoinRequests: vi.fn(),
  cancelJoinRequest: vi.fn(),
  createTeamJoinRequest: vi.fn(),
  regenerateJoinCode: vi.fn(),
  saveCoachingPhilosophy: vi.fn(),
  clearActiveTeam: vi.fn(),
  clearAllCachedResources: vi.fn(),
}));
vi.mock('@/app/actions/notification-preferences', () => ({ getNotificationPreferences: actions.getNotificationPreferences, updateNotificationPreferences: actions.updateNotificationPreferences }));
vi.mock('@/app/golf/actions/insights', () => ({
  getTeamCoachHelmAccess: actions.getTeamCoachHelmAccess,
  getOrCreateTeamCoachHelmSettings: actions.getOrCreateTeamCoachHelmSettings,
  updateTeamCoachHelmSettings: actions.updateTeamCoachHelmSettings,
}));
vi.mock('@/app/golf/actions/teams', () => ({
  getPlayerJoinRequests: actions.getPlayerJoinRequests,
  cancelJoinRequest: actions.cancelJoinRequest,
  createTeamJoinRequest: actions.createTeamJoinRequest,
  regenerateJoinCode: actions.regenerateJoinCode,
}));
vi.mock('@/app/golf/actions/v3/notification-prefs', () => ({ setAllChannels: vi.fn(), setCategoryChannel: vi.fn(), setQuietMode: vi.fn() }));
vi.mock('@/app/golf/actions/coaching-philosophy', () => ({ revalidateCoachingPhilosophyPaths: vi.fn(), saveCoachingPhilosophy: actions.saveCoachingPhilosophy }));
vi.mock('@/app/golf/actions/team-switcher', () => ({ clearActiveTeam: actions.clearActiveTeam }));
vi.mock('@/lib/golf/client-resource-cache', () => ({ clearAllCachedResources: actions.clearAllCachedResources }));
vi.mock('@/lib/utils/push-registration', () => ({ teardownDeviceTokenOnSignOut: vi.fn() }));
const native = vi.hoisted(() => ({ on: false }));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => native.on, triggerHaptic: vi.fn(), triggerSelectionHaptic: vi.fn() }));

// The route and the three addresses.
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => session.current }));
const teamFor = vi.hoisted(() => ({ current: null as unknown, resolve: vi.fn() }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: teamFor.resolve }));
vi.mock('../screens/settings/Settings', () => ({ Settings: () => null }));
const gate = vi.hoisted(() => ({ on: true }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFor: (role: string | null) => gate.on && (role === 'coach' || role === 'player') }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock('@/lib/redesign/flag', () => ({ fairwayScope: (c: string) => c }));
vi.mock('@/components/fairway/pages/settings', () => ({
  FairwaySettingsGeneral: () => <div data-fw="general" />,
  FairwaySettingsNotifications: () => <div data-fw="notifications" />,
  FairwaySettingsCoachingIntelligence: () => <div data-fw="coaching" />,
}));
vi.mock('@/components/fairway', () => ({
  FeatureUnavailable: () => <div data-fw="unavailable" />,
  Skeleton: () => <i data-fw="skeleton" />,
  Surface: ({ children }: { children?: React.ReactNode }) => <div data-fw="surface">{children}</div>,
  ViewHeader: () => <h1 data-fw="header">Settings</h1>,
}));
vi.mock('@/components/fairway/feedback/Skeleton', () => ({ Skeleton: () => <i data-fw="skeleton" /> }));

import type { GolfSessionProfile } from '@/lib/auth/session';
import GolfSettingsPage from '@/app/golf/(dashboard)/dashboard/settings/page';
import NotificationPrefsPage from '@/app/golf/(dashboard)/dashboard/settings/notifications/page';
import CoachingIntelligenceLayout from '@/app/golf/(dashboard)/dashboard/settings/coaching-intelligence/layout';
import SettingsLoading from '@/app/golf/(dashboard)/dashboard/settings/loading';
import NotificationSettingsLoading from '@/app/golf/(dashboard)/dashboard/settings/notifications/loading';
import CoachingIntelligenceLoading from '@/app/golf/(dashboard)/dashboard/settings/coaching-intelligence/loading';
import { loadSettings } from '../data/settings';
import { friendlyReason } from '../lib/use-action';
import { ClubhouseSettingsRoute } from '../routes/settings';
import { Settings } from '../screens/settings/Settings';
import { createLiveWrites, afterDeleteHref } from '../screens/settings/writes';
import { ClubhouseMarker } from '../shell/context';
import type { ChFakeTables } from './supabase-fake';

const coachSession = { userId: 'u-maya', role: 'coach', coach: { id: 'c1', organization_id: 'org1' }, player: null } as unknown as GolfSessionProfile;
const playerSession = { userId: 'u-jonah', role: 'player', coach: null, player: { id: 'p1' } } as unknown as GolfSessionProfile;

type Loaded = Awaited<ReturnType<typeof loadSettings>>;
const selects = (f: Array<[string, unknown[]]>, col: string) => f.some(([k, a]) => k === 'select' && String(a[0]).startsWith(col));

function coachTables(over: ChFakeTables = {}): ChFakeTables {
  return {
    golf_coaches: { data: { full_name: 'Maya Reyes', avatar_url: null } },
    golf_teams: (f) =>
      selects(f, 'name')
        ? { data: { name: 'Varsity' } }
        : {
            data: {
              id: 't1',
              name: 'Varsity',
              season: '2026–27',
              join_code: 'K7M2Q9XA',
              organization_id: 'org1',
              organization: { id: 'org1', name: 'UNC', location_city: 'Chapel Hill', location_state: 'NC', division: 'NCAA D1', conference: 'ACC' },
            },
          },
    golf_coach_philosophy: (f) => (selects(f, 'email_digest_enabled') ? { data: { email_digest_enabled: true } } : { data: null }),
    golf_team_settings: { data: { scoring_format: 'match_play', handicap_system: 'world', default_tees: 'gold', timezone: 'America/Chicago', event_reminders_enabled: true, event_reminder_early_hours: 48, event_reminder_late_minutes: 120 } },
    golf_coachhelm_settings: { data: { enabled: true, auto_insights: true, weekly_summary: false, trend_alerts: true } },
    golf_team_coachhelm_settings: { data: { enabled: false, disabled_at: '2026-10-01T00:00:00Z' } },
    ...over,
  };
}

function playerTables(over: ChFakeTables = {}): ChFakeTables {
  return {
    golf_players: { data: { first_name: 'Jonah', last_name: 'Okafor', avatar_url: null, handicap: 2.4, handicap_index: 2.1, graduation_year: 2029, hometown: 'Charlotte', state: 'NC', phone: null } },
    golf_teams: (f) => (selects(f, 'name') ? { data: { name: 'Varsity' } } : { data: { id: 't1', name: 'Varsity', organization: { name: 'UNC' } } }),
    golf_player_notification_state: { data: { prefs: { new_insight: { push: true, email: false, in_app: true } }, quiet_mode: true } },
    ...over,
  };
}

beforeEach(() => {
  logServer.mockClear();
  Object.values(actions).forEach((f) => f.mockReset());
  auth.user = { email: 'maya.reyes@unc.edu' };
  actions.getNotificationPreferences.mockResolvedValue({ data: { email_messages: true, quiet_mode: false } });
  actions.getTeamCoachHelmAccess.mockResolvedValue({ success: true, isHeadCoach: true });
  actions.getOrCreateTeamCoachHelmSettings.mockResolvedValue({ success: true, settings: { enabled: true, disabled_at: null } });
  actions.getPlayerJoinRequests.mockResolvedValue({
    success: true,
    data: [
      { id: 'r1', status: 'pending', team: { name: 'Wake Forest Golf' }, created_at: '2026-10-12T15:00:00Z' },
      { id: 'r2', status: 'approved', team: { name: 'Duke Golf' }, created_at: '2026-09-01T15:00:00Z' },
    ],
  });
  native.on = false;
  gate.on = true;
  session.current = coachSession;
  teamFor.resolve.mockReset();
  teamFor.resolve.mockImplementation(async () => teamFor.current);
  teamFor.current = { role: 'coach', teamId: 't1', coachId: 'c1' };
});

describe('Settings · the server loader', () => {
  it('82101 a coach: everything the page shows is read on the server, and nothing is logged when every read works', async () => {
    tables.current = coachTables();
    const data = await loadSettings(coachSession, 't1');
    expect(data).toMatchObject({ role: 'coach', userId: 'u-maya', email: 'maya.reyes@unc.edu', teamId: 't1', teamName: 'Varsity', playerRouting: null, golf: null, membership: null });
    expect(data.profile).toEqual({ value: { firstName: '', lastName: '', fullName: 'Maya Reyes', avatarUrl: null }, error: false });
    expect(data.scoring).toEqual({ value: { scoringFormat: 'match_play', handicapSystem: 'world', defaultTees: 'gold', timezone: 'America/Chicago' }, error: false });
    expect(data.reminders).toEqual({ value: { enabled: true, earlyHours: 48, lateMinutes: 120 }, error: false });
    expect(data.joinCode).toEqual({ value: 'K7M2Q9XA', error: false });
    expect(data.digest).toEqual({ value: true, error: false });
    expect(data.team).toMatchObject({ error: false, value: { id: 't1', name: 'Varsity', season: '2026–27', org: { name: 'UNC', state: 'NC' } } });
    expect(data.coachhelm).toMatchObject({ error: false, value: { coach: { enabled: true, showPredictions: false }, team: { enabled: true, isHeadCoach: true } } });
    expect(logServer).not.toHaveBeenCalled();
  });

  it('82101 a coach with no team still loads: the team sections are null, not failed', async () => {
    tables.current = coachTables();
    const data = await loadSettings(coachSession, null);
    expect(data.teamId).toBeNull();
    expect(data.team).toBeNull();
    expect(data.joinCode).toBeNull();
    expect(data.scoring).toBeNull();
    expect(data.reminders).toBeNull();
    expect(data.profile.error).toBe(false);
    expect(data.coachhelm).toMatchObject({ error: false, value: { team: null } });
    expect(actions.getTeamCoachHelmAccess).not.toHaveBeenCalled();
  });

  const digestFails = (f: Array<[string, unknown[]]>) => (selects(f, 'email_digest_enabled') ? { error: { message: 'boom' } } : { data: null });
  const boom = { error: { message: 'boom' } };

  it.each([
    ['profile read fails', () => (tables.current = coachTables({ golf_coaches: boom })), 'profile', 'settings', (d: Loaded) => d.profile.error],
    ['profile row missing', () => (tables.current = coachTables({ golf_coaches: { data: null } })), 'profile', 'settings', (d: Loaded) => d.profile.error],
    ['weekly email read fails', () => (tables.current = coachTables({ golf_coach_philosophy: digestFails })), 'digest', 'notifications', (d: Loaded) => d.digest!.error],
    ['team settings read fails', () => (tables.current = coachTables({ golf_team_settings: boom })), 'teamSettings', 'teams', (d: Loaded) => d.scoring!.error && d.reminders!.error],
    [
      'team row read fails',
      () => (tables.current = coachTables({ golf_teams: (f) => (selects(f, 'name') ? { data: { name: 'Varsity' } } : boom) })),
      'team',
      'teams',
      (d: Loaded) => d.team!.error && d.joinCode!.error,
    ],
    [
      'team row missing',
      () => (tables.current = coachTables({ golf_teams: (f) => (selects(f, 'name') ? { data: { name: 'Varsity' } } : { data: null }) })),
      'team',
      'teams',
      (d: Loaded) => d.team!.error && d.joinCode!.error,
    ],
    ['CoachHelm dashboards read fails', () => (tables.current = coachTables({ golf_coachhelm_settings: boom })), 'coachhelmCoach', 'coachhelm_ai', (d: Loaded) => d.coachhelm!.error],
    [
      'CoachHelm philosophy read fails',
      () => (tables.current = coachTables({ golf_coach_philosophy: (f) => (selects(f, 'email_digest_enabled') ? { data: { email_digest_enabled: true } } : boom) })),
      'philosophy',
      'coachhelm_ai',
      (d: Loaded) => d.coachhelm!.error,
    ],
    [
      'notification settings fail',
      () => {
        tables.current = coachTables();
        actions.getNotificationPreferences.mockResolvedValue({ data: null, error: 'boom' });
      },
      'deliveryPrefs',
      'notifications',
      (d: Loaded) => d.delivery.error,
    ],
    [
      'notification settings throw',
      () => {
        tables.current = coachTables();
        actions.getNotificationPreferences.mockRejectedValue(new Error('boom'));
      },
      'deliveryPrefs',
      'notifications',
      (d: Loaded) => d.delivery.error,
    ],
  ])('82101 a coach: %s, so that section is flagged and logged, and the page still loads', async (_name, arrange, read, area, flagged) => {
    arrange();
    const data = await loadSettings(coachSession, 't1');
    expect(flagged(data)).toBe(true);
    expect(logServer).toHaveBeenCalledWith('settings', read, expect.anything(), area);
    expect(data.role).toBe('coach');
  });

  it('82101 a coach: the team CoachHelm access check that throws is logged and the team switch is left out, instead of failing the page', async () => {
    tables.current = coachTables();
    actions.getTeamCoachHelmAccess.mockRejectedValue(new Error('rpc down'));
    const data = await loadSettings(coachSession, 't1');
    expect(data.coachhelm).toMatchObject({ error: false, value: { team: null } });
    expect(logServer).toHaveBeenCalledWith('settings', 'teamCoachhelm', expect.anything(), 'coachhelm_ai');
  });

  it('82101 80804 a coach whose head-coach check fails is not treated as an assistant: the failure is logged and the team switch is left out', async () => {
    tables.current = coachTables();
    actions.getTeamCoachHelmAccess.mockResolvedValue({ success: false, error: 'rpc down' });
    const data = await loadSettings(coachSession, 't1');
    expect(data.coachhelm).toMatchObject({ error: false, value: { team: null } });
    expect(logServer).toHaveBeenCalledWith('settings', 'teamCoachhelmAccess', 'rpc down', 'coachhelm_ai');
    expect(actions.getOrCreateTeamCoachHelmSettings).not.toHaveBeenCalled();
  });

  it('82101 a coach: the team row that will not create is logged and the team switch is left out', async () => {
    tables.current = coachTables();
    actions.getOrCreateTeamCoachHelmSettings.mockRejectedValue(new Error('insert failed'));
    const data = await loadSettings(coachSession, 't1');
    expect(data.coachhelm).toMatchObject({ error: false, value: { team: null } });
    expect(logServer).toHaveBeenCalledWith('settings', 'teamCoachhelm', expect.anything(), 'coachhelm_ai');
  });

  it('82101 80804 an assistant coach reads the team CoachHelm row and cannot create it', async () => {
    tables.current = coachTables();
    actions.getTeamCoachHelmAccess.mockResolvedValue({ success: true, isHeadCoach: false });
    const data = await loadSettings(coachSession, 't1');
    expect(data.coachhelm).toMatchObject({ error: false, value: { team: { enabled: false, isHeadCoach: false } } });
    expect(actions.getOrCreateTeamCoachHelmSettings).not.toHaveBeenCalled();
  });

  it('82101 a player: the rows, the pending requests only, and the team they are on', async () => {
    tables.current = playerTables();
    auth.user = { email: 'jonah.okafor@unc.edu' };
    const data = await loadSettings(playerSession, 't1');
    expect(data).toMatchObject({ role: 'player', playerId: 'p1', coachId: null, teamId: 't1', digest: null, scoring: null, team: null, coachhelm: null });
    expect(data.profile).toEqual({ value: { firstName: 'Jonah', lastName: 'Okafor', fullName: 'Jonah Okafor', avatarUrl: null }, error: false });
    expect(data.golf).toEqual({ value: { handicap: '2.4', handicapIndex: '2.1', graduationYear: '2029', hometown: 'Charlotte', state: 'NC', phone: '' }, error: false });
    expect(data.playerRouting).toEqual({ value: { prefs: { new_insight: { push: true, email: false, in_app: true } }, quiet: true }, error: false });
    expect(data.membership).toEqual({
      value: { team: { id: 't1', name: 'Varsity', orgName: 'UNC' }, requests: [{ id: 'r1', teamName: 'Wake Forest Golf', createdAt: '2026-10-12T15:00:00Z' }] },
      error: false,
    });
    expect(logServer).not.toHaveBeenCalled();
  });

  it.each([
    ['CoachHelm updates read fails', () => (tables.current = playerTables({ golf_player_notification_state: boom })), 'playerRouting', 'notifications', (d: Loaded) => d.playerRouting!.error],
    [
      'join requests fail',
      () => {
        tables.current = playerTables();
        actions.getPlayerJoinRequests.mockResolvedValue({ success: false, error: 'boom' });
      },
      'joinRequests',
      'teams',
      (d: Loaded) => d.membership!.error,
    ],
    [
      'join requests throw',
      () => {
        tables.current = playerTables();
        actions.getPlayerJoinRequests.mockRejectedValue(new Error('boom'));
      },
      'joinRequests',
      'teams',
      (d: Loaded) => d.membership!.error,
    ],
    [
      'team row read fails',
      () => (tables.current = playerTables({ golf_teams: (f) => (selects(f, 'name') ? { data: { name: 'Varsity' } } : boom) })),
      'membershipTeam',
      'teams',
      (d: Loaded) => d.membership!.error,
    ],
    ['profile read fails', () => (tables.current = playerTables({ golf_players: boom })), 'profile', 'settings', (d: Loaded) => d.profile.error && d.golf!.error],
  ])('82101 a player: %s, so that section is flagged and logged, and the page still loads', async (_name, arrange, read, area, flagged) => {
    arrange();
    const data = await loadSettings(playerSession, 't1');
    expect(flagged(data)).toBe(true);
    expect(logServer).toHaveBeenCalledWith('settings', read, expect.anything(), area);
    expect(data.role).toBe('player');
  });

  it('82101 a player with no team loads with no team and no request that was already answered', async () => {
    tables.current = playerTables();
    const data = await loadSettings(playerSession, null);
    expect(data.teamId).toBeNull();
    expect(data.membership).toMatchObject({ error: false, value: { team: null } });
  });
});

describe('Settings · the route and the addresses that open it', () => {
  const props = (el: unknown) => (el as ReactElement<Record<string, unknown>>).props;

  it('80803 the route renders nothing for a session with neither a coach nor a player profile, and reads nothing', async () => {
    session.current = null;
    expect(await ClubhouseSettingsRoute({})).toBeNull();
    session.current = { userId: 'u-x', role: null, coach: null, player: null };
    expect(await ClubhouseSettingsRoute({})).toBeNull();
    expect(teamFor.resolve).not.toHaveBeenCalled();
  });

  it('80101 80405 a coach with no team still gets Settings, with no team read and the section they asked for', async () => {
    teamFor.current = null;
    tables.current = coachTables();
    const el = (await ClubhouseSettingsRoute({ section: 'team' })) as ReactElement;
    expect(el.type).toBe(Settings);
    expect(props(el).section).toBe('team');
    expect(props(el).data).toMatchObject({ role: 'coach', teamId: null, team: null, scoring: null });
  });

  it('80801 the route gives a player Account for a section only coaches have', async () => {
    session.current = playerSession;
    teamFor.current = { role: 'player', teamId: 't1', playerId: 'p1' };
    tables.current = playerTables();
    expect(props(await ClubhouseSettingsRoute({ section: 'coachhelm' })).section).toBe('account');
    expect(props(await ClubhouseSettingsRoute({ section: 'golf' })).section).toBe('golf');
    expect(props(await ClubhouseSettingsRoute({})).section).toBe('account');
  });

  it('80102 /settings?section= opens that section for a coach or a player, and the Fairway page when Clubhouse is off', async () => {
    const el = await GolfSettingsPage({ searchParams: Promise.resolve({ section: 'notifications' }) });
    expect((el as ReactElement).type).toBe(ClubhouseSettingsRoute);
    expect(props(el).section).toBe('notifications');
    session.current = playerSession;
    expect(props(await GolfSettingsPage({ searchParams: Promise.resolve({}) })).section).toBeUndefined();
    gate.on = false;
    expect((await GolfSettingsPage({ searchParams: Promise.resolve({ section: 'notifications' }) }) as ReactElement).type).not.toBe(ClubhouseSettingsRoute);
  });

  it('80102 the old /settings/notifications link opens Notifications for a coach and a player', async () => {
    const coach = await NotificationPrefsPage();
    expect((coach as ReactElement).type).toBe(ClubhouseSettingsRoute);
    expect(props(coach).section).toBe('notifications');
    session.current = playerSession;
    expect(props(await NotificationPrefsPage()).section).toBe('notifications');
    session.current = null;
    await expect(NotificationPrefsPage()).rejects.toThrow('redirect:/golf/login');
  });

  it('80802 the old /settings/coaching-intelligence link opens CoachHelm for a coach, and a player lands on their own Settings', async () => {
    const children = <p>old page</p>;
    const coach = await CoachingIntelligenceLayout({ children });
    expect((coach as ReactElement).type).toBe(ClubhouseSettingsRoute);
    expect(props(coach).section).toBe('coachhelm');
    session.current = playerSession;
    const player = await CoachingIntelligenceLayout({ children });
    expect((player as ReactElement).type).toBe(ClubhouseSettingsRoute);
    expect(props(player).section).toBeUndefined();
    session.current = null;
    await expect(CoachingIntelligenceLayout({ children })).rejects.toThrow('redirect:/golf/login');
  });

  it('80802 with Clubhouse off, the old coaching link still shows a player the coach-only notice', async () => {
    gate.on = false;
    session.current = playerSession;
    const el = (await CoachingIntelligenceLayout({ children: <p>old page</p> })) as ReactElement;
    expect(el.type).not.toBe(ClubhouseSettingsRoute);
  });
});

describe('Settings · the loading files', () => {
  const skeletons = [
    ['/settings', SettingsLoading],
    ['/settings/notifications', NotificationSettingsLoading],
    ['/settings/coaching-intelligence', CoachingIntelligenceLoading],
  ] as const;

  it.each(skeletons)('CH-8401 %s shows the Settings skeleton inside Clubhouse and the Fairway one everywhere else', (_route, Loading) => {
    const inside = render(
      <ClubhouseMarker>
        <Loading />
      </ClubhouseMarker>,
    );
    expect(inside.container.querySelector('[data-ch-code="CH-8401"]')).not.toBeNull();
    expect(inside.container.querySelector('[data-fw]')).toBeNull();
    inside.unmount();
    const outside = render(<Loading />);
    expect(outside.container.querySelector('[data-ch-code="CH-8401"]')).toBeNull();
    expect(outside.container.querySelector('[data-fw]')).not.toBeNull();
  });
});

describe('Settings · the live writes', () => {
  const seen: Array<{ table: string; filters: Array<[string, unknown[]]> }> = [];
  const record = (table: string, answer: object = {}) => (filters: Array<[string, unknown[]]>) => {
    seen.push({ table, filters });
    return answer;
  };
  const called = (table: string) => seen.filter((s) => s.table === table).map((s) => s.filters);
  const coachWrites = (over: Partial<Parameters<typeof createLiveWrites>[0]> = {}) =>
    createLiveWrites({ role: 'coach', userId: 'u-maya', email: 'maya.reyes@unc.edu', coachId: 'c1', playerId: null, teamId: 't1', refresh: () => {}, ...over });
  const playerWrites = (over: Partial<Parameters<typeof createLiveWrites>[0]> = {}) =>
    createLiveWrites({ role: 'player', userId: 'u-jonah', email: 'jonah.okafor@unc.edu', coachId: null, playerId: 'p1', teamId: 't1', refresh: () => {}, ...over });

  beforeEach(() => {
    seen.length = 0;
    clientTables.current = {};
    Object.values(client).forEach((f) => f.mockReset());
    client.updateUser.mockResolvedValue({ error: null });
    client.signInWithPassword.mockResolvedValue({ error: null });
    client.signOut.mockResolvedValue({ error: null });
    client.upload.mockResolvedValue({ data: { path: 'u-maya/avatar-1.png' }, error: null });
    client.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.test/avatar-1.png' } });
    actions.clearActiveTeam.mockResolvedValue(undefined);
  });

  it('80806 a coach saves their own profile row, a player their own, by the signed-in user', async () => {
    clientTables.current = { golf_coaches: record('golf_coaches'), golf_players: record('golf_players') };
    await coachWrites().saveProfile({ firstName: '', lastName: '', fullName: ' Maya R ', avatarUrl: null });
    expect(called('golf_coaches')[0]).toEqual([
      ['update', [{ full_name: 'Maya R', avatar_url: null }, { count: 'exact' }]],
      ['eq', ['user_id', 'u-maya']],
    ]);
    await playerWrites().saveProfile({ firstName: ' Jonah ', lastName: 'Okafor', fullName: '', avatarUrl: 'https://cdn.test/a.png' });
    expect(called('golf_players')[0]).toEqual([
      ['update', [{ first_name: 'Jonah', last_name: 'Okafor', avatar_url: 'https://cdn.test/a.png' }, { count: 'exact' }]],
      ['eq', ['user_id', 'u-jonah']],
    ]);
  });

  it('80806 the team and its school are saved by their own ids, the school first, and a blank school field is cleared', async () => {
    clientTables.current = { organizations: record('organizations'), golf_teams: record('golf_teams') };
    const org = { id: 'org1', name: ' UNC ', city: ' Chapel Hill ', state: '', division: 'D1', conference: ' ' };
    expect(await coachWrites().saveTeam({ id: 't1', name: ' Varsity ', season: '', org })).toEqual({ success: true });
    expect(called('organizations')[0]).toEqual([
      ['update', [{ name: 'UNC', location_city: 'Chapel Hill', location_state: null, division: 'D1', conference: null, updated_at: expect.any(String) }, { count: 'exact' }]],
      ['eq', ['id', 'org1']],
    ]);
    expect(called('golf_teams')[0]).toEqual([
      ['update', [{ name: 'Varsity', season: null, updated_at: expect.any(String) }, { count: 'exact' }]],
      ['eq', ['id', 't1']],
    ]);
    expect(await coachWrites().saveTeam({ id: 't1', name: 'Varsity', season: '', org: { ...org, name: ' ' } })).toEqual({ success: false, error: 'The school needs a name.' });
    expect(called('organizations')).toHaveLength(1);
  });

  it('80806 the coaching settings are updated on the row the screen holds, and the first save creates that coach’s row', async () => {
    clientTables.current = { golf_coach_philosophy: record('golf_coach_philosophy', { data: { id: 'ph-new' } }) };
    expect(await coachWrites().savePhilosophy('ph1', { declineThreshold: 3 })).toEqual({ success: true, data: { id: 'ph1' } });
    expect(called('golf_coach_philosophy')[0]).toEqual([
      ['update', [{ decline_threshold: 3 }, { count: 'exact' }]],
      ['eq', ['id', 'ph1']],
    ]);
    expect(await coachWrites().savePhilosophy(null, { declineThreshold: 3 })).toEqual({ success: true, data: { id: 'ph-new' } });
    const [insert] = called('golf_coach_philosophy')[1]!;
    expect(insert![0]).toBe('insert');
    expect(insert![1][0]).toMatchObject({ coach_id: 'c1', decline_threshold: 3 });
  });

  it('80808 an update the database hides the row from is a failure that says so, not a save', async () => {
    const none = (what: string) => ({ success: false, error: `Nothing was saved. ${what} was not found, or you are not allowed to change it.` });
    clientTables.current = { golf_coaches: { count: 0 }, golf_players: { count: 0 } };
    expect(await coachWrites().saveProfile({ firstName: '', lastName: '', fullName: 'Maya R', avatarUrl: null })).toEqual(none('Your profile'));
    expect(await playerWrites().saveProfile({ firstName: 'Jonah', lastName: 'Okafor', fullName: '', avatarUrl: null })).toEqual(none('Your profile'));
    expect(await playerWrites().saveGolf({ handicap: '', handicapIndex: '', graduationYear: '', hometown: '', state: '', phone: '' })).toEqual(none('Your golf profile'));

    // A school the coach may not change stops the save there; the team row is not touched.
    clientTables.current = { organizations: { count: 0 }, golf_teams: record('golf_teams') };
    const org = { id: 'org1', name: 'UNC', city: '', state: '', division: '', conference: '' };
    expect(await coachWrites().saveTeam({ id: 't1', name: 'Varsity', season: '', org })).toEqual(none('The school'));
    expect(called('golf_teams')).toHaveLength(0);
    clientTables.current = { organizations: { count: 1 }, golf_teams: { count: 0 } };
    expect(await coachWrites().saveTeam({ id: 't1', name: 'Varsity', season: '', org })).toEqual(none('The team'));

    clientTables.current = { golf_coach_philosophy: { count: 0 } };
    expect(await coachWrites().savePhilosophy('ph1', { declineThreshold: 3 })).toEqual(none('Your coaching settings'));

    // The toast turns that into a sentence about access, not the connection hint a policy message gets.
    expect(friendlyReason(none('Your profile').error)).toBe('Your account doesn’t have access to do this.');

    // A real error still reads as itself, and a row that changed is a save.
    clientTables.current = { golf_players: { error: { message: 'boom' } } };
    expect(await playerWrites().saveGolf({ handicap: '', handicapIndex: '', graduationYear: '', hometown: '', state: '', phone: '' })).toEqual({ success: false, error: 'boom' });
    clientTables.current = { golf_players: { count: 1 } };
    expect(await playerWrites().saveGolf({ handicap: '', handicapIndex: '', graduationYear: '', hometown: '', state: '', phone: '' })).toEqual({ success: true });
  });

  it('80806 a player saves golf details on their own player row; a blank number is null and the state is upper case', async () => {
    clientTables.current = { golf_players: record('golf_players') };
    await playerWrites().saveGolf({ handicap: '2.4', handicapIndex: '', graduationYear: '2029', hometown: ' Charlotte ', state: 'nc', phone: '' });
    const [update, eq] = called('golf_players')[0]!;
    expect(eq).toEqual(['eq', ['id', 'p1']]);
    expect(update![1][0]).toMatchObject({ handicap: 2.4, handicap_index: null, graduation_year: 2029, hometown: 'Charlotte', state: 'NC', phone: null });
  });

  it('80806 leaving deletes the player’s own membership of that team, and a delete that removed nothing is a failure', async () => {
    clientTables.current = { golf_team_members: record('golf_team_members', { count: 1 }) };
    expect(await playerWrites().leaveTeam()).toEqual({ success: true });
    expect(called('golf_team_members')[0]).toEqual([
      ['delete', [{ count: 'exact' }]],
      ['eq', ['player_id', 'p1']],
      ['eq', ['team_id', 't1']],
    ]);
    clientTables.current = { golf_team_members: { count: 0 } };
    expect(await playerWrites().leaveTeam()).toEqual({ success: false, error: 'You are not on that team.' });
    clientTables.current = { golf_team_members: { error: { message: 'rls' } } };
    expect(await playerWrites().leaveTeam()).toEqual({ success: false, error: 'rls' });
  });

  it('80806 the server actions get the caller’s own ids: the player for a join request, the team for a new code and the team switch, the coach for the weekly email', async () => {
    actions.createTeamJoinRequest.mockResolvedValue({ success: true });
    actions.cancelJoinRequest.mockResolvedValue({ success: true });
    actions.regenerateJoinCode.mockResolvedValue({ success: true, data: { joinCode: 'R4T8W2PL' } });
    actions.updateTeamCoachHelmSettings.mockResolvedValue({ success: true });
    actions.saveCoachingPhilosophy.mockResolvedValue({ success: true });
    await playerWrites().requestJoin(' abc123 ', ' hello ');
    await playerWrites().requestJoin('abc123', '  ');
    expect(actions.createTeamJoinRequest).toHaveBeenNthCalledWith(1, 'ABC123', 'p1', 'hello');
    expect(actions.createTeamJoinRequest).toHaveBeenNthCalledWith(2, 'ABC123', 'p1', undefined);
    await playerWrites().cancelRequest('r1');
    expect(actions.cancelJoinRequest).toHaveBeenCalledWith('r1');
    await coachWrites().regenerateCode();
    expect(actions.regenerateJoinCode).toHaveBeenCalledWith('t1');
    await coachWrites().setCoachHelmTeam(false);
    expect(actions.updateTeamCoachHelmSettings).toHaveBeenCalledWith('t1', { enabled: false });
    await coachWrites().setDigest(false);
    expect(actions.saveCoachingPhilosophy).toHaveBeenCalledWith('c1', { email_digest_enabled: false });
    expect(await playerWrites().setDigest(true)).toEqual({ success: false, error: 'No coach profile' });
  });

  it('80806 the CoachHelm dashboards row is updated by coach id, and created with the defaults when the coach has none yet', async () => {
    const w = coachWrites();
    clientTables.current = {
      golf_coachhelm_settings: (filters) => {
        seen.push({ table: 'golf_coachhelm_settings', filters });
        return filters.some(([k]) => k === 'insert') ? {} : { data: [] };
      },
    };
    expect(await w.setCoachHelmCoach({ showInsights: false })).toEqual({ success: true });
    const [update, insert] = called('golf_coachhelm_settings');
    expect(update).toEqual([
      ['update', [{ auto_insights: false }]],
      ['eq', ['coach_id', 'c1']],
      ['select', ['id']],
    ]);
    expect(insert).toEqual([['insert', [{ coach_id: 'c1', enabled: true, auto_insights: false, weekly_summary: true, trend_alerts: true }]]]);
  });

  it('80807 a new password is set only after the current one signs in, and a wrong current password changes nothing', async () => {
    const w = coachWrites();
    expect(await w.changePassword('old-pass', 'new-password')).toEqual({ success: true });
    expect(client.signInWithPassword).toHaveBeenCalledWith({ email: 'maya.reyes@unc.edu', password: 'old-pass' });
    expect(client.updateUser).toHaveBeenCalledWith({ password: 'new-password' });
    expect(client.signInWithPassword.mock.invocationCallOrder[0]!).toBeLessThan(client.updateUser.mock.invocationCallOrder[0]!);

    client.updateUser.mockClear();
    client.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    expect(await w.changePassword('wrong', 'new-password')).toEqual({ success: false, error: 'Your current password is incorrect.' });
    expect(client.updateUser).not.toHaveBeenCalled();

    expect(await coachWrites({ email: null }).changePassword('old-pass', 'new-password')).toEqual({ success: false, error: 'Your account has no email to confirm with.' });
    expect(client.updateUser).not.toHaveBeenCalled();
  });

  it('CH-8002 a photo of the wrong type, or over 2 MB, is refused before anything is uploaded', async () => {
    const w = coachWrites();
    const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });
    expect(await w.uploadAvatar(file('a.txt', 'text/plain'))).toEqual({ success: false, error: 'Choose an image file.' });
    expect(await w.uploadAvatar(file('a.svg', 'image/svg+xml'))).toEqual({ success: false, error: 'Use a JPEG, PNG, GIF or WebP photo.' });
    expect(await w.uploadAvatar(file('big.png', 'image/png', 2 * 1024 * 1024 + 1))).toEqual({ success: false, error: 'Photos must be under 2 MB.' });
    expect(client.upload).not.toHaveBeenCalled();
    const ok = await w.uploadAvatar(file('me.png', 'image/png'));
    expect(ok).toEqual({ success: true, data: { url: 'https://cdn.test/avatar-1.png' } });
    expect(client.upload.mock.calls[0]![0]).toMatch(/^u-maya\/avatar-\d+\.png$/);
  });

  it('80903 after a delete this device is cleaned up first (caches, active team, session) and then sent to the sign-in page in the app or the home page on the web', async () => {
    const assign = vi.fn();
    const real = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...real, assign } });
    try {
      const order: string[] = [];
      actions.clearAllCachedResources.mockImplementation(() => order.push('caches'));
      actions.clearActiveTeam.mockImplementation(async () => void order.push('team'));
      client.signOut.mockImplementation(async () => void order.push('session'));
      await coachWrites().cleanupAfterDelete();
      expect(order).toEqual(['caches', 'team', 'session']);
      expect(assign).toHaveBeenLastCalledWith('/');
      native.on = true;
      expect(afterDeleteHref()).toBe('/golf/login');
      await coachWrites().cleanupAfterDelete();
      expect(assign).toHaveBeenLastCalledWith('/golf/login');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: real });
    }
  });
});
