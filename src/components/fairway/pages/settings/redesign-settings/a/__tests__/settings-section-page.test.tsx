/**
 * Direction A sub-pages: each section hosts G's own panels inside the
 * unsaved-changes guard, gates by role in place, keeps anchors for the index's
 * multi-row sections, and never opens the player details form on a failed read
 * (a blank form whose Save would overwrite a good profile).
 */
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GolfUserProvider, type GolfUserData } from '@/contexts/golf-user-context';
import { SettingsSectionPage } from '../settings-section-page';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));
vi.mock('@/components/fairway/view-header', () => ({
  ViewHeader: ({ title, description }: { title: ReactNode; description?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </header>
  ),
}));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));
vi.mock('@/components/fairway/feedback/ReportProblemButton', () => ({
  ReportProblemButton: () => <span>Report a problem</span>,
}));
vi.mock('@/components/golf/settings/JoinTeamSection', () => ({
  JoinTeamSection: () => <div>Join team section</div>,
}));
vi.mock('@/components/golf/coachhelm/v2', () => ({
  CoachHelmToggle: ({ coachId }: { coachId: string }) => <div>CoachHelm toggle {coachId}</div>,
}));
vi.mock('@/components/fairway/pages/settings/FairwaySettingsGeneral', () => ({
  AppearancePanel: () => <div>Appearance panel</div>,
  DistanceUnitsPanel: () => <div>Distance units panel</div>,
  HapticsPanel: () => null,
  NotificationsPanel: ({ coachId }: { coachId?: string }) => (
    <div>Notifications panel {coachId ?? 'without digest'}</div>
  ),
  PersonalInfoPanel: () => <div>Personal info panel</div>,
  EmailPanel: ({ currentEmail }: { currentEmail: string }) => <div>Email panel {currentEmail}</div>,
  PasswordPanel: () => <div>Password panel</div>,
  GolfScoringPanel: ({ teamId }: { teamId: string }) => <div>Scoring panel {teamId}</div>,
  EventRemindersPanel: ({ teamId }: { teamId: string }) => <div>Reminders panel {teamId}</div>,
  TeamSettingsPanel: () => <div>Team settings panel</div>,
  InviteSettingsPanel: () => <div>Invite panel</div>,
  PlayerGolfDetailsPanel: () => <div>Golf details form</div>,
  UnsavedChangesGuard: ({ children }: { children: ReactNode }) => <div data-testid="unsaved-guard">{children}</div>,
}));

const db = vi.hoisted(() => ({
  results: new Map<string, { data: unknown; error: { message: string } | null }>(),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(async () => db.results.get(table) ?? { data: null, error: null });
      return builder;
    },
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-2', email: 'jordan@example.com' } } })) },
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
  playerId: 'player-1',
  teamId: 'team-1',
};

function renderSection(user: GolfUserData, slug: Parameters<typeof SettingsSectionPage>[0]['slug']) {
  return render(
    <GolfUserProvider userData={user}>
      <SettingsSectionPage slug={slug} />
    </GolfUserProvider>,
  );
}

beforeEach(() => {
  db.results.clear();
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

describe('Direction A sections', () => {
  it('Team hosts the four team panels, anchored for the index rows, inside the unsaved-changes guard', () => {
    const { container } = renderSection(COACH, 'team');
    const guard = screen.getByTestId('unsaved-guard');
    expect(guard).toContainElement(screen.getByText('Scoring panel team-1'));
    expect(screen.getByText('Stanford Men’s Golf')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/golf/dashboard/settings');
    for (const [anchor, text] of [
      ['scoring', 'Scoring panel team-1'],
      ['reminders', 'Reminders panel team-1'],
      ['organization', 'Team settings panel'],
      ['invite', 'Invite panel'],
    ] as const) {
      expect(container.querySelector(`#${anchor}`)).toContainElement(screen.getByText(text));
    }
  });

  it('keeps an anchored panel in view while the panels above it grow', () => {
    window.history.replaceState(null, '', '/golf/dashboard/settings/team#reminders');
    const observers: Array<() => void> = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          observers.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    const scrolled: string[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this.id);
    };
    try {
      renderSection(COACH, 'team');
      expect(scrolled).toEqual(['reminders']);
      observers.forEach((cb) => cb()); // a panel above finished loading
      expect(scrolled).toEqual(['reminders', 'reminders']);
      window.dispatchEvent(new Event('wheel')); // the reader takes over
      observers.forEach((cb) => cb());
      expect(scrolled).toEqual(['reminders', 'reminders']);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('a player sent to Team is told where their settings live, in place', () => {
    renderSection(PLAYER, 'team');
    expect(screen.queryByText('Scoring panel team-1')).toBeNull();
    expect(screen.getByRole('link', { name: /Open Golf profile/ })).toHaveAttribute(
      'href',
      '/golf/dashboard/settings/golf',
    );
  });

  it('a failed golf_players read never opens the blank details form', async () => {
    db.results.set('golf_players', { data: null, error: { message: 'timeout' } });
    renderSection(PLAYER, 'golf');
    expect(await screen.findByText('Couldn’t load your golf details.')).toBeInTheDocument();
    expect(screen.queryByText('Golf details form')).toBeNull();
    expect(screen.getByText('Join team section')).toBeInTheDocument();
  });

  it('a loaded player profile opens the details form', async () => {
    db.results.set('golf_players', {
      data: { first_name: 'Jordan', last_name: 'Lee', avatar_url: null, handicap: null, handicap_index: 4.8 },
      error: null,
    });
    renderSection(PLAYER, 'golf');
    expect(await screen.findByText('Golf details form')).toBeInTheDocument();
  });

  it('Account shows the shared skeleton until the profile loads, then the three panels', async () => {
    renderSection(COACH, 'account');
    expect(screen.getByText('Loading settings…')).toBeInTheDocument();
    expect(await screen.findByText('Personal info panel')).toBeInTheDocument();
    expect(screen.getByText('Email panel jordan@example.com')).toBeInTheDocument();
    expect(screen.getByText('Password panel')).toBeInTheDocument();
  });

  it('Email & push passes the coach id (weekly email switch) and links players to their matrix', () => {
    const { unmount } = renderSection(COACH, 'delivery');
    expect(screen.getByText('Notifications panel coach-1')).toBeInTheDocument();
    unmount();
    renderSection(PLAYER, 'delivery');
    expect(screen.getByText('Notifications panel without digest')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Rounds, goals & insights/ })).toHaveAttribute(
      'href',
      '/golf/dashboard/settings/notifications',
    );
  });

  it('CoachHelm hosts the existing toggle for the coach', () => {
    renderSection(COACH, 'coachhelm');
    expect(screen.getByText('CoachHelm toggle coach-1')).toBeInTheDocument();
  });
});
