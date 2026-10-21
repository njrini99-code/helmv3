import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GolfSessionProfile } from '@/lib/auth/session';
import { resolved } from './route-view';

/**
 * A coach's views of one player (P013, spec A): `/golf/dashboard/coachhelm?view=deep-dive|standing|profile&player=<id>`. The route's
 * scope check (on this coach's team, or one "isn't on your team" page), the gates, the coach's voice on every view, the action row
 * on the Deep dive, and the links in and out, which all carry the player.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/golf/dashboard/coachhelm',
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
const phoneState = vi.hoisted(() => ({ on: false }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => phoneState.on, CH_PHONE_QUERY: '(max-width: 820px)' }));
// The phone top bar draws into the shell's slot; here it is a button that runs its Back.
vi.mock('../shell/phone-chrome', async (orig) => ({
  ...(await orig<typeof import('../shell/phone-chrome')>()),
  PhoneTop: (p: { back?: { label: string; onBack: () => void } | null; title?: ReactNode }) => (p.back ? <button onClick={p.back.onBack}>{`phone back to ${p.back.label}`}</button> : <h1>{p.title}</h1>),
}));
vi.mock('../shell/nav', async (orig) => ({ ...(await orig<typeof import('../shell/nav')>()), rebuiltHref: (href: string) => href }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const gates = vi.hoisted(() => ({ coach: vi.fn(), player: vi.fn() }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForCoach: gates.coach, isCoachHelmEnabledForPlayer: gates.player }));
const delivery = vi.hoisted(() => ({ coach: vi.fn(), player: vi.fn() }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({
  getInsightsForCoach: delivery.coach,
  getInsightsForPlayer: delivery.player,
  getTopInsightsForPlayers: vi.fn(),
  getThemesForCoach: vi.fn(async () => ({ success: false, error: 'none' })),
  getThemesForPlayer: vi.fn(),
}));
const standingRead = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({ loadPlayerStandingMap: standingRead.load }));
vi.mock('@/lib/coachhelm/v3/counterfactual/player-cohort-loader', () => ({ loadPlayerCohort: vi.fn(async () => ({ gender: 'mens', level: null })) }));
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({ loadActiveGoals: vi.fn(async () => []), loadRecentlyAchievedGoals: vi.fn(async () => []) }));
vi.mock('@/lib/coachhelm/v3/genome/loader', () => ({ loadGenome: vi.fn(async () => null) }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachProgramPulse: vi.fn(), getCoachChatContext: async () => ({ roster: [] }) }));
vi.mock('../data/coachhelm-chat', () => ({ loadAskCoachHelm: vi.fn() }));
vi.mock('../data/coachhelm-track-record', () => ({ loadCoachTrackRecord: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/track-record/flag', () => ({ isTrackRecordEnabled: () => false }));
const session = vi.hoisted(() => ({ current: null as GolfSessionProfile | null }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => session.current }));
const team = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: async () => team.current }));

import { ACTIVE_FOCUS_DUPLICATE_ERROR } from '@/lib/coachhelm/focus-areas/duplicate-guard';
import { STANDING_ROWS } from '../preview/fixtures-coachhelm-views';
import { coachHeadLine, type ChViewVoice } from '../data/coachhelm-views-shape';
import type { ChDeepDive } from '../data/coachhelm-dive-shape';
import { ClubhouseCoachHelmRoute } from '../routes/coachhelm';
import { CoachBoard } from '../screens/coachhelm/CoachBoard';
import { DeepDive } from '../screens/coachhelm/views/DeepDive';
import { Profile } from '../screens/coachhelm/views/Profile';
import { Standing } from '../screens/coachhelm/views/Standing';
import type { ChCoachHelmWrites } from '../screens/coachhelm/writes';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_HELM_COACH } from '../preview/fixtures-coachhelm';
import { PREVIEW_DIVE, PREVIEW_PROFILE, PREVIEW_STANDING } from '../preview/fixtures-coachhelm-views';
import { PREVIEW_COACH_DIVE, PREVIEW_COACH_PROFILE, PREVIEW_COACH_STANDING, PREVIEW_COACH_VOICE } from '../preview/fixtures-coachhelm-coach-player';

const COACH = 'c0000000-0000-4000-8000-000000000001';
const TEAM = 'a0000000-0000-4000-8000-000000000001';
const PID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const on = { effectivelyEnabled: true, disabledBy: null, disabledReason: null };
const YOU = /\b(you|your|yours)\b/i;

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const wrap = (node: ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);
const okWrites = (): ChCoachHelmWrites => ({
  assign: vi.fn(() => Promise.resolve({ success: true })),
  dismiss: vi.fn(() => Promise.resolve({ success: true })),
  undo: vi.fn(() => Promise.resolve({ success: true })),
});
const user = () => userEvent.setup();
const voice = PREVIEW_COACH_VOICE as Extract<ChViewVoice, { role: 'coach' }>;

type Filters = Array<[string, unknown[]]>;
const eqOf = (f: Filters, col: string) => f.find(([k, a]) => k === 'eq' && a[0] === col)?.[1][1];

beforeEach(() => {
  phoneState.on = false;
  router.push.mockClear();
  hapticSpy.mockClear();
  logServer.mockClear();
  gates.coach.mockReset().mockResolvedValue(on);
  gates.player.mockReset().mockResolvedValue(on);
  delivery.coach.mockReset().mockResolvedValue([]);
  delivery.player.mockReset().mockResolvedValue([]);
  standingRead.load.mockReset().mockResolvedValue(new Map());
  session.current = { coach: { id: COACH, organization_id: 'org-1', onboarding_completed: true }, player: null } as unknown as GolfSessionProfile;
  team.current = { role: 'coach', teamId: TEAM, coachId: COACH };
  tables.current = {
    golf_team_members: (f: Filters) => (eqOf(f, 'team_id') === TEAM && eqOf(f, 'player_id') === PID ? { data: { player_id: PID } } : { data: null }),
    golf_players: { data: { id: PID, first_name: 'Jonah', last_name: 'Okafor', graduation_year: 2028 } },
    golf_rounds: { data: { round_date: '2026-10-05' } },
    golf_player_stats_cache: { data: { rounds_played: 14, scoring_average: 77.2 } },
  };
  window.sessionStorage.clear();
});
afterEach(cleanup);

/** The route's answer for this address, run through each async view the server would run behind its boundary. */
async function page(params: { view?: string; player?: string; insight?: string }): Promise<ReactNode> {
  let out = await resolved(await ClubhouseCoachHelmRoute(params));
  // The scope is checked in one boundary and the view read in a second one inside it.
  out = await resolved(out);
  return out;
}

describe('130807 130104 the scope check: on this coach’s team, or one page for every other id', () => {
  it('CH-13311 a uuid not on the team: "That player isn’t on your team", and the standing map is never read', async () => {
    render(wrap(await page({ view: 'standing', player: OTHER })));
    expect(code('CH-13311')!.textContent).toMatch(/That player isn’t on your team.*They may have been removed, or the link is from another team\./);
    expect(within(code('CH-13311') as HTMLElement).getByRole('link', { name: 'Back to the board' }).getAttribute('href')).toBe('/golf/dashboard/coachhelm');
    expect(standingRead.load).not.toHaveBeenCalled();
  });

  it('CH-13311 an id that is not a uuid is the same page, with no query sent', async () => {
    const members = vi.fn(() => ({ data: { player_id: 'pl-jonah' } }));
    tables.current = { ...tables.current, golf_team_members: members };
    render(wrap(await page({ view: 'deep-dive', player: 'pl-jonah' })));
    expect(code('CH-13311')).not.toBeNull();
    expect(members).not.toHaveBeenCalled();
    expect(delivery.coach).not.toHaveBeenCalled();
  });

  it('CH-13209 a membership read that fails is the page’s "didn’t load", never "not on your team"', async () => {
    tables.current = { ...tables.current, golf_team_members: { error: { message: 'boom' } } };
    render(wrap(await page({ view: 'profile', player: PID })));
    expect(code('CH-13209')!.textContent).toMatch(/This player’s page didn’t load.*Nothing is lost\. Try again in a moment\./);
    expect(code('CH-13311')).toBeNull();
  });

  it('a player role with ?player= gets their own view, scoped to the session’s id, never the address’s', async () => {
    session.current = { coach: null, player: { id: 'player-1', onboarding_completed: true } } as unknown as GolfSessionProfile;
    const out = (await ClubhouseCoachHelmRoute({ view: 'standing', player: OTHER })) as ReactElement<{ children: ReactElement<Record<string, unknown>> }>;
    expect(isValidElement(out)).toBe(true);
    const child = out.props.children;
    expect((child.type as { name: string }).name).toBe('PlayerHelmView');
    expect(child.props).toMatchObject({ playerId: 'player-1', drill: 'standing' });
  });

  it('a coach’s ?view= with no player is the board', async () => {
    const out = (await ClubhouseCoachHelmRoute({ view: 'standing' })) as ReactElement<{ children: ReactElement }>;
    expect((out.props.children.type as { name: string }).name).toBe('CoachHelmView');
  });
});

describe('the gates', () => {
  it('CH-13305 CoachHelm off for the coach is the board’s own page', async () => {
    gates.coach.mockResolvedValue({ effectivelyEnabled: false, disabledBy: 'team', disabledReason: null });
    render(wrap(await page({ view: 'deep-dive', player: PID })));
    expect(code('CH-13305')).not.toBeNull();
  });

  it('CH-13313 CoachHelm off for the player’s team says so by name, with the coach’s reason and the way to turn it on', async () => {
    gates.player.mockResolvedValue({ effectivelyEnabled: false, disabledBy: 'coach', disabledReason: 'Pausing until the qualifier' });
    render(wrap(await page({ view: 'standing', player: PID })));
    const off = code('CH-13313') as HTMLElement;
    expect(off.textContent).toMatch(/CoachHelm is off for Jonah/);
    expect(off.textContent).toMatch(/It is turned off for Jonah’s team: “Pausing until the qualifier”\. Turn it on in CoachHelm settings to read Jonah’s game\./);
    expect(within(off).getByRole('link', { name: 'Open CoachHelm settings' }).getAttribute('href')).toBe('/golf/dashboard/settings/coaching-intelligence');
    expect(standingRead.load).not.toHaveBeenCalled();
  });

  it('CH-13209 a gate lookup that failed is the page’s "didn’t load"', async () => {
    gates.player.mockRejectedValue(new Error('down'));
    render(wrap(await page({ view: 'standing', player: PID })));
    expect(code('CH-13209')).not.toBeNull();
  });
});

describe('the coach Deep dive reads the coach feed', () => {
  it('getInsightsForCoach for the player, never getInsightsForPlayer; the page is the player’s, by name', async () => {
    render(wrap(await page({ view: 'deep-dive', player: PID })));
    expect(delivery.coach).toHaveBeenCalledWith(COACH, expect.objectContaining({ player_id: PID }));
    expect(delivery.player).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Jonah Okafor' })).toBeTruthy();
  });
});

describe('the coach’s voice', () => {
  const views = (): Array<[string, ReactNode]> => [
    ['profile', <Profile key="p" load={{ status: 'ready', data: PREVIEW_COACH_PROFILE }} voice={voice} />],
    ['standing', <Standing key="s" load={{ status: 'ready', data: PREVIEW_COACH_STANDING }} voice={voice} />],
    ...PREVIEW_COACH_DIVE.list.map((i): [string, ReactNode] => [`deep-dive ${i.base.id}`, <DeepDive key={i.base.id} load={{ status: 'ready', data: PREVIEW_COACH_DIVE }} voice={voice} initialId={i.base.id} writes={okWrites()} />]),
    ['profile failed', <Profile key="pf" load={{ status: 'failed' }} voice={voice} />],
    ['standing failed', <Standing key="sf" load={{ status: 'failed' }} voice={voice} />],
    ['deep dive failed', <DeepDive key="df" load={{ status: 'failed' }} voice={voice} />],
    ['deep dive off', <DeepDive key="do" load={{ status: 'off', reason: 'Paused' }} voice={voice} />],
    ['deep dive empty', <DeepDive key="de" load={{ status: 'ready', data: { ...PREVIEW_COACH_DIVE, list: [], rounds: 4 } }} voice={voice} />],
  ];

  it.each([false, true])('no "you" or "your" on any coach view (phone %s)', (phone) => {
    phoneState.on = phone;
    for (const [name, node] of views()) {
      const { container, unmount } = render(wrap(node));
      const text = container.textContent ?? '';
      expect(text.match(YOU)?.[0] ?? null, `${name}: …${text.slice(Math.max(0, (text.search(YOU) ?? 0) - 40), (text.search(YOU) ?? 0) + 40)}…`).toBeNull();
      unmount();
    }
  });

  const nums = (node: ReactNode) => {
    const { container, unmount } = render(wrap(node));
    // The page's own figures: not the coach header's line or the coach's "what CoachHelm sees" line, which the player's page has none of.
    // The figures in them, in any order (a read assigned in the coach's fixture sorts differently), not the words around them.
    const out = [...container.querySelectorAll('.ch-num')]
      .filter((el) => !el.closest('.ch-hl-h, .ch-hv-seen'))
      .flatMap((el) => el.textContent?.match(/[−+-]?\d+(?:\.\d+)?%?/g) ?? [])
      .sort();
    unmount();
    return out;
  };

  it('the numbers are the same for both roles', () => {
    expect(nums(<Standing load={{ status: 'ready', data: PREVIEW_COACH_STANDING }} voice={voice} />)).toEqual(nums(<Standing load={{ status: 'ready', data: PREVIEW_STANDING }} />));
    expect(nums(<Profile load={{ status: 'ready', data: PREVIEW_COACH_PROFILE }} voice={voice} />)).toEqual(nums(<Profile load={{ status: 'ready', data: PREVIEW_PROFILE }} />));
    const dive = (d: ChDeepDive, v?: ChViewVoice) => nums(<DeepDive load={{ status: 'ready', data: d }} voice={v} initialId="in-pen" writes={okWrites()} />);
    expect(dive(PREVIEW_COACH_DIVE, voice)).toEqual(dive(PREVIEW_DIVE));
  });

  it('Why: an inferred cause reads "Likely, not measured" for the coach and "Not traced yet" for the player', () => {
    const { unmount } = render(wrap(<DeepDive load={{ status: 'ready', data: PREVIEW_COACH_DIVE }} voice={voice} initialId="in-slope" writes={okWrites()} />));
    const dos = () => document.querySelector('.ch-hd-dos') as HTMLElement;
    expect(dos().textContent).toMatch(/Likely, not measured/);
    expect(dos().textContent).not.toMatch(/Not traced yet/);
    unmount();
    render(wrap(<DeepDive load={{ status: 'ready', data: PREVIEW_DIVE }} initialId="in-slope" />));
    expect(dos().textContent).toMatch(/Not traced yet/);
    expect(dos().textContent).not.toMatch(/Likely, not measured/);
  });
});

describe('the action row on a coach’s Deep dive', () => {
  const showDive = (w: ChCoachHelmWrites, initialId: string, data: ChDeepDive = PREVIEW_COACH_DIVE) => render(wrap(<DeepDive load={{ status: 'ready', data }} voice={voice} initialId={initialId} writes={w} />));
  const dossier = () => document.querySelector('.ch-hd-dos') as HTMLElement;

  it('Assign on a read that is not the top one assigns that read, for this player, and marks it Assigned', async () => {
    const u = user();
    const w = okWrites();
    expect(PREVIEW_COACH_DIVE.list[0]!.base.id).not.toBe('in-brk');
    showDive(w, 'in-brk');
    await u.click(within(dossier()).getByRole('button', { name: 'Assign as focus' }));
    await waitFor(() => expect(code('CH-13601')).not.toBeNull());
    expect(w.assign).toHaveBeenCalledWith(expect.objectContaining({ playerId: 'pl-jonah', insightId: 'in-brk' }));
    expect(code('CH-13601')!.textContent).toMatch(/Assigned as Jonah’s focus/);
  });

  it('a player who already has a focus on the metric is the outcome wanted: assigned, said in a toast', async () => {
    const u = user();
    const w = okWrites();
    vi.mocked(w.assign).mockResolvedValueOnce({ success: false, error: ACTIVE_FOCUS_DUPLICATE_ERROR });
    showDive(w, 'in-brk');
    await u.click(within(dossier()).getByRole('button', { name: 'Assign as focus' }));
    expect(await screen.findByText('Jonah already has a focus on this')).toBeTruthy();
    expect(code('CH-13601')).not.toBeNull();
    expect(code('CH-13001')).toBeNull();
  });

  it('CH-13906 a read older than the newest round offers no Assign, and says why', () => {
    const data: ChDeepDive = { ...PREVIEW_COACH_DIVE, list: PREVIEW_COACH_DIVE.list.map((i) => (i.base.id === 'in-brk' ? { ...i, base: { ...i.base, stale: { newestRound: 'Oct 5' } } } : i)) };
    showDive(okWrites(), 'in-brk', data);
    expect(within(dossier()).queryByRole('button', { name: 'Assign as focus' })).toBeNull();
    expect(code('CH-13906')!.textContent).toMatch(/older than Jonah’s newest round/);
    expect(within(dossier()).getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('CH-13901 Dismiss is a notice with Undo, and Undo restores the read', async () => {
    const u = user();
    const w = okWrites();
    showDive(w, 'in-brk');
    await u.click(within(dossier()).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(code('CH-13901')).not.toBeNull());
    expect(w.dismiss).toHaveBeenCalledWith('in-brk');
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    expect(code('CH-13901')!.textContent).toMatch(/It no longer shows on the board or on Jonah’s\. Undo brings it back\./);
    await u.click(within(code('CH-13901') as HTMLElement).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(code('CH-13901')).toBeNull());
    expect(w.undo).toHaveBeenCalledWith('in-brk', expect.anything());
    expect(within(dossier()).getByRole('button', { name: 'Assign as focus' })).toBeTruthy();
  });

  it('Message Jonah is a quiet link to the coach’s messages with the player', () => {
    showDive(okWrites(), 'in-pen');
    expect(within(dossier()).getByRole('link', { name: 'Message Jonah' }).getAttribute('href')).toBe('/golf/dashboard/messages?player=pl-jonah');
  });
});

describe('every link in and out carries the player', () => {
  it('the board’s card: "All of Jonah’s reads" opens his Deep dive; a name with no insights opens their Standing', async () => {
    const u = user();
    render(wrap(<CoachBoard data={PREVIEW_HELM_COACH} writes={okWrites()} />));
    await u.click(screen.getAllByRole('button', { name: /Jonah Okafor/ })[0]!);
    expect(screen.getByRole('link', { name: /All of Jonah’s reads/ }).getAttribute('href')).toBe('/golf/dashboard/coachhelm?view=deep-dive&player=pl-jonah');
    expect(screen.getByRole('link', { name: 'Sam Whitfield' }).getAttribute('href')).toBe('/golf/dashboard/coachhelm?view=standing&player=pl-sam');
  });

  it('the header links back to the board open on the player; the strip moves between his three views', async () => {
    const u = user();
    render(wrap(<Standing load={{ status: 'ready', data: PREVIEW_COACH_STANDING }} voice={voice} />));
    expect(screen.getByRole('link', { name: 'CoachHelm' }).getAttribute('href')).toBe('/golf/dashboard/coachhelm?player=pl-jonah');
    const strip = screen.getByRole('radiogroup');
    expect(within(strip).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Deep dive', 'Standing', 'Game profile']);
    await u.click(within(strip).getByRole('radio', { name: 'Deep dive' }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/coachhelm?view=deep-dive&player=pl-jonah');
  });

  it('the phone’s Back goes to the board open on the player', async () => {
    phoneState.on = true;
    const u = user();
    render(wrap(<Profile load={{ status: 'ready', data: PREVIEW_COACH_PROFILE }} voice={voice} />));
    await u.click(screen.getByRole('button', { name: 'phone back to CoachHelm' }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/coachhelm?player=pl-jonah');
  });

  it('the Game profile’s line on what CoachHelm sees opens the Deep dive', () => {
    render(wrap(<Profile load={{ status: 'ready', data: PREVIEW_COACH_PROFILE }} voice={voice} />));
    const seen = screen.getByRole('link', { name: /CoachHelm sees 3 reads costing strokes and 1 working/ });
    expect(seen.getAttribute('href')).toBe('/golf/dashboard/coachhelm?view=deep-dive&player=pl-jonah');
  });

  it('an unknown ?insight= is ignored: the Deep dive opens on its first read, and says nothing went missing', () => {
    render(wrap(<DeepDive load={{ status: 'ready', data: PREVIEW_COACH_DIVE }} voice={voice} initialId="in-nope" writes={okWrites()} />));
    expect(document.querySelector('.ch-hd-dos h2')!.textContent).toBe(PREVIEW_COACH_DIVE.list[0]!.base.title);
    expect(code('CH-13910')).toBeNull();
  });
});

describe('the coach header', () => {
  const NOW = new Date('2026-10-21T15:00:00Z');

  it('the class and the newest round: "Junior · Last round Oct 5, 16 days ago"', () => {
    expect(coachHeadLine('Junior', '2026-10-05', NOW)).toBe('Junior · Last round Oct 5, 16 days ago');
    expect(coachHeadLine('Junior', null, NOW)).toBe('Junior · No rounds posted yet');
    expect(coachHeadLine(null, null, NOW)).toBe('No rounds posted yet');
    expect(coachHeadLine(null, '2026-10-20', NOW)).toBe('Last round yesterday');
    expect(coachHeadLine('Senior', '2025-12-01', NOW)).toBe('Senior · Last round Dec 1, 2025, 324 days ago');
  });

  it('draws the name as the title, the eyebrow, and the line; "Player" for a player with no name', async () => {
    render(wrap(<Standing load={{ status: 'ready', data: PREVIEW_COACH_STANDING }} voice={{ ...voice, line: 'Junior · Last round Oct 5, 16 days ago' }} />));
    const head = document.querySelector('.ch-hl-h') as HTMLElement;
    expect(within(head).getByRole('heading', { level: 1 }).textContent).toBe('Jonah Okafor');
    expect(head.textContent).toMatch(/CoachHelm/);
    expect(head.textContent).toMatch(/Junior · Last round Oct 5, 16 days ago/);
    cleanup();
    render(wrap(<Standing load={{ status: 'ready', data: PREVIEW_COACH_STANDING }} voice={{ ...voice, name: 'Player', first: 'Player', line: 'No rounds posted yet' }} />));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Player');
    expect(document.querySelector('.ch-hl-h')!.textContent).toMatch(/No rounds posted yet/);
  });

  it('the route draws the header from the scope: name, class and the newest round', async () => {
    standingRead.load.mockResolvedValue(new Map(STANDING_ROWS.map((r) => [r.metric_id, { ...r, player_id: PID }])));
    render(wrap(await page({ view: 'standing', player: PID })));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Jonah Okafor');
    expect(document.querySelector('.ch-hl-h')!.textContent).toMatch(/Junior · Last round Oct 5, \d+ days ago/);
  });
});

describe('Standing: "Open the read" only where an open read shares the stat', () => {
  it('each link opens the Deep dive on the read for that stat, and no other stat has one', () => {
    const { container } = render(wrap(<Standing load={{ status: 'ready', data: PREVIEW_COACH_STANDING }} voice={voice} />));
    const links = screen.getAllByRole('link', { name: 'Open the read' });
    expect(links.length).toBeGreaterThan(0);
    const reads = PREVIEW_COACH_STANDING.reads!;
    for (const a of links) {
      const insight = new URL(a.getAttribute('href')!, 'https://x').searchParams.get('insight');
      expect(Object.values(reads)).toContain(insight);
      expect(a.getAttribute('href')).toMatch(/^\/golf\/dashboard\/coachhelm\?view=deep-dive&player=pl-jonah&insight=/);
    }
    // Only the rows of the stats that carry a read have one.
    const rows = [...container.querySelectorAll('.ch-hs-read')];
    expect(rows.length).toBe(Object.keys(reads).filter((m) => PREVIEW_COACH_STANDING.groups.some((g) => g.rows.some((r) => r.id === m))).length);
  });

  it('the player’s own Standing has none', () => {
    render(wrap(<Standing load={{ status: 'ready', data: { ...PREVIEW_STANDING, reads: PREVIEW_COACH_STANDING.reads } }} />));
    expect(screen.queryByRole('link', { name: 'Open the read' })).toBeNull();
  });
});
