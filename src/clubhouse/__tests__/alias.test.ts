/**
 * @vitest-environment node
 *
 * Old addresses whose screen lives elsewhere in Clubhouse go there, and only
 * with Clubhouse on for the signed-in role and the target rebuilt for it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.fn((href: string) => {
  throw new Error(`REDIRECT ${href}`);
});
let session: { coach?: object; player?: object } | null = { coach: {} };
let flagOn = true;

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: (h: string) => redirect(h) }));
let search = '';
vi.mock('next/headers', () => ({ headers: async () => new Headers(search ? { 'x-helm-search': search } : {}) }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => session }));
vi.mock('../gate', () => ({ isClubhouseFor: (role: string | null) => !!role && flagOn }));

const { redirectToClubhouse } = await import('../routes/alias');
const HUB = '/golf/dashboard/team-hub';

beforeEach(() => {
  redirect.mockClear();
  session = { coach: {} };
  flagOn = true;
  search = '';
});

describe('redirectToClubhouse', () => {
  it("sends a coach with Clubhouse on to the role's target", async () => {
    await expect(redirectToClubhouse({ coach: `${HUB}?tab=tasks`, player: HUB })).rejects.toThrow(`REDIRECT ${HUB}?tab=tasks`);
  });

  it("sends a player to the player's target", async () => {
    session = { player: {} };
    await expect(redirectToClubhouse({ coach: `${HUB}?tab=tasks`, player: HUB })).rejects.toThrow(`REDIRECT ${HUB}`);
  });

  it('leaves the Fairway page alone with the flag off, signed out, or with no target for the role', async () => {
    flagOn = false;
    await redirectToClubhouse({ coach: HUB });
    flagOn = true;
    session = null;
    await redirectToClubhouse({ coach: HUB });
    session = { player: {} };
    await redirectToClubhouse({ coach: '/golf/dashboard/stats?player=p1' });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('never sends anyone to a screen not rebuilt for their role', async () => {
    session = { player: {} };
    await redirectToClubhouse({ player: '/golf/dashboard/lineups' });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('30806 an old /roster/[id] link', () => {
  const PID = '0b6c1d2e-3f40-4a51-8b62-7c83d94e0f15';

  it("opens the player's Stats for a coach and the roster for a player (a teammate has no page), only with Clubhouse on", async () => {
    const { default: RosterIdLayout } = await import('@/app/golf/(dashboard)/dashboard/roster/[id]/layout');
    const open = () => RosterIdLayout({ children: null, params: Promise.resolve({ id: PID }) });
    await expect(open()).rejects.toThrow(`REDIRECT /golf/dashboard/stats?player=${PID}`);
    session = { player: {} };
    await expect(open()).rejects.toThrow('REDIRECT /golf/dashboard/roster');
    flagOn = false;
    await open();
    expect(redirect).toHaveBeenCalledTimes(2);
  });
});

describe('owner 2026-10-01: the remaining not-rebuilt addresses open the nearest Clubhouse screen', () => {
  const PID = '0b6c1d2e-3f40-4a51-8b62-7c83d94e0f15';

  it("a player's page, game, print and genome open their Stats profile; compare opens Team stats", async () => {
    const { default: PlayerPagesLayout } = await import('@/app/golf/(dashboard)/dashboard/players/[playerId]/layout');
    await expect(PlayerPagesLayout({ children: null, params: Promise.resolve({ playerId: PID }) })).rejects.toThrow(`REDIRECT /golf/dashboard/stats?player=${PID}`);
    const { default: GenomeLayout } = await import('@/app/golf/(dashboard)/dashboard/coachhelm/genome/[playerId]/layout');
    await expect(GenomeLayout({ children: null, params: Promise.resolve({ playerId: PID }) })).rejects.toThrow(`REDIRECT /golf/dashboard/stats?player=${PID}`);
    const { default: CompareLayout } = await import('@/app/golf/(dashboard)/dashboard/coachhelm/genome/compare/layout');
    await expect(CompareLayout({ children: null })).rejects.toThrow('REDIRECT /golf/dashboard/stats/team');
  });

  it('/team opens Settings (Team for a coach, Golf for a player); courses opens Home, and a player’s What’s new opens Home; a player’s chat opens CoachHelm', async () => {
    const { default: TeamLayout } = await import('@/app/golf/(dashboard)/dashboard/team/layout');
    await expect(TeamLayout({ children: null })).rejects.toThrow('REDIRECT /golf/dashboard/settings?section=team');
    const { default: CoursesLayout } = await import('@/app/golf/(dashboard)/dashboard/courses/layout');
    await expect(CoursesLayout({ children: null })).rejects.toThrow('REDIRECT /golf/dashboard');
    session = { player: {} };
    await expect(TeamLayout({ children: null })).rejects.toThrow('REDIRECT /golf/dashboard/settings?section=golf');
    const { default: WhatsNewLayout } = await import('@/app/golf/(dashboard)/dashboard/whats-new/layout');
    await expect(WhatsNewLayout({ children: null })).rejects.toThrow('REDIRECT /golf/dashboard');
    // The coach's What's new is rebuilt (routes/whats-new.tsx): its layout lets them through.
    session = { coach: {} };
    redirect.mockClear();
    await WhatsNewLayout({ children: null });
    expect(redirect).not.toHaveBeenCalled();
    const { default: ChatLayout } = await import('@/app/golf/(dashboard)/dashboard/coachhelm/chat/layout');
    await expect(ChatLayout({ children: null })).rejects.toThrow('REDIRECT /golf/dashboard/coachhelm');
  });
});

describe('swap audit §14 aliases (D6, D8)', () => {
  const QID = '0b6c1d2e-3f40-4a51-8b62-7c83d94e0f15';

  it('/intelligence opens a coach on CoachHelm', async () => {
    const { default: IntelligenceLayout } = await import('@/app/golf/(dashboard)/dashboard/intelligence/layout');
    await expect(IntelligenceLayout({ children: null })).rejects.toThrow('REDIRECT /golf/dashboard/coachhelm');
  });

  it("the old qualifying workspace opens a coach on that qualifier's selection; an id that isn't one stays on Fairway", async () => {
    const { default: QualifyingWorkspaceLayout } = await import('@/app/golf/(dashboard)/dashboard/coachhelm/qualifying/[id]/layout');
    await expect(QualifyingWorkspaceLayout({ children: null, params: Promise.resolve({ id: QID }) })).rejects.toThrow(
      `REDIRECT /golf/dashboard/qualifiers/${QID}/selection`,
    );
    redirect.mockClear();
    await QualifyingWorkspaceLayout({ children: null, params: Promise.resolve({ id: 'not-an-id' }) });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('an old address keeps its query when it moves (the proxy hands layouts x-helm-search; 100103 for tasks)', () => {
  const TID = '6f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f';

  it('a task notification opens that task: on the coach’s Tasks tab, on the player’s Team Hub', async () => {
    const { default: TasksLayout } = await import('@/app/golf/(dashboard)/dashboard/tasks/layout');
    search = `?task=${TID}`;
    await expect(TasksLayout({ children: null })).rejects.toThrow(`REDIRECT ${HUB}?tab=tasks&task=${TID}`);
    session = { player: {} };
    await expect(TasksLayout({ children: null })).rejects.toThrow(`REDIRECT ${HUB}?task=${TID}`);
  });

  it('with no task, or a value that is not an id, Tasks opens as before', async () => {
    const { default: TasksLayout } = await import('@/app/golf/(dashboard)/dashboard/tasks/layout');
    await expect(TasksLayout({ children: null })).rejects.toThrow(`REDIRECT ${HUB}?tab=tasks`);
    search = '?task=' + encodeURIComponent('x"><script>');
    await expect(TasksLayout({ children: null })).rejects.toThrow(new RegExp(`REDIRECT ${HUB}\\?tab=tasks$`));
    session = { player: {} };
    await expect(TasksLayout({ children: null })).rejects.toThrow(new RegExp(`REDIRECT ${HUB}$`));
  });

  it('/intelligence keeps ?player and turns view=chat into Ask; other views are dropped', async () => {
    const { default: IntelligenceLayout } = await import('@/app/golf/(dashboard)/dashboard/intelligence/layout');
    search = `?player=${TID}&view=chat`;
    await expect(IntelligenceLayout({ children: null })).rejects.toThrow(`REDIRECT /golf/dashboard/coachhelm?player=${TID}&view=ask`);
    search = '?view=genome&other=1';
    await expect(IntelligenceLayout({ children: null })).rejects.toThrow(new RegExp('REDIRECT /golf/dashboard/coachhelm$'));
  });

  it('a string target ignores the query (genome compare keeps nothing)', async () => {
    const { default: CompareLayout } = await import('@/app/golf/(dashboard)/dashboard/coachhelm/genome/compare/layout');
    search = `?a=${TID}&b=${TID}`;
    await expect(CompareLayout({ children: null })).rejects.toThrow(new RegExp('REDIRECT /golf/dashboard/stats/team$'));
  });
});
