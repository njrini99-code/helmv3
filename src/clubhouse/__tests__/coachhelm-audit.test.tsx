import { LazyMotion, domAnimation } from 'framer-motion';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { cleanup, render, screen, within } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The CoachHelm audit's code fixes (swap audit section 13), through the loaders, the route and the screens. */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm' }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
vi.mock('@/app/golf/actions/development', () => ({ createFocusAreaFromInsightV2: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({ getInsightsForPlayer: vi.fn(), getTopInsightsForPlayers: vi.fn() }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForPlayer: vi.fn(), isCoachHelmEnabledForCoach: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachProgramPulse: vi.fn() }));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: () => Promise.resolve(session.current) }));
const teamOf = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: () => Promise.resolve(teamOf.current) }));
vi.mock('../data/coachhelm-chat', () => ({ loadAskCoachHelm: vi.fn(async () => ({ status: 'noRoster', teamName: 'Finley University' })) }));
vi.mock('../screens/coachhelm/chat/Ask', () => ({ Ask: ({ load }: { load: { status: string } }) => <div data-testid="ask" data-status={load.status} /> }));

import { getInsightsForPlayer, getTopInsightsForPlayers } from '@/app/golf/actions/insight-delivery';
import { isCoachHelmEnabledForCoach, isCoachHelmEnabledForPlayer } from '@/lib/coachhelm/v2/gate';
import { getCoachProgramPulse } from '@/lib/coachhelm/v3/chat/request-cache';
import { emptyCoachHelm, loadCoachCoachHelm, loadCoachHelmGate, loadPlayerCoachHelm } from '../data/coachhelm';
import { loadAskCoachHelm } from '../data/coachhelm-chat';
import { toChInsight } from '../data/coachhelm-map';
import type { ChCoachHelmData, ChInsight, ChPlayerHelm } from '../data/coachhelm-shape';
import { ClubhouseCoachHelmRoute } from '../routes/coachhelm';
import { CoachBoard } from '../screens/coachhelm/CoachBoard';
import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import { bigNumber, breakBias, HELM_PLAYERS, parType, penalties, PREVIEW_TOUR, puttBalanced, slope, teeInconclusive } from '../preview/fixtures-coachhelm';
import { ToastProvider } from '../ui/Toast';

const jonah = HELM_PLAYERS.jonah;
const eli = HELM_PLAYERS.eli;
const on = { userEnabled: true, teamEnabled: true, effectivelyEnabled: true, disabledReason: null, disabledBy: null } as const;
type Filters = Array<[string, unknown[]]>;
const filter = (f: Filters, key: string, col: string) => f.find(([k, a]) => k === key && a[0] === col)?.[1][1];

const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const refreshedOn = (i: EvidenceInsight, iso: string): EvidenceInsight => ({ ...i, metadata: { last_refreshed_at: iso } });
const countable = (player_id: string, round_date: string, id = `r-${round_date}`) => ({ id, player_id, round_date, total_score: 80, front_nine: 40, back_nine: 40, holes_played: 18, total_putts: 31 });

beforeEach(() => {
  logServer.mockClear();
  router.refresh.mockClear();
  vi.mocked(getInsightsForPlayer).mockReset();
  vi.mocked(getTopInsightsForPlayers).mockReset();
  vi.mocked(isCoachHelmEnabledForPlayer).mockReset();
  vi.mocked(isCoachHelmEnabledForCoach).mockReset();
  vi.mocked(getCoachProgramPulse).mockReset();
  vi.mocked(loadAskCoachHelm).mockClear();
});
afterEach(() => {
  cleanup();
  tables.current = {};
  session.current = null;
  teamOf.current = null;
});

// ── The player's loader ────────────────────────────────────────────────────

describe('the player’s board, loaded', () => {
  const p1 = jonah.id;
  beforeEach(() => {
    vi.mocked(isCoachHelmEnabledForPlayer).mockResolvedValue({ ...on });
    tables.current = { golf_team_members: { data: null }, golf_drills: { data: [] }, golf_player_focus_areas: { data: [] }, golf_rounds: { data: [] } };
  });

  it('CH13-11 a card that states no finding is not on the player’s board', async () => {
    vi.mocked(getInsightsForPlayer).mockResolvedValue([teeInconclusive(p1), parType(p1), puttBalanced(p1), slope(p1)]);
    const d = await loadPlayerCoachHelm({ playerId: p1 });
    expect(d.insights.list.map((i) => i.id)).toEqual(['in-slope']);
  });

  it('CH13-11 only notes: the first-run page (rounds counted), not an error and not a blank board', async () => {
    vi.mocked(getInsightsForPlayer).mockResolvedValue([teeInconclusive(p1), parType(p1)]);
    tables.current = { ...tables.current, golf_rounds: { data: [countable(p1, '2026-09-30'), countable(p1, '2026-09-28')] } };
    const d = await loadPlayerCoachHelm({ playerId: p1 });
    expect(d.insights).toEqual({ list: [], error: false });
    expect(d.rounds).toBe(2);
  });

  it('CH13-13 the text is the player’s own: the coach’s "have the player" is gone from the card, the reasoning and This week', async () => {
    const approach = { ...slope(p1), content: "Across your last 55 approaches you found the green 73%. Recommended: have the player log club and pin position for the next ten approaches." };
    vi.mocked(getInsightsForPlayer).mockResolvedValue([approach]);
    tables.current = { ...tables.current, golf_drills: { data: [{ id: 'dr-ladder', description: 'Have the player start 2 ft below the hole.' }] } };
    const d = await loadPlayerCoachHelm({ playerId: p1 });
    const i = d.insights.list[0]!;
    expect(i.lede).toBe('Across your last 55 approaches you found the green 73%.');
    expect(i.why).toBe('Recommended: log club and pin position for the next ten approaches.');
    expect(i.week?.text).toBe('Start 2 ft below the hole.');
    expect(JSON.stringify(i)).not.toMatch(/the player/i);
  });

  it('CH13-3 a read from before the newest completed round is marked out of date, from that round’s day; one refreshed after it is not', async () => {
    const old = refreshedOn(slope(p1), '2026-09-28T02:30:43Z');
    const fresh = refreshedOn(penalties(p1), '2026-09-30T02:30:43Z');
    vi.mocked(getInsightsForPlayer).mockResolvedValue([old, fresh]);
    const seen: Filters[] = [];
    tables.current = {
      ...tables.current,
      golf_rounds: (f) => {
        seen.push(f);
        return { data: [countable(p1, '2026-09-30'), countable(p1, '2026-09-29')] };
      },
    };
    const d = await loadPlayerCoachHelm({ playerId: p1 });
    expect(d.insights.list.find((i) => i.id === 'in-slope')!.stale).toEqual({ newestRound: 'Sep 30' });
    expect(d.insights.list.find((i) => i.id === 'in-pen')!.stale).toBeNull();
    // The rounds read is the player's own completed rounds, from the earliest day that could matter, and writes nothing.
    expect(filter(seen[0]!, 'in', 'player_id')).toEqual([p1]);
    expect(filter(seen[0]!, 'eq', 'status')).toBe('completed');
    expect(filter(seen[0]!, 'eq', 'is_test')).toBe(false);
    expect(filter(seen[0]!, 'gte', 'round_date')).toBe('2026-09-28');
  });

  it('CH13-3 a round that is not countable does not make a read out of date', async () => {
    vi.mocked(getInsightsForPlayer).mockResolvedValue([refreshedOn(slope(p1), '2026-09-28T02:30:43Z')]);
    tables.current = { ...tables.current, golf_rounds: { data: [{ ...countable(p1, '2026-09-30'), front_nine: null, back_nine: null }] } };
    expect((await loadPlayerCoachHelm({ playerId: p1 })).insights.list[0]!.stale).toBeNull();
  });

  it('CH13-3 a rounds read that fails is logged and leaves the reads as they are: it is never a failed page', async () => {
    vi.mocked(getInsightsForPlayer).mockResolvedValue([refreshedOn(slope(p1), '2026-09-28T02:30:43Z')]);
    tables.current = { ...tables.current, golf_rounds: { error: { message: 'boom' } } };
    const d = await loadPlayerCoachHelm({ playerId: p1 });
    expect(d.insights.error).toBe(false);
    expect(d.insights.list[0]!.stale).toBeNull();
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'newestRounds', expect.anything(), 'coachhelm');
  });

  it('CH13-3 reads that say neither when they were refreshed nor where their window ended cost no rounds read', async () => {
    vi.mocked(getInsightsForPlayer).mockResolvedValue([slope(p1)]);
    let read = false;
    tables.current = {
      ...tables.current,
      golf_rounds: () => {
        read = true;
        return { data: [] };
      },
    };
    await loadPlayerCoachHelm({ playerId: p1 });
    expect(read).toBe(false);
  });

  it('CH13-16 an insight a focus area was made from reads as assigned on the player’s board too', async () => {
    vi.mocked(getInsightsForPlayer).mockResolvedValue([slope(p1), penalties(p1)]);
    tables.current = { ...tables.current, golf_player_focus_areas: { data: [{ from_insight_id: 'in-slope', status: 'proposed' }] } };
    const d = await loadPlayerCoachHelm({ playerId: p1 });
    expect(d.insights.list.map((i) => [i.id, i.assigned])).toEqual([
      ['in-slope', 'proposed'],
      ['in-pen', null],
    ]);
  });
});

// ── The coach's loader ─────────────────────────────────────────────────────

describe('the coach’s board, loaded', () => {
  const members = { data: [{ player_id: jonah.id }, { player_id: eli.id }] };
  const people = {
    data: [
      { id: eli.id, first_name: 'Eli', last_name: 'Brandt' },
      { id: jonah.id, first_name: 'Jonah', last_name: 'Okafor' },
    ],
  };
  const heads = (m: Array<[string, EvidenceInsight]>) => vi.mocked(getTopInsightsForPlayers).mockResolvedValue(new Map(m.map(([id, i]) => [id, [i]])));
  const load = (visible: EvidenceInsight[], extra: import('./supabase-fake').ChFakeTables = {}) => {
    tables.current = { golf_team_members: members, golf_players: people, golf_coach_insights: { data: visible }, golf_drills: { data: [] }, golf_player_focus_areas: { data: [] }, golf_rounds: { data: [] }, ...extra };
    return loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
  };
  beforeEach(() => {
    vi.mocked(isCoachHelmEnabledForCoach).mockResolvedValue({ ...on });
    vi.mocked(getCoachProgramPulse).mockResolvedValue({ items: [], latest_round_at: null, players_without_rounds: 0, players_with_recent_rounds: 0, recent_window_days: 30, active_roster: 2, as_of: '2026-10-14T12:00:00Z' });
  });

  it('CH13-4 a strength, a note and a stale read are not open signals; a player with nothing but those has none, not one', async () => {
    heads([
      [jonah.id, slope(jonah.id)],
      [eli.id, bigNumber(eli.id, 'in-dbl-eli')],
    ]);
    // Jonah: the slope finding, a strength, two notes. Eli: a strength and a note.
    const d = await load(
      [slope(jonah.id), bigNumber(jonah.id, 'in-dbl'), teeInconclusive(jonah.id), parType(jonah.id), bigNumber(eli.id, 'in-dbl-eli'), puttBalanced(eli.id)],
      { golf_teams: { data: { gender: 'mens' } }, golf_pga_standards: { data: [{ metric_id: 'big_number_rate', pga_tour_value: 2 }] } },
    );
    expect(d.players.list.map((p) => [p.name, p.top.kind, p.count])).toEqual([
      ['Jonah Okafor', 'finding', 1],
      ['Eli Brandt', 'strength', 0],
    ]);
  });

  it('CH13-4 a player’s findings are counted as the board would draw them: the Tour value, not the college cohort, decides a strength', async () => {
    heads([[jonah.id, penalties(jonah.id)]]);
    const rows = [penalties(jonah.id), bigNumber(jonah.id, 'in-dbl')];
    // Without a Tour value for big_number_rate the college comparison says nothing, so it is a finding; with one (2%, and 1.6% is under it) it is working.
    expect((await load(rows, { golf_teams: { data: { gender: 'mens' } } })).players.list[0]!.count).toBe(2);
    const withTour = await load(rows, { golf_teams: { data: { gender: 'mens' } }, golf_pga_standards: { data: [{ metric_id: 'big_number_rate', pga_tour_value: 2 }] } });
    expect(withTour.players.list[0]!.count).toBe(1);
  });

  it('CH13-11 a player whose top card states no finding is still listed, as a note, last, with no open signal', async () => {
    heads([
      [jonah.id, teeInconclusive(jonah.id)],
      [eli.id, slope(eli.id)],
    ]);
    const d = await load([teeInconclusive(jonah.id), slope(eli.id)]);
    expect(d.players.list.map((p) => [p.name, p.top.kind, p.count])).toEqual([
      ['Eli Brandt', 'finding', 1],
      ['Jonah Okafor', 'note', 0],
    ]);
    expect(d.withoutSignals).toBe(0);
  });

  it('CH13-3 a top read from before the player’s newest round is marked, does not count, and the rounds are read from the earliest day that could matter', async () => {
    const stale = refreshedOn(slope(jonah.id), '2026-09-28T02:30:43Z');
    heads([
      [jonah.id, stale],
      [eli.id, refreshedOn(penalties(eli.id, 'in-pen-eli'), '2026-10-02T02:30:43Z')],
    ]);
    const seen: Filters[] = [];
    const d = await load([stale, refreshedOn(penalties(eli.id, 'in-pen-eli'), '2026-10-02T02:30:43Z')], {
      golf_rounds: (f) => {
        seen.push(f);
        return { data: [countable(jonah.id, '2026-10-01'), countable(eli.id, '2026-10-01')] };
      },
    });
    const byName = Object.fromEntries(d.players.list.map((p) => [p.name, p]));
    expect(byName['Jonah Okafor']!.top.stale).toEqual({ newestRound: 'Oct 1' });
    expect(byName['Jonah Okafor']!.count).toBe(0);
    expect(byName['Eli Brandt']!.top.stale).toBeNull();
    expect(byName['Eli Brandt']!.count).toBe(1);
    expect([...(filter(seen[0]!, 'in', 'player_id') as string[])].sort()).toEqual([eli.id, jonah.id]);
    expect(filter(seen[0]!, 'gte', 'round_date')).toBe('2026-09-28');
    // The stale player sorts after the current one.
    expect(d.players.list.map((p) => p.name)).toEqual(['Eli Brandt', 'Jonah Okafor']);
  });

  it('CH13-13 the text is about the player, by their first name', async () => {
    heads([[jonah.id, slope(jonah.id)]]);
    const d = await load([slope(jonah.id)]);
    const top = d.players.list.find((p) => p.id === jonah.id)!.top;
    expect(top.lede).toMatch(/^Inside 4-6 ft Jonah is making 58%/);
    expect(top.why).toContain("Jonah's bag");
    // What is drawn is about Jonah; only what a focus area is saved with (assignAs) stays the insight's own, in the second person.
    expect(JSON.stringify({ ...top, assignAs: undefined })).not.toMatch(/\byou('re)?\b/i);
    expect(top.assignAs.description).toMatch(/^Inside 4-6 ft you're making 58%/);
  });

  it('CH13-13 a player with no name on file keeps the text as written', async () => {
    heads([[jonah.id, slope(jonah.id)]]);
    const d = await load([slope(jonah.id)], { golf_players: { data: [{ id: jonah.id, first_name: null, last_name: null }] } });
    expect(d.players.list[0]!.name).toBe('Player');
    expect(d.players.list[0]!.top.lede).toMatch(/you're making 58%/);
  });
});

// ── The gate, for the board and for Ask ────────────────────────────────────

describe('CH13-20 CoachHelm on, off or unread for a coach', () => {
  it('on, off by the coach, the team or GolfHelm, and a lookup that failed', async () => {
    vi.mocked(isCoachHelmEnabledForCoach).mockResolvedValue({ ...on });
    expect(await loadCoachHelmGate('c1')).toEqual({ status: 'on' });
    vi.mocked(isCoachHelmEnabledForCoach).mockResolvedValue({ ...on, effectivelyEnabled: false, userEnabled: false, disabledBy: 'user', disabledReason: 'Offseason' });
    expect(await loadCoachHelmGate('c1')).toEqual({ status: 'off', off: { by: 'user', reason: 'Offseason' } });
    vi.mocked(isCoachHelmEnabledForCoach).mockResolvedValue({ ...on, effectivelyEnabled: false, teamEnabled: false, disabledBy: 'team', disabledReason: 'Disabled by team' });
    expect(await loadCoachHelmGate('c1')).toEqual({ status: 'off', off: { by: 'team', reason: null } });
    vi.mocked(isCoachHelmEnabledForCoach).mockResolvedValue({ ...on, effectivelyEnabled: false, disabledBy: null, disabledReason: 'CoachHelm is disabled globally' });
    expect(await loadCoachHelmGate('c1')).toEqual({ status: 'off', off: { by: 'global', reason: null } });
    vi.mocked(isCoachHelmEnabledForCoach).mockResolvedValue({ ...on, effectivelyEnabled: false, disabledBy: null, disabledReason: 'Coach record lookup failed' });
    expect(await loadCoachHelmGate('c1')).toEqual({ status: 'failed' });
    vi.mocked(isCoachHelmEnabledForCoach).mockRejectedValue(new Error('down'));
    expect(await loadCoachHelmGate('c1')).toEqual({ status: 'failed' });
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'gate', expect.anything(), 'coachhelm');
  });
});

describe('CH13-20 the Ask address respects the CoachHelm switch, as the board does', () => {
  const asCoach = () => {
    session.current = { userId: 'u1', role: 'coach', coach: { id: 'c1', organization_id: 'org1' }, player: null };
    teamOf.current = { role: 'coach', teamId: 't1', coachId: 'c1' };
  };

  it('CoachHelm on: the chat (its own Suspense, which draws the Ask skeleton while the chat reads)', async () => {
    asCoach();
    vi.mocked(isCoachHelmEnabledForCoach).mockResolvedValue({ ...on });
    const el = (await ClubhouseCoachHelmRoute({ view: 'ask' })) as { type: unknown; props: { fallback: unknown } };
    expect(el.type).toBe(Suspense);
    expect(el.props.fallback).not.toBeNull();
    expect(isCoachHelmEnabledForCoach).toHaveBeenCalledWith('c1');
  });

  it('CH-13305 CoachHelm off for the coach, their team or GolfHelm: the board’s own "CoachHelm is off" page, no chat read, no tab strip', async () => {
    asCoach();
    vi.mocked(isCoachHelmEnabledForCoach).mockResolvedValue({ ...on, effectivelyEnabled: false, teamEnabled: false, disabledBy: 'team', disabledReason: 'Disabled by team' });
    render(wrap(await ClubhouseCoachHelmRoute({ view: 'ask' })));
    expect(code('CH-13305')!.textContent).toMatch(/CoachHelm is off.*Your team has turned CoachHelm off/);
    expect(screen.queryByTestId('ask')).toBeNull();
    expect(loadAskCoachHelm).not.toHaveBeenCalled();
    expect(code('CH-13923')).toBeNull();
  });

  it('a lookup that failed is Ask’s own "did not load", never an open chat', async () => {
    asCoach();
    vi.mocked(isCoachHelmEnabledForCoach).mockRejectedValue(new Error('down'));
    render(wrap(await ClubhouseCoachHelmRoute({ view: 'ask' })));
    expect(screen.getByTestId('ask').getAttribute('data-status')).toBe('failed');
    expect(loadAskCoachHelm).not.toHaveBeenCalled();
  });

  it('a player’s ?view=ask is still their own board, and reads no coach gate', async () => {
    session.current = { userId: 'u2', role: 'player', coach: null, player: { id: jonah.id } };
    vi.mocked(isCoachHelmEnabledForPlayer).mockResolvedValue({ ...on });
    vi.mocked(getInsightsForPlayer).mockResolvedValue([slope(jonah.id)]);
    tables.current = { golf_team_members: { data: null }, golf_drills: { data: [] }, golf_player_focus_areas: { data: [] } };
    render(wrap(await ClubhouseCoachHelmRoute({ view: 'ask' })));
    expect(screen.getByText('Player')).toBeTruthy();
    expect(isCoachHelmEnabledForCoach).not.toHaveBeenCalled();
  });

  it('CH-13923 the board with CoachHelm off draws no Board and Ask strip, and the board with it on does', () => {
    render(wrap(<CoachBoard data={emptyCoachHelm({ by: 'user', reason: null })} />));
    expect(code('CH-13923')).toBeNull();
    cleanup();
    render(wrap(<CoachBoard data={coachData(chTop(slope(jonah.id)))} />));
    expect(code('CH-13923')).not.toBeNull();
  });
});

// ── The screens ────────────────────────────────────────────────────────────

const chTop = (i: EvidenceInsight, extra: Parameters<typeof toChInsight>[1] = {}): ChInsight => toChInsight(i, { tour: PREVIEW_TOUR, ...extra });
const coachData = (top: ChInsight, count = 1): ChCoachHelmData => ({
  off: null,
  roster: { count: 1, error: false },
  pulse: { rows: [], error: false },
  players: { list: [{ id: jonah.id, name: jonah.name, count, top }], error: false },
  withoutSignals: 0,
});
const playerData = (...list: ChInsight[]): ChPlayerHelm => ({ off: null, proposals: { list: [], error: false }, insights: { list, error: false }, rounds: null });
const focus = () => within(document.querySelector('.ch-hl-focus') as HTMLElement);
const pill = () => document.querySelector('.ch-hl-focus .ch-hl-pri') as HTMLElement;

describe('the cards, on screen', () => {
  it('CH13-13 the gauge names the player on the coach’s board and says You on the player’s own', () => {
    const legend = () => document.querySelector('.ch-hl-focus .ch-hl-g__lg span')!.textContent;
    render(wrap(<CoachBoard data={coachData(chTop(penalties(jonah.id)))} />));
    expect(legend()).toBe('Jonah · 1.1');
    cleanup();
    render(wrap(<PlayerBoard data={playerData(chTop(penalties(jonah.id)))} />));
    expect(legend()).toBe('You · 1.1');
  });

  it('CH13-16 the pill is a word that is never a fresh Priority once the insight is assigned or acknowledged', () => {
    const word = (top: ChInsight) => {
      render(wrap(<CoachBoard data={coachData(top)} />));
      const w = pill().textContent;
      cleanup();
      return w;
    };
    expect(word(chTop(slope(jonah.id)))).toBe('Worth closing');
    expect(word(chTop(penalties(jonah.id)))).toBe('Priority');
    expect(word(chTop(slope(jonah.id), { assigned: 'proposed' }))).toBe('Assigned');
    expect(word(chTop({ ...slope(jonah.id), status: 'acknowledged' }))).toBe('Acknowledged');
    expect(word(chTop(bigNumber(jonah.id)))).toBe('Working');
    expect(word(chTop(teeInconclusive(jonah.id)))).toBe('Note');
    expect(word(chTop(refreshedOn(slope(jonah.id), '2026-09-01T00:00:00Z'), { newestRound: '2026-09-30' }))).toBe('Out of date');
  });

  it('CH13-16 an assignment made in this visit changes the pill at once', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const w = { assign: vi.fn(() => Promise.resolve({ success: true })), dismiss: vi.fn(), undo: vi.fn() };
    render(wrap(<CoachBoard data={coachData(chTop(slope(jonah.id)))} writes={w} />));
    expect(pill().textContent).toBe('Worth closing');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Assign as focus' }));
    await screen.findByText(/Assigned as Jonah’s focus/);
    expect(pill().textContent).toBe('Assigned');
  });

  it('CH13-13 a focus area made from the coach’s board is saved in the insight’s own words, never the board’s rewrite for the coach', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const w = { assign: vi.fn(() => Promise.resolve({ success: true })), dismiss: vi.fn(), undo: vi.fn() };
    const top = chTop(slope(jonah.id), { viewer: { role: 'coach', first: 'Jonah' } });
    render(wrap(<CoachBoard data={coachData(top)} writes={w} />));
    // The coach reads it about Jonah; the focus area, which Jonah reads, is the insight's own claim.
    expect(focus().getByText(/Inside 4-6 ft Jonah is making 58%/)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Assign as focus' }));
    expect(w.assign).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: jonah.id,
        title: 'Downhill putts inside 4-6 ft: a real penalty',
        description: "Inside 4-6 ft you're making 58% of downhill putts vs 81% of level putts at the same distance, a 23-point gap (n=31 downhill / 44 level).",
      }),
    );
  });

  it('CH13-16 on the player’s board an acknowledged insight’s row and card say so', () => {
    render(wrap(<PlayerBoard data={playerData(chTop(penalties(jonah.id)), chTop({ ...slope(jonah.id), status: 'acknowledged' }))} />));
    expect(pill().textContent).toBe('Priority');
    expect(within(screen.getByRole('region', { name: 'Also worth knowing' })).getByRole('button').textContent).toContain('Acknowledged');
  });

  it('CH-13904 CH13-11 a note has no Assign and no Dismiss, no number and no gauge; it says why', () => {
    render(wrap(<CoachBoard data={coachData(chTop(parType(jonah.id)), 0)} />));
    expect(screen.queryByRole('button', { name: /Assign|Dismiss/ })).toBeNull();
    expect(code('CH-13904')!.textContent).toMatch(/states no finding/);
    expect(focus().getByRole('heading', { level: 2 }).textContent).toBe('Scoring by par type');
    expect(document.querySelector('.ch-hl-focus .ch-hl-g')).toBeNull();
    expect(document.querySelector('.ch-hl-focus .ch-hl-ev')).toBeNull();
    expect(focus().getByText(/Par 3: 3\.27.*Par 5: 4\.91/)).toBeTruthy();
    // The player's row says nothing is open, never a count of one.
    expect(screen.getByRole('button', { name: /Jonah Okafor/ }).textContent).toMatch(/0$/);
  });

  it('CH-13903 CH-13906 CH13-3 an out-of-date read says so beside the claim, keeps Dismiss, and offers no Assign', () => {
    const top = chTop(refreshedOn(slope(jonah.id), '2026-09-28T02:30:43Z'), { newestRound: '2026-09-30' });
    render(wrap(<CoachBoard data={coachData(top, 0)} />));
    expect(code('CH-13903')!.textContent).toMatch(/A round played Sep 30 isn’t in this read yet/);
    expect(code('CH-13905')!.textContent).toBe('As of Sep 28');
    expect(screen.queryByRole('button', { name: 'Assign as focus' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    expect(code('CH-13906')!.textContent).toMatch(/older than Jonah’s newest round/);
  });

  it('CH13-3 the player’s board puts a current finding first and the out-of-date one after it, marked', () => {
    const stale = chTop(refreshedOn(slope(jonah.id), '2026-09-28T02:30:43Z'), { newestRound: '2026-09-30' });
    render(wrap(<PlayerBoard data={playerData(stale, chTop(penalties(jonah.id)))} />));
    expect(focus().getByRole('heading', { level: 2 }).textContent).toBe('Penalty strokes: 1.1 per round');
    expect(within(screen.getByRole('region', { name: 'Also worth knowing' })).getByRole('button').textContent).toContain('Out of date');
  });

  it('CH-13905 CH13-9 the card says when the read was made, and the sample in the generator’s own unit', () => {
    const own = refreshedOn({ ...slope(jonah.id), evidence: { ...slope(jonah.id).evidence, metric: 'something_unlisted', sample_n: 26, detail: { sample_unit: 'rounds', downhill_pct: 58, level_pct: 81 } } }, '2026-09-30T02:30:43Z');
    render(wrap(<PlayerBoard data={playerData(chTop(own))} />));
    expect(code('CH-13905')!.textContent).toBe('As of Sep 30');
    expect(focus().getByText('26 rounds')).toBeTruthy();
  });

  it('CH13-10 the read says Solid, Early or Thin, never Strong or Fair', () => {
    render(wrap(<PlayerBoard data={playerData(chTop(slope(jonah.id)))} />));
    expect(focus().getByText('Solid read')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Strong read|Fair read/);
    cleanup();
    render(wrap(<PlayerBoard data={playerData(chTop(breakBias(jonah.id)))} />));
    expect(focus().getByText('Early read')).toBeTruthy();
  });
});
