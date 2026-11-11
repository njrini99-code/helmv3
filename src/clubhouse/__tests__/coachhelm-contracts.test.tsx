import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readWaves } from './read-waves';

/**
 * CoachHelm (P013), the numbered contracts in docs/clubhouse/pages/P013-coachhelm/CONTRACT.md that no test named: the player
 * drills' addresses, the gate lookup, offline writes, what a visit keeps, no background refresh, the phone layout, the order the
 * loaders read in, and what is reported when something fails. Each test names its Bridge ID. The server actions' own refusals
 * (130804) are in coachhelm-actions-contracts.test.ts.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
const track = vi.hoisted(() => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../lib/track', () => track);
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/golf/dashboard/coachhelm',
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables, gate: undefined as ((t: string) => Promise<void>) | undefined }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
vi.mock('@/app/golf/actions/development', () => ({ createFocusAreaFromInsightV2: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({ getInsightsForPlayer: vi.fn(), getTopInsightsForPlayers: vi.fn() }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForPlayer: vi.fn(), isCoachHelmEnabledForCoach: vi.fn() }));
vi.mock('@/lib/golf/player-signal-settings', () => ({ getPlayerSignalSettings: vi.fn(async () => ({ minHolePlaysForRanking: 3, patternLookbackDays: 90, statsBenchmarkWindowDays: 30, minRoundsForSignal: 5 })) }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachProgramPulse: vi.fn(), getCoachChatContext: async () => ({ roster: [] }) }));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: () => Promise.resolve(session.current) }));
const teamOf = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: () => Promise.resolve(teamOf.current) }));

import { getInsightsForPlayer, getTopInsightsForPlayers } from '@/app/golf/actions/insight-delivery';
import { isCoachHelmEnabledForCoach, isCoachHelmEnabledForPlayer } from '@/lib/coachhelm/v2/gate';
import { getCoachProgramPulse } from '@/lib/coachhelm/v3/chat/request-cache';
import { loadCoachCoachHelm, loadPlayerCoachHelm } from '../data/coachhelm';
import { RouteScope } from '../lib/session-state';
import { PLAYER_HELM_DEVELOPMENT_HREF, playerHelmDrill } from '../data/coachhelm-views-shape';
import { ClubhouseCoachHelmRoute } from '../routes/coachhelm';
import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import { Standing } from '../screens/coachhelm/views/Standing';
import { DeepDive } from '../screens/coachhelm/views/DeepDive';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import { bigNumber, HELM_PLAYERS, PREVIEW_HELM_PLAYER, penalties, slope } from '../preview/fixtures-coachhelm';
import { diveLoad, gameLoad, PREVIEW_DIVE, PREVIEW_GAME, PREVIEW_STANDING, standingLoad } from '../preview/fixtures-coachhelm-views';

const on = { userEnabled: true, teamEnabled: true, effectivelyEnabled: true, disabledReason: null, disabledBy: null } as const;
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
/** The page's route and team, as the shell frames it (`RouteFrame`): what a screen's kept state is stored under. */
const SCOPE = '/golf/dashboard/coachhelm\u0000team-1';
const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <RouteScope value={SCOPE}>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </RouteScope>
    </ToastProvider>
  </LazyMotion>
);

/** Browser says offline (or back online), for the length of one test. */
function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}
/** The phone breakpoint on or off. */
function phoneWidth(phone: boolean) {
  const real = window.matchMedia;
  window.matchMedia = ((q: string) => ({ ...real(q), matches: phone && q === '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = real;
  };
}

beforeEach(() => {
  sessionStorage.clear();
  hapticSpy.mockClear();
  router.refresh.mockClear();
  logServer.mockClear();
  track.chReport.mockClear();
  track.chTrail.mockClear();
  vi.mocked(getInsightsForPlayer).mockReset();
  vi.mocked(getTopInsightsForPlayers).mockReset();
  vi.mocked(isCoachHelmEnabledForPlayer).mockReset();
  vi.mocked(isCoachHelmEnabledForCoach).mockReset();
  vi.mocked(getCoachProgramPulse).mockReset();
});
afterEach(() => {
  cleanup();
  setOnline(true);
  tables.current = {};
  tables.gate = undefined;
  session.current = null;
  teamOf.current = null;
});

// ── 130104: the Fairway drills' addresses land on screens that exist ───────

describe('130104 the Fairway drills’ addresses (?view=) land on a screen that exists', () => {
  type Gated = ReactElement<{ fallback: ReactElement; children: ReactElement<{ playerId: string; drill: string | null }> }>;
  const asPlayer = () => {
    session.current = { userId: 'u2', role: 'player', coach: null, player: { id: 'pl-jonah' } };
  };

  it('130104 ?view=development redirects to Stats’ Development tab, the address every stored dev-plan notification carries', async () => {
    asPlayer();
    expect(PLAYER_HELM_DEVELOPMENT_HREF).toBe('/golf/dashboard/stats?tab=dev');
    await expect(ClubhouseCoachHelmRoute({ view: 'development' })).rejects.toThrow('redirect:/golf/dashboard/stats?tab=dev');
  });

  it('130104 ?view=standing and deep-dive (and profile, Standing at How you play) are the signed-in player’s own: the id comes from the session, never from the address', async () => {
    asPlayer();
    for (const [view, drill, at] of [['profile', 'standing', 'game'], ['standing', 'standing', undefined], ['deep-dive', 'deep-dive', undefined]] as const) {
      const el = (await ClubhouseCoachHelmRoute({ view, player: 'pl-someone-else' })) as Gated;
      expect(el.type).toBe(Suspense);
      expect(el.props.children.props).toEqual({ playerId: 'pl-jonah', drill, at });
    }
  });

  it('130104 ?view=insights, no view and any other value draw the board', async () => {
    asPlayer();
    for (const view of ['insights', undefined, '', 'nope', 'PROFILE']) {
      expect(playerHelmDrill(view)).toBeNull();
      const el = (await ClubhouseCoachHelmRoute({ view })) as Gated;
      expect(el.props.children.props).toEqual({ playerId: 'pl-jonah', drill: null, at: undefined });
    }
  });

  it('130104 a coach’s ?view=profile, standing or deep-dive is their own board, and no coach is handed a player’s view', async () => {
    session.current = { userId: 'u1', role: 'coach', coach: { id: 'c1', organization_id: 'org1' }, player: null };
    teamOf.current = { role: 'coach', teamId: 't1', coachId: 'c1' };
    for (const view of ['profile', 'standing', 'deep-dive']) {
      const el = (await ClubhouseCoachHelmRoute({ view })) as ReactElement<{ children: ReactElement<{ coachId: string; teamId: string; ask: boolean }> }>;
      expect(el.props.children.props).toMatchObject({ coachId: 'c1', teamId: 't1', ask: false });
      expect(el.props.children.props).not.toHaveProperty('drill');
    }
  });

  it('130104 none of the views says it has not been rebuilt', () => {
    for (const node of [<Standing key="s" load={standingLoad(PREVIEW_STANDING)} game={gameLoad(PREVIEW_GAME)} />, <DeepDive key="d" load={diveLoad(PREVIEW_DIVE)} initialId={null} />]) {
      const { unmount } = render(wrap(node));
      expect(document.body.textContent).not.toMatch(/rebuilt|not built yet|coming soon/i);
      expect(screen.getByRole('main')).toBeTruthy();
      unmount();
    }
  });
});

// ── 130608: a gate lookup that failed is a failed read, not "off" ──────────

describe('130608 a failed gate lookup is a failed read, not off', () => {
  const p1 = 'pl-jonah';

  it('130608 the player: a gate whose reason says the lookup failed, or one that throws, is "Your insights didn’t load" and is logged as gate, and nothing else is read', async () => {
    vi.mocked(isCoachHelmEnabledForPlayer).mockResolvedValueOnce({ ...on, effectivelyEnabled: false, disabledBy: null, disabledReason: 'Player record lookup failed' });
    const failed = await loadPlayerCoachHelm({ playerId: p1 });
    expect(failed).toMatchObject({ off: null, insights: { list: [], error: true } });
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'gate', expect.anything(), 'coachhelm');
    logServer.mockClear();
    vi.mocked(isCoachHelmEnabledForPlayer).mockRejectedValueOnce(new Error('gate down'));
    expect((await loadPlayerCoachHelm({ playerId: p1 })).insights.error).toBe(true);
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'gate', expect.anything(), 'coachhelm');
    expect(getInsightsForPlayer).not.toHaveBeenCalled();
    cleanup();
    render(wrap(<PlayerBoard data={failed} />));
    expect(code('CH-13201')!.textContent).toMatch(/Your insights didn’t load/);
    expect(code('CH-13304')).toBeNull();
  });

  it('130608 the gate is asked first: a gate that says off reads nothing, and a global switch is off, not a failure', async () => {
    vi.mocked(isCoachHelmEnabledForPlayer).mockResolvedValueOnce({ ...on, effectivelyEnabled: false, disabledBy: null, disabledReason: 'CoachHelm is disabled globally' });
    const d = await loadPlayerCoachHelm({ playerId: p1 });
    expect(d.off).toEqual({ reason: null });
    expect(d.insights.error).toBe(false);
    expect(logServer).not.toHaveBeenCalledWith('coachhelm', 'gate', expect.anything(), 'coachhelm');
  });
});

// ── 131901: the phone layout ───────────────────────────────────────────────

describe('131901 at 820px and below CoachHelm is the phone build, not a shrunken desktop', () => {
  /** The shell's phone top bar, where the page's PhoneTop renders. */
  function SlotHost() {
    const { setSlot } = usePhoneChromeState();
    return <div ref={setSlot} data-testid="phone-top" />;
  }
  const inFrame = (node: React.ReactNode) =>
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <PhoneChromeProvider>
            <div className="ch-root" data-ui="clubhouse">
              <SlotHost />
              {node}
            </div>
          </PhoneChromeProvider>
        </ToastProvider>
      </LazyMotion>,
    );

  it('131901 the player: the same, and the boards, writes and states are the desktop’s', () => {
    const restore = phoneWidth(true);
    try {
      inFrame(<PlayerBoard data={PREVIEW_HELM_PLAYER} />);
      expect(document.querySelector('.ch-hl.is-phone')).not.toBeNull();
      expect(within(screen.getByTestId('phone-top')).getByRole('heading', { level: 1, name: 'CoachHelm' })).toBeTruthy();
      expect(document.querySelector('.ch-hl-focus')).not.toBeNull();
    } finally {
      restore();
    }
  });

  it('131901 choosing an insight on the player’s phone brings the focus into view; on a wider screen the page stays where it is', async () => {
    const u = userEvent.setup();
    const scroll = vi.fn();
    const real = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll as never;
    try {
      const restore = phoneWidth(true);
      render(wrap(<PlayerBoard data={PREVIEW_HELM_PLAYER} />));
      await u.click(within(screen.getByRole('region', { name: 'What’s working' })).getAllByRole('button')[0]!);
      expect(scroll).toHaveBeenCalledWith({ block: 'start' });
      restore();
      cleanup();
      sessionStorage.clear();
      scroll.mockClear();
      render(wrap(<PlayerBoard data={PREVIEW_HELM_PLAYER} />));
      await u.click(within(screen.getByRole('region', { name: 'What’s working' })).getAllByRole('button')[0]!);
      expect(scroll).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = real;
    }
  });
});

// ── 132101: the loaders read in rounds ─────────────────────────────────────

describe('132101 the loaders read on the server in a few rounds, never per row', () => {
  const jonah = HELM_PLAYERS.jonah;
  const eli = HELM_PLAYERS.eli;
  const flat = (waves: string[][]) => waves.flat();
  const at = (waves: string[][], name: string) => waves.findIndex((w) => w.includes(name));

  function arrangeCoach(waves: ReturnType<typeof readWaves>) {
    tables.gate = waves.gate;
    vi.mocked(isCoachHelmEnabledForCoach).mockImplementation(async () => {
      await waves.gate('gate');
      return { ...on };
    });
    vi.mocked(getCoachProgramPulse).mockImplementation(async () => {
      await waves.gate('pulse');
      return { items: [], latest_round_at: null, players_without_rounds: 0, players_with_recent_rounds: 2, recent_window_days: 30, active_roster: 2, as_of: '2026-10-14T12:00:00Z' };
    });
    vi.mocked(getTopInsightsForPlayers).mockImplementation(async () => {
      await waves.gate('heads');
      return new Map([
        [jonah.id, [slope(jonah.id)]],
        [eli.id, [penalties(eli.id, 'in-pen-eli')]],
      ]);
    });
    tables.current = {
      golf_team_members: { data: [{ player_id: jonah.id }, { player_id: eli.id }] },
      golf_players: {
        data: [
          { id: jonah.id, first_name: 'Jonah', last_name: 'Okafor' },
          { id: eli.id, first_name: 'Eli', last_name: 'Brandt' },
        ],
      },
      golf_coach_insights: { data: [slope(jonah.id), penalties(eli.id, 'in-pen-eli')] },
      golf_teams: { data: { gender: 'mens' } },
      golf_pga_standards: { data: [] },
      golf_drills: { data: [] },
      golf_player_focus_areas: { data: [] },
      golf_rounds: { data: [] },
    };
  }

  it('132101 the coach: the gate first; then the roster, then the players’ names; then the visible insights and each player’s top insight together; then the drills and focus areas together', async () => {
    const waves = readWaves();
    arrangeCoach(waves);
    const { result, waves: depth } = await waves.run(loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' }));
    expect(result.players.list).toHaveLength(2);
    expect(depth[0]).toEqual(['gate']);
    expect(at(depth, 'golf_team_members')).toBe(1);
    expect(at(depth, 'golf_players')).toBeGreaterThan(at(depth, 'golf_team_members'));
    // The visible insights and the heads are one round.
    expect(at(depth, 'heads')).toBe(at(depth, 'golf_coach_insights'));
    expect(at(depth, 'heads')).toBeGreaterThan(at(depth, 'golf_players'));
    // The drills and the focus areas wait for the heads, and share a round.
    expect(at(depth, 'golf_drills')).toBeGreaterThan(at(depth, 'heads'));
    expect(at(depth, 'golf_player_focus_areas')).toBe(at(depth, 'golf_drills'));
    // The pulse starts beside the roster, not after it.
    expect(at(depth, 'pulse')).toBe(at(depth, 'golf_team_members'));
  });

  it('132101 the coach: one request per kind, however many players (never one per row)', async () => {
    const waves = readWaves();
    arrangeCoach(waves);
    const { waves: depth } = await waves.run(loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' }));
    const reads = flat(depth);
    for (const table of ['golf_team_members', 'golf_players', 'golf_coach_insights', 'golf_drills']) expect(reads.filter((r) => r === table)).toHaveLength(1);
    // The assigned and the declined reads are both the focus areas' table, once each.
    expect(reads.filter((r) => r === 'golf_player_focus_areas')).toHaveLength(2);
    expect(getTopInsightsForPlayers).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getTopInsightsForPlayers).mock.calls[0]![0]).toHaveLength(2);
  });

  it('132101 the player: the gate, then the feed (the team beside it), then the drills, proposals and focus areas together; the dismissal and visible reads are not made when the feed has insights', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    vi.mocked(isCoachHelmEnabledForPlayer).mockImplementation(async () => {
      await waves.gate('gate');
      return { ...on };
    });
    vi.mocked(getInsightsForPlayer).mockImplementation(async () => {
      await waves.gate('feed');
      return [slope(jonah.id), bigNumber(jonah.id, 'in-dbl')];
    });
    tables.current = {
      golf_team_members: { data: { team_id: 't1', golf_teams: { gender: 'mens' } } },
      golf_pga_standards: { data: [] },
      golf_drills: { data: [] },
      golf_player_focus_areas: { data: [] },
      golf_rounds: { data: [] },
      golf_coach_insights: { data: [] },
      golf_insight_player_feedback: { data: [] },
    };
    const { result, waves: depth } = await waves.run(loadPlayerCoachHelm({ playerId: jonah.id }));
    expect(result.insights.list.length).toBeGreaterThan(0);
    expect(depth[0]).toEqual(['gate']);
    expect(depth[1]).toEqual(expect.arrayContaining(['feed', 'golf_team_members']));
    expect(at(depth, 'golf_drills')).toBeGreaterThan(at(depth, 'feed'));
    expect(at(depth, 'golf_player_focus_areas')).toBe(at(depth, 'golf_drills'));
    expect(flat(depth)).not.toContain('golf_insight_player_feedback');
    expect(flat(depth)).not.toContain('golf_coach_insights');
  });

  it('132101 the player: an empty feed is the only time the dismissal and visible reads are made, and they go together', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    vi.mocked(isCoachHelmEnabledForPlayer).mockResolvedValue({ ...on });
    vi.mocked(getInsightsForPlayer).mockImplementation(async () => {
      await waves.gate('feed');
      return [];
    });
    tables.current = {
      golf_team_members: { data: { team_id: 't1', golf_teams: { gender: 'mens' } } },
      golf_pga_standards: { data: [] },
      golf_player_focus_areas: { data: [] },
      golf_rounds: { data: [] },
      golf_coach_insights: { data: [] },
      golf_insight_player_feedback: { data: [] },
    };
    const { result, waves: depth } = await waves.run(loadPlayerCoachHelm({ playerId: jonah.id }));
    expect(result.insights).toEqual({ list: [], error: false });
    expect(at(depth, 'golf_coach_insights')).toBe(at(depth, 'golf_insight_player_feedback'));
    expect(at(depth, 'golf_coach_insights')).toBeGreaterThan(at(depth, 'feed'));
  });
});

// ── 132301: failures are reported ──────────────────────────────────────────

describe('132301 a failed read or write is reported under the coachhelm feature, and named on the page', () => {
  const jonah = HELM_PLAYERS.jonah;
  const eli = HELM_PLAYERS.eli;
  const reported = (read: string) => expect(logServer).toHaveBeenCalledWith('coachhelm', read, expect.anything(), 'coachhelm');

  describe('the player’s loader logs each read that fails, by name', () => {
    beforeEach(() => {
      vi.mocked(isCoachHelmEnabledForPlayer).mockResolvedValue({ ...on });
    });

    it('132301 gate, feed and drills', async () => {
      vi.mocked(isCoachHelmEnabledForPlayer).mockRejectedValueOnce(new Error('boom'));
      await loadPlayerCoachHelm({ playerId: jonah.id });
      reported('gate');
      vi.mocked(getInsightsForPlayer).mockRejectedValueOnce(new Error('boom'));
      await loadPlayerCoachHelm({ playerId: jonah.id });
      reported('feed');
      logServer.mockClear();
      vi.mocked(getInsightsForPlayer).mockResolvedValue([slope(jonah.id)]);
      tables.current = { golf_drills: { error: { message: 'boom' } } };
      await loadPlayerCoachHelm({ playerId: jonah.id });
      reported('drills');
    });

    it('132301 visible, dismissed and rounds (read when the feed is empty)', async () => {
      vi.mocked(getInsightsForPlayer).mockResolvedValue([]);
      tables.current = { golf_coach_insights: { error: { message: 'boom' } }, golf_insight_player_feedback: { data: [] } };
      await loadPlayerCoachHelm({ playerId: jonah.id });
      reported('visible');
      logServer.mockClear();
      tables.current = { golf_coach_insights: { data: [] }, golf_insight_player_feedback: { error: { message: 'boom' } } };
      await loadPlayerCoachHelm({ playerId: jonah.id });
      reported('dismissed');
      logServer.mockClear();
      tables.current = { golf_coach_insights: { data: [] }, golf_insight_player_feedback: { data: [] }, golf_rounds: { error: { message: 'boom' } } };
      await loadPlayerCoachHelm({ playerId: jonah.id });
      reported('rounds');
    });
  });

  describe('the coach’s loader logs each read that fails, by name', () => {
    beforeEach(() => {
      vi.mocked(isCoachHelmEnabledForCoach).mockResolvedValue({ ...on });
      vi.mocked(getTopInsightsForPlayers).mockResolvedValue(new Map([[eli.id, [penalties(eli.id, 'in-pen-eli')]]]));
      vi.mocked(getCoachProgramPulse).mockResolvedValue(null);
      tables.current = {
        golf_team_members: { data: [{ player_id: eli.id }] },
        golf_players: { data: [{ id: eli.id, first_name: 'Eli', last_name: 'Brandt' }] },
        golf_coach_insights: { data: [penalties(eli.id, 'in-pen-eli')] },
        golf_drills: { data: [] },
        golf_player_focus_areas: { data: [] },
      };
    });

    it('132301 roster and players', async () => {
      tables.current = { ...tables.current, golf_team_members: { error: { message: 'boom' } } };
      await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
      reported('roster');
      logServer.mockClear();
      tables.current = { ...tables.current, golf_team_members: { data: [{ player_id: eli.id }] }, golf_players: { error: { message: 'boom' } } };
      await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
      reported('players');
    });

    it('132301 heads, assigned and drills', async () => {
      vi.mocked(getTopInsightsForPlayers).mockRejectedValueOnce(new Error('boom'));
      await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
      reported('heads');
      logServer.mockClear();
      // The slope read carries a drill, so the drills are read for it.
      vi.mocked(getTopInsightsForPlayers).mockResolvedValue(new Map([[eli.id, [slope(eli.id)]]]));
      tables.current = { ...tables.current, golf_player_focus_areas: { error: { message: 'boom' } }, golf_drills: { error: { message: 'boom' } } };
      await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
      reported('assigned');
      reported('drills');
    });
  });
});
