/**
 * @vitest-environment node
 *
 * P001 wiring: every address a notification row (and its push) can carry, for each role that receives it, lands on a
 * Clubhouse screen, and the query that names its item is read by that screen. The addresses are production's: the
 * distinct `action_url` shapes in `notifications` and `golf_calendar_notifications` (read-only aggregate, 2026-10-17)
 * and every writer under src/lib and src/app that sets one. An old address is followed through its route's own layout
 * (redirectToClubhouse), so a changed alias target fails here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.fn((href: string) => {
  throw new Error(`REDIRECT ${href}`);
});
let role: 'coach' | 'player' = 'coach';
let search = '';
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: (h: string) => redirect(h) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers(search ? { 'x-helm-search': search } : {}) }));
vi.mock('@/lib/auth/get-golf-dashboard-role', () => ({ getGolfDashboardRole: async () => role }));
vi.mock('../gate', () => ({ isClubhouseFor: async (r: string | null) => !!r }));

const { isAliased, isRebuilt } = await import('../shell/nav');
const { parseHubTab } = await import('../lib/hub-tabs');
const { PLAYER_HELM_DEVELOPMENT_HREF } = await import('../data/coachhelm-views-shape');
const { SECTIONS } = await import('../screens/settings/model');

const ID = '3f0c9a52-1d7e-4c1b-9a77-0b8f5c2e6d41';
const ROOT = join(__dirname, '..', '..', '..');
const DASH = join(ROOT, 'src/app/golf/(dashboard)/dashboard');

type Role = 'coach' | 'player';

/** Each layout that moves an old address, by its first segment. */
type Layout = (p: { children: null; params?: Promise<{ id: string }> }) => Promise<unknown>;
const LAYOUTS: Record<string, () => Promise<{ default: unknown }>> = {
  announcements: () => import('@/app/golf/(dashboard)/dashboard/announcements/layout'),
  tasks: () => import('@/app/golf/(dashboard)/dashboard/tasks/layout'),
  team: () => import('@/app/golf/(dashboard)/dashboard/team/layout'),
  'rounds-review': () => import('@/app/golf/(dashboard)/dashboard/rounds/[id]/review/layout'),
};

/** Where an address ends up for a role: itself when rebuilt, else wherever its layout sends it (null: nowhere). */
async function land(href: string, r: Role): Promise<string | null> {
  const url = new URL(href, 'https://x.invalid');
  const path = url.pathname;
  if (isRebuilt(path, r)) return href;
  if (!isAliased(path)) return null;
  role = r;
  search = url.search.replace(/^\?/, '');
  const seg = path.replace('/golf/dashboard/', '');
  const key = /^rounds\/[^/]+\/review$/.test(seg) ? 'rounds-review' : seg;
  const load = LAYOUTS[key];
  if (!load) throw new Error(`no layout registered in this test for ${path}`);
  redirect.mockClear();
  const layout = (await load()).default as Layout;
  const params = key === 'rounds-review' ? Promise.resolve({ id: seg.split('/')[1]! }) : undefined;
  try {
    await layout({ children: null, params });
  } catch (e) {
    const m = /^REDIRECT (.+)$/.exec((e as Error).message);
    if (m) return m[1]!;
    throw e;
  }
  return null;
}

/**
 * Who receives each address, as its writer addresses it. `next.config` sends /my-development on to
 * /coachhelm?view=development before any page renders; Clubhouse's CoachHelm then opens the Development tab.
 */
const LINKS: ReadonlyArray<{ href: string; roles: readonly Role[]; writer: string }> = [
  { href: `/golf/dashboard/calendar?event=${ID}`, roles: ['coach', 'player'], writer: 'calendar-events.ts, rsvp.ts, cron/event-reminders' },
  { href: '/golf/dashboard/calendar', roles: ['coach', 'player'], writer: 'recurring-events.ts, the stale-calendar summary row' },
  { href: `/golf/dashboard/messages?conversation=${ID}`, roles: ['coach', 'player'], writer: 'golf-message-fanout.ts' },
  { href: '/golf/dashboard/announcements', roles: ['coach', 'player'], writer: 'announcements.ts' },
  { href: `/golf/dashboard/tasks?task=${ID}`, roles: ['coach', 'player'], writer: 'task-reminders.ts, notifications/index.ts' },
  { href: '/golf/dashboard/roster', roles: ['coach'], writer: 'teams.ts (a player joined)' },
  { href: '/golf/dashboard/roster?tab=requests', roles: ['coach'], writer: 'teams.ts (a join request)' },
  { href: '/golf/dashboard/team', roles: ['coach'], writer: 'older team_join rows' },
  { href: '/golf/dashboard', roles: ['coach', 'player'], writer: 'teams.ts (approved)' },
  { href: '/golf/dashboard/settings', roles: ['player'], writer: 'teams.ts (not approved)' },
  { href: '/golf/dashboard/coachhelm', roles: ['coach', 'player'], writer: 'insight-notifier.ts, notify.ts overview' },
  { href: '/golf/dashboard/coachhelm?view=development', roles: ['player'], writer: 'notify.ts tab-plan-player, development.ts' },
  { href: `/golf/dashboard/rounds/${ID}/review`, roles: ['player'], writer: 'notify.ts round review' },
  { href: `/golf/dashboard/qualifiers/${ID}`, roles: ['coach', 'player'], writer: 'player-notify.ts, notifications/index.ts' },
  { href: '/golf/dashboard/settings?section=notifications', roles: ['coach', 'player'], writer: 'push-subscriptions/test' },
];

beforeEach(() => {
  redirect.mockClear();
  search = '';
});

describe('P001 notification links resolve to a Clubhouse screen', () => {
  for (const link of LINKS) {
    for (const r of link.roles) {
      it(`${r}: ${link.href} (${link.writer})`, async () => {
        const at = await land(link.href, r);
        expect(at, `${link.href} has no Clubhouse screen for a ${r}`).not.toBeNull();
        expect(isRebuilt(new URL(at!, 'https://x.invalid').pathname, r)).toBe(true);
      });
    }
  }

  it('an old address keeps the item it names when it moves', async () => {
    expect(await land(`/golf/dashboard/tasks?task=${ID}`, 'coach')).toBe(`/golf/dashboard/team-hub?tab=tasks&task=${ID}`);
    expect(await land(`/golf/dashboard/tasks?task=${ID}`, 'player')).toBe(`/golf/dashboard/team-hub?tab=tasks&task=${ID}`);
    expect(await land(`/golf/dashboard/rounds/${ID}/review`, 'player')).toBe(`/golf/dashboard/rounds/${ID}`);
    expect(await land('/golf/dashboard/team', 'coach')).toBe('/golf/dashboard/settings?section=team');
  });

  it('/my-development reaches the player Development tab: next.config, then CoachHelm', () => {
    const config = readFileSync(join(ROOT, 'next.config.mjs'), 'utf8');
    expect(config).toMatch(/source: '\/golf\/dashboard\/my-development',\s*destination: '\/golf\/dashboard\/coachhelm\?view=development'/);
    const route = readFileSync(join(ROOT, 'src/clubhouse/routes/coachhelm.tsx'), 'utf8');
    expect(route).toContain("if (view === 'development') redirect(PLAYER_HELM_DEVELOPMENT_HREF)");
    expect(isRebuilt(new URL(PLAYER_HELM_DEVELOPMENT_HREF, 'https://x.invalid').pathname, 'player')).toBe(true);
  });
});

describe('P001 the query a notification carries is read by its screen', () => {
  it('Team Hub opens the tab a moved address names, for each role', () => {
    expect(parseHubTab('ann', 'coach')).toBe('ann');
    expect(parseHubTab('ann', 'player')).toBe('ann');
    expect(parseHubTab('tasks', 'coach')).toBe('tasks');
    expect(parseHubTab('tasks', 'player')).toBe('tasks');
    const page = readFileSync(join(DASH, 'team-hub/page.tsx'), 'utf8');
    expect(page).toMatch(/<ClubhouseHubRoute tab=\{legacyTab\} task=/);
  });

  it('Settings opens the section a link names, for the role it is sent to', () => {
    expect(SECTIONS.coach.some((s) => s.id === 'team')).toBe(true);
    expect(SECTIONS.player.some((s) => s.id === 'golf')).toBe(true);
    for (const r of ['coach', 'player'] as const) expect(SECTIONS[r].some((s) => s.id === 'notifications')).toBe(true);
    expect(readFileSync(join(DASH, 'settings/page.tsx'), 'utf8')).toContain('<ClubhouseSettingsRoute section={section} />');
  });

  it('Calendar is handed ?event= and loads that event’s own day', () => {
    expect(readFileSync(join(DASH, 'calendar/page.tsx'), 'utf8')).toMatch(/event=\{initialEventId\}/);
    expect(readFileSync(join(ROOT, 'src/clubhouse/data/calendar.ts'), 'utf8')).toMatch(/if \(!input\.date && input\.event && UUID\.test\(input\.event\)\)/);
  });

  it('Messages reads ?conversation= from the address', () => {
    expect(readFileSync(join(ROOT, 'src/clubhouse/screens/messages/Messages.tsx'), 'utf8')).toContain("params.get('conversation')");
  });

  it('Roster reads ?tab=requests (the phone opens the requests sheet; desktop focuses the requests card)', () => {
    expect(readFileSync(join(ROOT, 'src/clubhouse/screens/roster/RosterPhone.tsx'), 'utf8')).toContain("searchParams.get('tab') === 'requests'");
    expect(readFileSync(join(ROOT, 'src/clubhouse/screens/roster/Roster.tsx'), 'utf8')).toContain("searchParams.get('tab') === 'requests'");
    expect(isRebuilt('/golf/dashboard/roster', 'coach')).toBe(true);
  });
});
