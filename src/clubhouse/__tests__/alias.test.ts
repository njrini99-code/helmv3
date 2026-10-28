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
let briefOn = false;
vi.mock('@/lib/coachhelm/v3/monday-brief/flag', () => ({ isMondayBriefEnabled: () => briefOn }));

const { redirectToClubhouse } = await import('../routes/alias');
const HUB = '/golf/dashboard/team-hub';

beforeEach(() => {
  redirect.mockClear();
  session = { coach: {} };
  flagOn = true;
  briefOn = false;
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

  it("a player's page, game, print and genome open their Stats profile (the player pages on Game detail); compare opens Team stats", async () => {
    const { default: PlayerPagesLayout } = await import('@/app/golf/(dashboard)/dashboard/players/[playerId]/layout');
    await expect(PlayerPagesLayout({ children: null, params: Promise.resolve({ playerId: PID }) })).rejects.toThrow(`REDIRECT /golf/dashboard/stats?player=${PID}&tab=game`);
    // An old genome link is served as /players/<id>/genome (next.config, before any layout): the players layout above takes it,
    // and the frame lets it render (A30, G2). The coachhelm/genome/[playerId] layout is never reached.
    const { isAliased } = await import('../shell/nav');
    for (const tail of ['/game', '/game/print', '/genome']) expect(isAliased(`/golf/dashboard/players/${PID}${tail}`), tail).toBe(true);
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

  it('a task notification opens that task on the Tasks tab, for a coach and a player', async () => {
    const { default: TasksLayout } = await import('@/app/golf/(dashboard)/dashboard/tasks/layout');
    search = `?task=${TID}`;
    await expect(TasksLayout({ children: null })).rejects.toThrow(`REDIRECT ${HUB}?tab=tasks&task=${TID}`);
    session = { player: {} };
    await expect(TasksLayout({ children: null })).rejects.toThrow(`REDIRECT ${HUB}?tab=tasks&task=${TID}`);
  });

  it('with no task, or a value that is not an id, Tasks opens as before', async () => {
    const { default: TasksLayout } = await import('@/app/golf/(dashboard)/dashboard/tasks/layout');
    await expect(TasksLayout({ children: null })).rejects.toThrow(`REDIRECT ${HUB}?tab=tasks`);
    search = '?task=' + encodeURIComponent('x"><script>');
    await expect(TasksLayout({ children: null })).rejects.toThrow(new RegExp(`REDIRECT ${HUB}\\?tab=tasks$`));
    session = { player: {} };
    await expect(TasksLayout({ children: null })).rejects.toThrow(new RegExp(`REDIRECT ${HUB}\\?tab=tasks$`));
  });

  it('/intelligence keeps ?player and turns view=chat into Ask; other views are dropped', async () => {
    const { default: IntelligenceLayout } = await import('@/app/golf/(dashboard)/dashboard/intelligence/layout');
    search = `?player=${TID}&view=chat`;
    await expect(IntelligenceLayout({ children: null })).rejects.toThrow(`REDIRECT /golf/dashboard/coachhelm?player=${TID}&view=ask`);
    search = '?view=genome&other=1';
    await expect(IntelligenceLayout({ children: null })).rejects.toThrow(new RegExp('REDIRECT /golf/dashboard/coachhelm$'));
  });

  it('CH-13998 with the coach Brief on, /intelligence and its old sub-links open the Brief at the part they were for', async () => {
    const { default: IntelligenceLayout } = await import('@/app/golf/(dashboard)/dashboard/intelligence/layout');
    briefOn = true;
    const lands = async (q: string) => {
      search = q;
      redirect.mockClear();
      await IntelligenceLayout({ children: null }).catch(() => {});
      return redirect.mock.calls[0]?.[0];
    };
    const BRIEF = '/golf/dashboard/coachhelm?view=brief';
    expect(await lands('')).toBe(BRIEF);
    // /alerts and /insights (Signals) land on this week's reads; /patterns on the team pattern.
    expect(await lands('?view=signals&filter=alerts')).toBe(BRIEF);
    expect(await lands('?view=signals&filter=insights&id=in-1')).toBe(BRIEF);
    expect(await lands('?view=signals&filter=patterns')).toBe(`${BRIEF}&section=patterns`);
    // /development (Players) on what players are working on; /analytics/coachhelm (Effectiveness) on the track record.
    expect(await lands('?view=players')).toBe(`${BRIEF}&section=working`);
    expect(await lands('?view=effectiveness')).toBe(`${BRIEF}&section=record`);
    // A player link still opens the board on that player, and chat is still Ask.
    expect(await lands(`?view=players&player=${TID}`)).toBe(`/golf/dashboard/coachhelm?player=${TID}`);
    expect(await lands('?view=chat')).toBe('/golf/dashboard/coachhelm?view=ask');
  });

  it('a string target ignores the query (genome compare keeps nothing)', async () => {
    const { default: CompareLayout } = await import('@/app/golf/(dashboard)/dashboard/coachhelm/genome/compare/layout');
    search = `?a=${TID}&b=${TID}`;
    await expect(CompareLayout({ children: null })).rejects.toThrow(new RegExp('REDIRECT /golf/dashboard/stats/team$'));
  });
});

describe('an old /coachhelm/chat link keeps its conversation and question (2026-10-28)', () => {
  const CID = '6f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f';
  const ASK = '/golf/dashboard/coachhelm?view=ask';
  const lands = async (q: string) => {
    const { default: ChatLayout } = await import('@/app/golf/(dashboard)/dashboard/coachhelm/chat/layout');
    search = q;
    redirect.mockClear();
    await ChatLayout({ children: null }).catch(() => {});
    return redirect.mock.calls[0]?.[0];
  };

  it('keeps ?c= and ?q=, encoded, on the Ask sub-tab', async () => {
    expect(await lands(`?c=${CID}`)).toBe(`${ASK}&c=${CID}`);
    const href = await lands(`?c=${CID}&q=${encodeURIComponent('Who putts best from 6 feet & in?')}`);
    expect(href).toBe(`${ASK}&c=${CID}&q=Who+putts+best+from+6+feet+%26+in%3F`);
    expect(new URL(href!, 'https://x.test').searchParams.get('q')).toBe('Who putts best from 6 feet & in?');
  });

  it('drops every other key, a conversation that is not an id, and a question with control characters or past 1000 characters', async () => {
    expect(await lands('?other=1&view=brief')).toBe(ASK);
    expect(await lands('?c=' + encodeURIComponent('x"><script>'))).toBe(ASK);
    expect(await lands('?q=' + encodeURIComponent('line\nbreak'))).toBe(ASK);
    expect(await lands('?q=' + 'a'.repeat(1001))).toBe(ASK);
    // A question can't smuggle another key or path: it stays one encoded value.
    const href = await lands('?q=' + encodeURIComponent('x&view=brief#/admin'));
    const url = new URL(href!, 'https://x.test');
    expect(url.pathname).toBe('/golf/dashboard/coachhelm');
    expect([...url.searchParams.keys()]).toEqual(['view', 'q']);
    expect(url.searchParams.get('view')).toBe('ask');
    expect(url.searchParams.get('q')).toBe('x&view=brief#/admin');
  });

  it("a player's old chat link still opens their CoachHelm, with nothing carried", async () => {
    session = { player: {} };
    expect(await lands(`?c=${CID}&q=hi`)).toBe('/golf/dashboard/coachhelm');
  });
});
