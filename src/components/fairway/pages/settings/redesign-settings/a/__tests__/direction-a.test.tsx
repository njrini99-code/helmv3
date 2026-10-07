/**
 * Direction A index: the right edge shows each role's live configuration from
 * read-only queries, holds placeholders until everything settles, degrades
 * per value on a failed read, and never writes on mount (the reason it does
 * not mount useCoachPhilosophy / useCoachHelmSettings, which both insert).
 */
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { GolfUserProvider, type GolfUserData } from '@/contexts/golf-user-context';
import { SettingsDirectionA } from '../../direction-a';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/fairway/view-header', () => ({
  ViewHeader: ({ title }: { title: ReactNode }) => <h1>{title}</h1>,
}));
vi.mock('@/lib/golf/theme', () => ({
  useGolfTheme: () => ({ theme: 'dark', setTheme: vi.fn(), isDark: true }),
}));
vi.mock('@/hooks/golf/use-distance-units', () => ({
  useDistanceUnits: () => ({ distancePref: 'meters', setDistancePref: vi.fn() }),
}));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));
vi.mock('@/app/golf/actions/team-switcher', () => ({ clearActiveTeam: vi.fn(async () => undefined) }));
vi.mock('@/lib/golf/client-resource-cache', () => ({ clearAllCachedResources: vi.fn() }));

const actions = vi.hoisted(() => ({ getNotificationPreferences: vi.fn() }));
vi.mock('@/app/actions/notification-preferences', () => ({
  getNotificationPreferences: actions.getNotificationPreferences,
}));

/** Per-table maybeSingle results, and every write attempted on any table. */
const db = vi.hoisted(() => ({
  results: new Map<string, { data: unknown; error: { message: string } | null }>(),
  writes: [] as string[],
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      for (const method of ['insert', 'upsert', 'update', 'delete']) {
        builder[method] = vi.fn(() => {
          db.writes.push(`${table}.${method}`);
          return builder;
        });
      }
      builder.maybeSingle = vi.fn(async () => db.results.get(table) ?? { data: null, error: null });
      return builder;
    },
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1', email: 'sam@example.com' } } })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  }),
}));

const COACH: GolfUserData = {
  role: 'coach',
  userId: 'user-1',
  name: 'Sam Rivera',
  teamName: 'Stanford Men’s Golf',
  coachId: 'coach-1',
  teamId: 'team-1',
};

const PLAYER: GolfUserData = {
  role: 'player',
  userId: 'user-2',
  name: 'Jordan Lee',
  teamName: 'Stanford Men’s Golf',
  playerId: 'player-1',
  teamId: 'team-1',
};

/**
 * getNotificationPreferences' defaults as returned today: all five golf email
 * channels on; push on for tasks and CoachHelm only. push_announcements is
 * absent from the action's defaults, so the panel shows it off: "Push 2/5".
 */
const PREFS = {
  email_messages: true,
  email_event_reminders: true,
  email_announcements: true,
  email_task_reminders: true,
  email_coachhelm: true,
  push_messages: false,
  push_events: false,
  push_task_reminders: true,
  push_coachhelm: true,
  quiet_mode: false,
};

function renderAs(user: GolfUserData) {
  return render(
    <GolfUserProvider userData={user}>
      <SettingsDirectionA />
    </GolfUserProvider>,
  );
}

/** The row link for a label; its accessible name also carries the value. */
function row(label: string) {
  return screen.getByRole('link', { name: new RegExp(`^${label}`) });
}

beforeEach(() => {
  db.results.clear();
  db.writes.length = 0;
  actions.getNotificationPreferences.mockReset();
  actions.getNotificationPreferences.mockResolvedValue({ data: PREFS });
});

describe('Direction A index · coach', () => {
  beforeEach(() => {
    db.results.set('golf_teams', { data: { join_code: 'K7Q2MX', season: '2025-26' }, error: null });
    db.results.set('golf_coach_philosophy', {
      data: {
        email_digest_enabled: false,
        alert_sensitivity: 'balanced',
        alert_scoring_decline: true,
        alert_stat_regression: true,
        alert_tournament_pressure: true,
        alert_plateau: true,
        alert_bubble_player: true,
        alert_surge_player: true,
        alert_streaks: true,
        alert_recurring_weakness: false,
        alert_closing_holes: false,
        alert_par_3_issues: false,
      },
      error: null,
    });
    // golf_team_settings and golf_coachhelm_settings: no row (the default mock).
  });

  it('paints every row at once with its live value, from read-only queries', async () => {
    renderAs(COACH);

    // Structure first, values after: the rows are there before anything resolves.
    expect(row('Scoring & format')).toHaveAttribute('href', '/golf/dashboard/settings/team#scoring');

    expect(await screen.findByText('Email 5/5 · Push 2/5')).toBeInTheDocument();
    expect(within(row('Account')).getByText('sam@example.com')).toBeInTheDocument();
    expect(within(row('This device')).getByText('Dark · Meters')).toBeInTheDocument();
    expect(within(row('Weekly team email')).getByText('Off')).toBeInTheDocument();
    // No golf_team_settings row: Default, never the hard-coded panel fallbacks.
    expect(within(row('Scoring & format')).getByText('Default')).toBeInTheDocument();
    expect(within(row('Event reminders')).getByText('Default')).toBeInTheDocument();
    expect(within(row('Team & organization')).getByText('2025-26')).toBeInTheDocument();
    expect(within(row('Invite code')).getByText('K7Q2MX')).toBeInTheDocument();
    expect(within(row('Alerts')).getByText('7/10 on · Balanced')).toBeInTheDocument();
    expect(row('Alerts')).toHaveAttribute('href', '/golf/dashboard/settings/coaching-intelligence');
    // No golf_coachhelm_settings row: On, as the CoachHelm gate resolves it.
    expect(within(row('On my dashboards')).getByText('On')).toBeInTheDocument();

    // The tag: identity plus the invite code with its copy action.
    expect(screen.getByText('Sam Rivera')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy invite link' })).toBeInTheDocument();

    // Nothing on the index may write (6/22 coaches have no coachhelm row).
    expect(db.writes).toEqual([]);
  });

  it('hides the Team group and the invite stub for a coach with no team', async () => {
    renderAs({ ...COACH, teamId: undefined, teamName: undefined });
    await screen.findByText('Email 5/5 · Push 2/5');
    expect(screen.queryByRole('link', { name: /^Scoring & format/ })).toBeNull();
    expect(screen.queryByText('Invite code')).toBeNull();
    expect(screen.getByRole('link', { name: /^Alerts/ })).toBeInTheDocument();
  });

  it('a failed read shows Couldn’t load on that row and offers one retry', async () => {
    db.results.set('golf_team_settings', { data: null, error: { message: 'boom' } });
    renderAs(COACH);
    await screen.findByText('Email 5/5 · Push 2/5');
    expect(within(row('Scoring & format')).getByText('Couldn’t load')).toBeInTheDocument();
    expect(within(row('Event reminders')).getByText('Couldn’t load')).toBeInTheDocument();
    // Unaffected rows keep their values.
    expect(within(row('Invite code')).getByText('K7Q2MX')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('Direction A index · player', () => {
  it('shows the handicap index on the tag and golf rows, and Default for an untouched matrix', async () => {
    db.results.set('golf_players', {
      data: {
        first_name: 'Jordan',
        last_name: 'Lee',
        avatar_url: null,
        handicap: 5.2,
        handicap_index: 4.8,
        graduation_year: 2027,
        hometown: null,
        state: null,
        phone: null,
      },
      error: null,
    });
    db.results.set('golf_teams', {
      data: { id: 'team-1', name: 'Stanford Men’s Golf', organization: null },
      error: null,
    });
    renderAs(PLAYER);

    expect(await screen.findByText('Index 4.8')).toBeInTheDocument();
    expect(screen.getByText('4.8')).toBeInTheDocument(); // the tag readout
    expect(within(row('Rounds, goals & insights')).getByText('Default')).toBeInTheDocument();
    expect(row('Rounds, goals & insights')).toHaveAttribute('href', '/golf/dashboard/settings/notifications');
    expect(within(row('Team membership')).getByText('Stanford Men’s Golf')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Scoring & format/ })).toBeNull();
    expect(db.writes).toEqual([]);
  });

  it('an unset index is not shown on the tag and reads Index not set', async () => {
    db.results.set('golf_players', {
      data: { first_name: 'Jordan', last_name: 'Lee', avatar_url: null, handicap: null, handicap_index: null },
      error: null,
    });
    renderAs(PLAYER);
    expect(await screen.findByText('Index not set')).toBeInTheDocument();
    expect(screen.queryByText('Index', { exact: true })).toBeNull();
  });

  it('a player account with no player profile gets a way forward instead of placeholders', () => {
    renderAs({ ...PLAYER, playerId: undefined });
    expect(screen.getByText('No player profile yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});
