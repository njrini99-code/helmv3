import { LazyMotion, domAnimation } from 'motion/react';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pulseLanded } from './coachhelm-pulse';
import { resolved } from './route-view';

/** CoachHelm (P013): every numbered state in docs/clubhouse/catalog/coachhelm.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
const search = vi.hoisted(() => ({ current: new URLSearchParams() as URLSearchParams | null }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/golf/dashboard/coachhelm',
  useSearchParams: () => search.current,
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
const gate = vi.hoisted(() => ({ on: true }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFor: (role: string | null) => gate.on && (role === 'coach' || role === 'player') }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
vi.mock('@/app/golf/actions/development', () => ({ createFocusAreaFromInsightV2: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({ getInsightsForPlayer: vi.fn(), getTopInsightsForPlayers: vi.fn() }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForPlayer: vi.fn(), isCoachHelmEnabledForCoach: vi.fn() }));
// The coach's signal controls, through the engine's own resolver (admin-read): the minimum rounds before CoachHelm reads.
vi.mock('@/lib/golf/player-signal-settings', () => ({ getPlayerSignalSettings: vi.fn(async () => ({ minHolePlaysForRanking: 3, patternLookbackDays: 90, statsBenchmarkWindowDays: 30, minRoundsForSignal: 5 })) }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachProgramPulse: vi.fn(), getCoachChatContext: async () => ({ roster: [] }) }));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: () => Promise.resolve(session.current) }));
const teamOf = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: () => Promise.resolve(teamOf.current) }));

import GolfCoachHelmPage from '@/app/golf/(dashboard)/dashboard/coachhelm/page';
import { acceptFocusArea, createFocusAreaFromInsightV2, declineFocusArea } from '@/app/golf/actions/development';
import { dismissInsight, reactivateInsight } from '@/app/golf/actions/insights-feed';
import { getInsightsForPlayer, getTopInsightsForPlayers } from '@/app/golf/actions/insight-delivery';
import { isCoachHelmEnabledForCoach, isCoachHelmEnabledForPlayer } from '@/lib/coachhelm/v2/gate';
import { getCoachProgramPulse } from '@/lib/coachhelm/v3/chat/request-cache';
import { ACTIVE_FOCUS_DUPLICATE_ERROR } from '@/lib/coachhelm/focus-areas/duplicate-guard';
import { loadCoachCoachHelm, loadPlayerCoachHelm } from '../data/coachhelm';
import { areaTypeFor, formatComparison, splitContent, toChInsight, withoutCollegeAverage } from '../data/coachhelm-map';
import { partitionInsights, playersLine, pulseRows, sortCoachPlayers, type ChCoachHelmData, type ChPlayerHelm, type ChTourBaseline } from '../data/coachhelm-shape';
import { ClubhouseCoachHelmRoute } from '../routes/coachhelm';
import { CoachBoard } from '../screens/coachhelm/CoachBoard';
import { CoachHelmRouteSkeleton, CoachHelmSkeleton, routeSkeletonFor } from '../screens/coachhelm/CoachHelmSkeleton';
import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import { DiveSkeleton } from '../screens/coachhelm/views/Skeletons';
import { LIVE_COACHHELM_WRITES, LIVE_PLAYER_WRITES, type ChCoachHelmWrites, type ChPlayerWrites } from '../screens/coachhelm/writes';
import { PreviewCoachHelmPlayer } from '../preview/PreviewCoachHelmPlayer';
import { ClubhouseMarker } from '../shell/context';
import { ToastProvider } from '../ui/Toast';
import { GolfUserProvider } from '@/contexts/golf-user-context';
import {
  bigNumber,
  breakBias,
  HELM_PLAYERS,
  penalties,
  PREVIEW_HELM_COACH,
  PREVIEW_HELM_COACH_ASSIGNED,
  PREVIEW_HELM_COACH_EMPTY,
  PREVIEW_HELM_COACH_FAILED,
  PREVIEW_HELM_COACH_NO_ROSTER,
  PREVIEW_HELM_COACH_OFF,
  PREVIEW_HELM_COACH_PULSE_FAILED,
  PREVIEW_HELM_COACH_QUIET,
  PREVIEW_HELM_PLAYER,
  PREVIEW_HELM_PLAYER_EMPTY,
  PREVIEW_HELM_PLAYER_FAILED,
  PREVIEW_HELM_PLAYER_NO_ROUNDS,
  PREVIEW_HELM_PLAYER_OFF,
  PREVIEW_HELM_PLAYER_PROPOSALS_FAILED,
  PREVIEW_HELM_PLAYER_PROPOSED,
  PREVIEW_HELM_PLAYER_WORKING,
  PREVIEW_TOUR,
  slope,
} from '../preview/fixtures-coachhelm';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);
const showPlayer = (data: ChPlayerHelm) => render(wrap(<PlayerBoard data={data} />));
const okWrites = (): ChCoachHelmWrites => ({
  assign: vi.fn(() => Promise.resolve({ success: true })),
  dismiss: vi.fn(() => Promise.resolve({ success: true })),
  undo: vi.fn(() => Promise.resolve({ success: true })),
});
function showCoach(data: ChCoachHelmData = PREVIEW_HELM_COACH, w: ChCoachHelmWrites = okWrites()) {
  render(wrap(<CoachBoard data={data} writes={w} />));
  return w;
}
const focusHeading = () => within(document.querySelector('.ch-hl-focus') as HTMLElement).getByRole('heading', { level: 2 }).textContent;
const inList = (heading: string) => within(screen.getByRole('region', { name: heading }));

beforeEach(() => {
  gate.on = true;
  hapticSpy.mockClear();
  router.refresh.mockClear();
  logServer.mockClear();
  vi.mocked(createFocusAreaFromInsightV2).mockReset();
  vi.mocked(acceptFocusArea).mockReset();
  vi.mocked(declineFocusArea).mockReset();
  vi.mocked(dismissInsight).mockReset();
  vi.mocked(reactivateInsight).mockReset();
  vi.mocked(getInsightsForPlayer).mockReset();
  vi.mocked(getTopInsightsForPlayers).mockReset();
  vi.mocked(isCoachHelmEnabledForPlayer).mockReset();
  vi.mocked(isCoachHelmEnabledForCoach).mockReset();
  vi.mocked(getCoachProgramPulse).mockReset();
});
afterEach(() => {
  tables.current = {};
  session.current = null;
  teamOf.current = null;
});

// ── The pure steps ─────────────────────────────────────────────────────────

describe('Generator output to the board', () => {
  const jonah = HELM_PLAYERS.jonah.id;
  /** The same insight compared against the player's own baseline, which is not a college comparison (Q-88 leaves it as it is). */
  const ownBaseline = (i: EvidenceInsight): EvidenceInsight => ({ ...i, evidence: { ...i.evidence, comparison_source: 'your_baseline', comparison_label: 'Your recent rounds' } });

  it('130106 the downhill penalty: two make rates as bars, no gauge, the sample in putts, the window in days, the drill from the attached drill', () => {
    const i = toChInsight(slope(jonah), { drillText: 'Start 2 ft below the hole.' });
    expect(i).toMatchObject({ category: 'Putting', priority: 'medium', strength: false, value: '23 pts', areaType: 'putting', lifecycle: 'detected', metric: 'putt_slope_downhill_penalty_pct' });
    expect(i.evidence.bars).toEqual([
      { label: 'Downhill', pct: 58, weak: true },
      { label: 'Level', pct: 81, weak: false },
    ]);
    expect(i.evidence.gauge).toBeNull();
    expect(i.evidence).toMatchObject({ sample: '75 putts', window: '90 days', read: { level: 3, word: 'Solid read' } });
    expect(i.week).toEqual({ title: 'Downhill ladder', text: 'Start 2 ft below the hole.', meta: '12 min · intermediate' });
  });

  it('the lede is the first sentence and the reasoning the rest, never the drill parsed out of it', () => {
    const i = toChInsight(slope(jonah));
    expect(i.lede).toBe("From 4-6 ft, you're making 58% of downhill putts vs 81% of level putts at the same distance, a 23-point gap.");
    // A row stored before the generator stopped writing its "(n=…)" aside reads the same: the sample is the evidence line's.
    const stored = toChInsight({ ...slope(jonah), content: "Inside 4-6 ft you're making 58% of downhill putts vs 81% of level putts at the same distance, a 23-point gap (n=31 downhill / 44 level). Short putts carry (n=75) the highest leverage." });
    expect(stored.lede).toBe("Inside 4-6 ft you're making 58% of downhill putts vs 81% of level putts at the same distance, a 23-point gap.");
    expect(stored.why).toBe('Short putts carry the highest leverage.');
    // Only the slope read's aside: putt-bias's per-side counts say what the evidence line does not.
    const other = toChInsight({ ...breakBias(jonah), content: 'On 10-20 ft putts you make 36% of left-to-right breaks vs 51% the other way (n=22/24). Read more break.' });
    expect(other.lede).toContain('(n=22/24)');
    expect(i.why).toMatch(/^Short putts carry the highest leverage/);
    expect(i.why).toMatch(/Rehearse a downhill-only ladder drill/);
  });

  it('a drill whose text could not be read still shows its name and length', () => {
    expect(toChInsight(slope(jonah)).week).toEqual({ title: 'Downhill ladder', text: null, meta: '12 min · intermediate' });
  });

  it('a lifetime value says All rounds and counts rounds; a count keeps its decimal; the college cohort is drawn as the Tour, once (Q-88)', () => {
    const i = toChInsight(penalties(jonah), { tour: PREVIEW_TOUR });
    expect(i).toMatchObject({ category: 'Course management', priority: 'high', strength: false, areaType: 'mental_game' });
    expect(i.evidence).toMatchObject({ sample: '21 rounds', window: 'All rounds', read: { level: 3 } });
    // The generator's own Tour tick (0.3, "PGA Tour avg") is the same number now drawn as the comparison, so it is not drawn twice.
    expect(i.evidence.gauge).toEqual({ you: '1.1', cmp: 'Tour 0.3', sec: null });
  });

  it('the generator’s placeholder recommended action is not shown as a drill', () => {
    expect(toChInsight(penalties(jonah)).week).toBeNull();
  });

  it('a specific recommended action is shown as this week’s work, with no drill name', () => {
    const base = penalties(jonah);
    const ins = { ...base, evidence: { ...base.evidence, diagnosis: { ...base.evidence.diagnosis!, recommended_action: 'Take one club less off the tee on holes with water right.' } } };
    expect(toChInsight(ins).week).toEqual({ title: null, text: 'Take one club less off the tee on holes with water right.', meta: null });
  });

  it('ahead of the generator’s own comparison at low priority is working, and its gauge is the green one, drawn against the Tour', () => {
    const i = toChInsight(bigNumber(jonah), { tour: PREVIEW_TOUR });
    expect(i.strength).toBe(true);
    expect(i.evidence.gauge).toMatchObject({ cmp: 'Tour 2%' });
  });

  it('a break gap is a finding: a make rate below its comparison (higher is better in the registry) is amber, never working', () => {
    const i = toChInsight(breakBias(jonah));
    expect(i.strength).toBe(false);
    expect(i.evidence.gauge).not.toBeNull();
  });

  it('being ahead of the comparison only makes an insight working at low priority: at medium priority it is still a finding', () => {
    expect(toChInsight({ ...bigNumber(jonah), priority: 'medium' })).toMatchObject({ priority: 'medium', strength: false });
    expect(toChInsight(bigNumber(jonah), { tour: PREVIEW_TOUR }).strength).toBe(true);
  });

  it('a low-priority row that is behind its comparison is minor, not working', () => {
    const b = bigNumber(jonah);
    const behind = { ...b, evidence: { ...b.evidence, your_value: 6.2, your_value_display: '6.2%' } };
    expect(toChInsight(behind)).toMatchObject({ priority: 'low', strength: false });
  });

  it('a resolved insight is working, and urgent reads as high', () => {
    const p = penalties(jonah);
    expect(toChInsight({ ...p, lifecycle_state: 'resolved' }).strength).toBe(true);
    expect(toChInsight({ ...p, priority: 'urgent' }).priority).toBe('high');
  });

  it('a value with no comparison draws no gauge and still names its sample', () => {
    const p = ownBaseline(penalties(jonah));
    const lone = toChInsight({ ...p, evidence: { ...p.evidence, comparison_value: null as never } });
    expect(lone.evidence.gauge).toBeNull();
    expect(lone.evidence.sample).toBe('21 rounds');
  });

  it('Q-88 a women’s team’s college cohort is drawn as the LPGA Tour, never the men’s', () => {
    const lpga: ChTourBaseline = { tour: 'lpga', values: new Map([['penalty_rate_per_round', 0.4]]) };
    expect(toChInsight(penalties(jonah), { tour: lpga }).evidence.gauge).toMatchObject({ cmp: 'LPGA Tour 0.4', sec: null });
  });

  it('Q-88 a metric the tour has no value for, or a tour that is not known, draws no comparison and no gauge, and still names its sample', () => {
    const none: ChTourBaseline = { tour: 'pga', values: new Map([['sg_total', 0.1]]) };
    for (const extra of [{ tour: none }, { tour: null }, {}]) {
      const i = toChInsight(penalties(jonah), extra);
      expect(i.evidence.gauge).toBeNull();
      expect(i.evidence.sample).toBe('21 rounds');
    }
  });

  it('Q-88 a college cohort average is drawn as the Tour value for the same metric', () => {
    const p = penalties(jonah);
    const ins = { ...p, evidence: { ...p.evidence, comparison_source: 'cohort_avg' as const, comparison_label: 'College cohort avg' } };
    expect(toChInsight(ins).evidence.gauge).toBeNull();
    expect(toChInsight(ins, { tour: PREVIEW_TOUR }).evidence.gauge).toMatchObject({ cmp: 'Tour 0.3', sec: null });
  });

  it('Q-88 a division target or the old college estimate has no like-for-like Tour row, so no gauge is drawn', () => {
    const p = penalties(jonah);
    for (const source of ['d1_avg', 'd2_avg', 'd3_avg', 'naia_avg', 'juco_avg', 'estimated_target'] as const) {
      const ins = { ...p, evidence: { ...p.evidence, comparison_source: source, comparison_label: 'D2 average miss severity' } };
      expect(toChInsight(ins).evidence.gauge).toBeNull();
      expect(toChInsight(ins, { tour: PREVIEW_TOUR }).evidence.gauge).toBeNull();
      expect(toChInsight(ins, { tour: PREVIEW_TOUR }).evidence.sample).toBe('21 rounds');
    }
  });

  it('Q-88 a comparison that is not a college one is drawn as the generator wrote it, with or without a Tour', () => {
    const b = breakBias(jonah);
    expect(toChInsight(b, { tour: PREVIEW_TOUR }).evidence.gauge).toMatchObject({ cmp: 'Your right-to-left make % (same band) 51%', sec: null });
    const own = ownBaseline(penalties(jonah));
    expect(toChInsight(own, { tour: PREVIEW_TOUR }).evidence.gauge).toMatchObject({ cmp: 'Your recent rounds 0.6', sec: 'PGA Tour avg 0.3' });
    expect(toChInsight(own).evidence.gauge).toMatchObject({ cmp: 'Your recent rounds 0.6', sec: 'PGA Tour avg 0.3' });
  });

  it('Q-88 the sentence quoting the college average is not in the reasoning, and the rest of it is', () => {
    const i = toChInsight(penalties(jonah), { tour: PREVIEW_TOUR });
    expect(i.lede).toBe("Across all 21 rounds on file you're averaging 1.1 penalty strokes per round.");
    expect(i.why).toBe('45.0% of your double-or-worse holes trace to penalties: pick a conservative line / bail-out target off the tee on these holes. Every penalty avoided is worth ~1.5 strokes per round.');
    expect(toChInsight(bigNumber(jonah)).why).toBe('This is the #1 separator between 70s and 80s rounds.');
    expect(withoutCollegeAverage('You average 1.1 per round. College players in our data average ~0.6. Keep going.')).toBe('You average 1.1 per round. Keep going.');
    // The pressure gap's version carries the Tour in the same sentence: it goes with it, and the gauge draws the Tour.
    expect(withoutCollegeAverage('A 2.1-stroke gap. College players in our data average a 2.1-stroke gap; the PGA Tour gap is ~0.5. Play it.')).toBe('A 2.1-stroke gap. Play it.');
    expect(withoutCollegeAverage('No college sentence here.')).toBe('No college sentence here.');
    // Only that sentence: another one that starts with College stays.
    expect(withoutCollegeAverage('You average 1.1 per round. College golf is long. Keep going.')).toBe('You average 1.1 per round. College golf is long. Keep going.');
    expect(withoutCollegeAverage(null)).toBe('');
  });

  it('a lifetime value counts rounds whatever the metric is called; the same metric in a window counts what it measures', () => {
    const p = penalties(jonah);
    const lifetime = toChInsight({ ...p, evidence: { ...p.evidence, metric: 'birdie_conversion', window_basis: 'lifetime' } });
    expect(lifetime.evidence).toMatchObject({ sample: '21 rounds', window: 'All rounds' });
    const windowed = toChInsight({ ...p, evidence: { ...p.evidence, metric: 'birdie_conversion', window_basis: undefined, window_days: 60 } });
    expect(windowed.evidence).toMatchObject({ sample: '21 observations', window: '60 days' });
    expect(toChInsight({ ...p, evidence: { ...p.evidence, sample_n: 1 } }).evidence.sample).toBe('1 round');
  });

  it('a Tour tick that equals the comparison is drawn once, and one with no label of its own is named the Tour', () => {
    const p = ownBaseline(penalties(jonah));
    const same = toChInsight({ ...p, evidence: { ...p.evidence, secondary_value: p.evidence.comparison_value } }).evidence.gauge!;
    expect(same.sec).toBeNull();
    const unnamed = toChInsight({ ...p, evidence: { ...p.evidence, secondary_label: undefined } }).evidence.gauge!;
    expect(unnamed.sec).toBe('Tour 0.3');
  });

  it('with no text of its own, the lede is the diagnosis’s symptom and there is no reasoning to open', () => {
    const p = penalties(jonah);
    const i = toChInsight({ ...p, content: '' });
    expect(i.lede).toBe('Penalties per Round');
    expect(i.why).toBeNull();
  });

  it('the lifecycle state comes through as it is, and one the board does not know reads as detected', () => {
    const p = penalties(jonah);
    expect(toChInsight({ ...p, lifecycle_state: 'matured' }).lifecycle).toBe('matured');
    expect(toChInsight({ ...p, lifecycle_state: 'archived' }).lifecycle).toBe('detected');
  });

  it('with no display of its own the headline is the number in its unit, and a label that carries its own number stands alone', () => {
    const p = ownBaseline(penalties(jonah));
    const i = toChInsight({ ...p, evidence: { ...p.evidence, your_value_display: undefined as never, comparison_label: 'No penalties (your par 5 rate 12%)' } });
    expect(i.value).toBe('1.1');
    expect(i.evidence.gauge).toMatchObject({ you: '1.1', cmp: 'No penalties (your par 5 rate 12%)' });
    // When the generator has its own display of the number, that is what is shown.
    expect(toChInsight({ ...p, evidence: { ...p.evidence, your_value_display: 'about one' } }).evidence.gauge!.you).toBe('about one');
  });

  it('splits sentences at a full stop before a capital or digit, never inside a number', () => {
    expect(splitContent('You average 1.1 per round. College players average ~0.6. Keep going.')).toEqual({ lede: 'You average 1.1 per round.', why: 'College players average ~0.6. Keep going.' });
    expect(splitContent('One sentence only.')).toEqual({ lede: 'One sentence only.', why: null });
    expect(splitContent(null)).toEqual({ lede: '', why: null });
  });

  it('numbers in their unit: counts keep a decimal, percents and strokes read plainly, a minus is a true minus', () => {
    expect(formatComparison(0.6, 'count')).toBe('0.6');
    expect(formatComparison(2, 'count')).toBe('2');
    expect(formatComparison(4.8, 'percent')).toBe('4.8%');
    expect(formatComparison(0.5, 'percent')).toBe('50%');
    expect(formatComparison(-1.25, 'strokes')).toBe('−1.3');
    expect(formatComparison(31.4, 'yards')).toBe('31 yd');
  });

  it('a category files under the focus-area type the other promote paths use', () => {
    expect(['putting', 'tee', 'approach', 'short_game', 'scoring', 'pressure', 'course_management', null].map(areaTypeFor)).toEqual([
      'putting',
      'driving',
      'iron_play',
      'short_game',
      'other',
      'mental_game',
      'mental_game',
      'other',
    ]);
  });
});

describe('Which insight leads, and who is most pressing', () => {
  const list = PREVIEW_HELM_PLAYER.insights.list;

  it('130102 the focus is the top-ranked insight that is not working; the rest split into the other things to look at and what is working', () => {
    const { focus, also, working } = partitionInsights(list);
    expect(focus?.title).toBe('Downhill putts from 4–6\u00a0ft: a real penalty');
    expect(also.map((i) => i.title)).toEqual(['Penalty strokes: 1.1 per round', 'Putting break: under-reading left-to-right (10–20\u00a0ft)']);
    expect(working.map((i) => i.title)).toEqual(['Double bogey-or-worse rate: 1.6%']);
  });

  it('a picked insight is the focus and leaves the lists; the one it replaced joins them', () => {
    const { focus, also, working } = partitionInsights(list, list[1]!.id);
    expect(focus?.id).toBe(list[1]!.id);
    expect(also.map((i) => i.id)).toEqual([list[0]!.id, list[2]!.id]);
    expect(working).toHaveLength(1);
    expect(partitionInsights(list, list[3]!.id).working).toHaveLength(0);
  });

  it('with only strengths there is no focus and they are all listed as working', () => {
    const only = PREVIEW_HELM_PLAYER_WORKING.insights.list;
    expect(partitionInsights(only)).toMatchObject({ focus: null, also: [], working: only });
  });

  it('the lists and the pulse are capped: three that need work (the focus among them), one working, six pulse rows', () => {
    const finding = list[0]!;
    const strength = list[3]!;
    const many = [...Array.from({ length: 9 }, (_, n) => ({ ...finding, id: `f${n}` })), ...Array.from({ length: 8 }, (_, n) => ({ ...strength, id: `s${n}` }))];
    const { focus, also, working, more } = partitionInsights(many);
    expect(focus?.id).toBe('f0');
    expect(also.map((i) => i.id)).toEqual(['f1', 'f2']);
    expect(working.map((i) => i.id)).toEqual(['s0']);
    expect(more).toBe(13);
    const items = Array.from({ length: 9 }, (_, n) => ({ id: `rsvp-${n}`, headline: 'A headline', evidence: 'Some evidence', tone: 'neutral' as const }));
    expect(pulseRows(items).map((r) => r.id)).toEqual(['rsvp-0', 'rsvp-1', 'rsvp-2']);
  });

  it('130103 players: the most pressing top insight first, then the most signals, then the name; a strength last', () => {
    const p = PREVIEW_HELM_COACH.players.list;
    expect(p.map((x) => x.name)).toEqual(['Eli Brandt', 'Jonah Okafor', 'Priya Natarajan', 'Theo Marchetti']);
    const tied = sortCoachPlayers([
      { ...p[1]!, id: 'a', name: 'Zed', count: 1 },
      { ...p[1]!, id: 'b', name: 'Abe', count: 1 },
      { ...p[1]!, id: 'c', name: 'Mid', count: 4 },
    ]);
    expect(tied.map((x) => x.name)).toEqual(['Mid', 'Abe', 'Zed']);
  });

  it('a player whose top insight is a strength comes last, even when that insight’s own priority is high', () => {
    const base = PREVIEW_HELM_COACH.players.list[0]!;
    const strong = { ...base, id: 'a', name: 'Aaron', top: { ...base.top, strength: true, kind: 'strength' as const, priority: 'high' as const } };
    const minor = { ...base, id: 'z', name: 'Zed', top: { ...base.top, strength: false, kind: 'finding' as const, priority: 'low' as const } };
    expect(sortCoachPlayers([strong, minor]).map((x) => x.name)).toEqual(['Zed', 'Aaron']);
  });

  it('CH13-4 the subtitle counts the players the board has a current finding for, in the singular when it is one', () => {
    expect(playersLine(4)).toBe('4 players have an open signal.');
    expect(playersLine(1)).toBe('1 player has an open signal.');
    expect(playersLine(0)).toBe('No open signals.');
  });

  it('the pulse keeps its own headline, evidence and order; the signals item is left to the subtitle; tone and icon follow the item', () => {
    const rows = pulseRows([
      { id: 'coverage-stale', headline: 'No rounds recorded in 9 days', evidence: 'Oct 5.', tone: 'attention' },
      { id: 'signals-open', headline: '7 open signals across 4 players', evidence: 'x', tone: 'neutral' },
      { id: 'movement-improve', headline: '2 players are scoring lower', evidence: 'Theo −1.4', tone: 'positive' },
      { id: 'rsvp-9', headline: '1 player hasn’t replied to Dinner', evidence: 'Thu', tone: 'attention' },
      { id: 'something-new', headline: 'A new kind of item', evidence: 'y', tone: 'neutral' },
    ]);
    expect(rows.map((r) => [r.id, r.tone, r.icon])).toEqual([
      ['coverage-stale', 'warn', 'calendar-x'],
      ['movement-improve', 'good', 'trending-down'],
      ['rsvp-9', 'warn', 'rsvp'],
    ]);
  });
});

// ── The player's board ─────────────────────────────────────────────────────

describe('CoachHelm for the player, on screen', () => {
  it('130801 130101 CH-13801 one focus: the page is labelled by its title, the claim is the card’s heading, and there are no coach controls', () => {
    showPlayer(PREVIEW_HELM_PLAYER);
    expect(screen.getByRole('main').getAttribute('aria-labelledby')).toBe('ch-hl-title');
    expect(screen.getByRole('heading', { level: 1, name: 'CoachHelm' })).toBeTruthy();
    // No role line over a player's own board (wave 7); the coach's reads "Coach".
    expect(screen.queryByText('Player')).toBeNull();
    expect(screen.getByText('One thing to work on this week, based on the rounds you’ve posted.')).toBeTruthy();
    expect(focusHeading()).toBe('Downhill putts from 4–6\u00a0ft: a real penalty');
    expect(screen.queryByRole('button', { name: /Assign|Dismiss|Share/ })).toBeNull();
  });

  it('the focus card: the category (a medium finding wears no stance word), the path line, the first sentence, the evidence bars with their sample, window and read, and this week’s drill', () => {
    showPlayer(PREVIEW_HELM_PLAYER);
    const card = within(document.querySelector('.ch-hl-focus') as HTMLElement);
    expect(card.getByText('Putting')).toBeTruthy();
    expect(card.queryByText(/Worth closing/)).toBeNull();
    expect(code('CH-13940')!.textContent).toMatch(/75 putts · Not yet traced shot by shot$/);
    expect(card.getByText(/^From 4–6 ft, you’re making 58%/)).toBeTruthy();
    const bars = within(card.getByRole('list'));
    expect(bars.getByText('Downhill').parentElement!.textContent).toBe('Downhill58%');
    expect(bars.getByText('Level').parentElement!.textContent).toBe('Level81%');
    expect(card.getByText('75 putts')).toBeTruthy();
    expect(card.getByText('90 days')).toBeTruthy();
    expect(card.getByText('Solid read')).toBeTruthy();
    expect(card.getByText('This week')).toBeTruthy();
    expect(card.getByText('Downhill ladder')).toBeTruthy();
    expect(card.getByText(/12 min · intermediate/)).toBeTruthy();
  });

  it('CH-13804 Why we think this is a disclosure that names what it controls; it opens closed and each insight opens closed', async () => {
    const user = userEvent.setup();
    showPlayer(PREVIEW_HELM_PLAYER);
    const why = screen.getByRole('button', { name: 'Why we think this' });
    const body = document.getElementById(why.getAttribute('aria-controls')!)!;
    expect(why.getAttribute('aria-expanded')).toBe('false');
    expect(body.hasAttribute('hidden')).toBe(true);
    await user.click(why);
    expect(why.getAttribute('aria-expanded')).toBe('true');
    expect(body.hasAttribute('hidden')).toBe(false);
    expect(body.textContent).toMatch(/^Short putts carry the highest leverage/);
    await user.click(inList('Also worth knowing').getByRole('button', { name: /Penalty strokes/ }));
    expect(screen.getByRole('button', { name: 'Why we think this' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('the lists: what else is worth knowing, and what is working, each a labelled region', () => {
    showPlayer(PREVIEW_HELM_PLAYER);
    // Each row reads category, title, priority in words (visually hidden), then the value.
    expect(
      inList('Also worth knowing')
        .getAllByRole('button')
        .map((b) => b.textContent),
    // A bare number says what it counts beneath it ("a round", "made").
    ).toEqual(['Course managementPenalty strokes: 1.1 per roundPriority1.1 a round', 'PuttingPutting break: under-reading left-to-right (10–20\u00a0ft)Worth closing36% made']);
    expect(
      inList('What’s working')
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Course managementDouble bogey-or-worse rate: 1.6%Working1.6% of holes']);
    expect(screen.getByText('Reads update as you post rounds. Your coaches see the same insights.')).toBeTruthy();
  });

  it('CH-13701 CH-13803 choosing another insight puts it in the focus card with the selection haptic; the focus it replaced is now in the list', async () => {
    const user = userEvent.setup();
    showPlayer(PREVIEW_HELM_PLAYER);
    await user.click(inList('Also worth knowing').getByRole('button', { name: /Penalty strokes: 1.1 per round/ }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(focusHeading()).toBe('Penalty strokes: 1.1 per round');
    const also = inList('Also worth knowing');
    expect(also.queryByText('Penalty strokes: 1.1 per round')).toBeNull();
    expect(also.getByRole('button', { name: /Downhill putts from 4–6\sft/ })).toBeTruthy();
  });

  it('CH-13802 a gauge says every number in words: you, the Tour, the sample and the window, and no college cohort', async () => {
    const user = userEvent.setup();
    showPlayer(PREVIEW_HELM_PLAYER);
    await user.click(inList('Also worth knowing').getByRole('button', { name: /Penalty strokes/ }));
    const card = within(document.querySelector('.ch-hl-focus') as HTMLElement);
    expect(card.getByText('Penalties per round')).toBeTruthy(); // the generator's Title Case, sentence-cased (P013 D12)
    // D8: no track; the ledger says every number in words.
    expect(document.querySelector('.ch-hl-g__t')).toBeNull();
    expect(card.getByText('You').parentElement!.textContent).toBe('You1.1');
    // Visual pass 2026-10-28: the comparison's figure sits in the ledger's figure column, as the read's own does.
    expect(card.getByText('Tour').parentElement!.textContent).toBe('Tour 0.3');
    expect(card.getByText('0.3').className).toBe('ch-num');
    // Q-88: the college cohort is not drawn, not in the legend and not in the reasoning beneath it.
    expect(card.queryByText(/College cohort/)).toBeNull();
    expect(card.queryByText(/PGA Tour avg/)).toBeNull();
    expect(document.querySelector('.ch-hl-focus')!.textContent).not.toMatch(/College players in our data/);
    expect(card.getByText('21 rounds')).toBeTruthy();
    expect(card.getByText('All rounds')).toBeTruthy();
    expect(card.getByText(/· Priority$/)).toBeTruthy();
    expect(card.queryByText('This week')).toBeNull();
  });

  it('CH-13806 a strength picked from Working reads Working in words, never by colour, and no drill', async () => {
    const user = userEvent.setup();
    showPlayer(PREVIEW_HELM_PLAYER);
    await user.click(inList('What’s working').getByRole('button', { name: /Double bogey-or-worse rate/ }));
    const card = within(document.querySelector('.ch-hl-focus') as HTMLElement);
    expect(card.getByText(/· Working$/)).toBeTruthy();
    // Nothing is left to be working, so the section is gone.
    expect(screen.queryByRole('region', { name: 'What’s working' })).toBeNull();
  });

  it('CH-13805 the focus is a polite live region, so choosing another insight is announced', () => {
    showPlayer(PREVIEW_HELM_PLAYER);
    expect(document.querySelector('.ch-hl-focus')!.closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('CH-13301 no round posted yet: the first-run page names what will appear, and New round opens round entry', async () => {
    showPlayer(PREVIEW_HELM_PLAYER_NO_ROUNDS);
    await expectCode('CH-13301', /Post a round to start CoachHelm.*one thing to work on this week shows up here/);
    expect(screen.getByRole('link', { name: 'New round' }).getAttribute('href')).toBe('/golf/dashboard/rounds/new');
    // With no round posted the lede doesn't claim any, and New round has the Plus Home and Rounds use.
    expect(screen.getByText('One thing to work on each week, from the rounds you post.')).toBeTruthy();
    expect(screen.queryByText(/based on the rounds you’ve posted/)).toBeNull();
    expect(screen.getByRole('link', { name: 'New round' }).querySelector('svg.lucide-plus')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Open Rounds' })).toBeNull();
    // Wave 7: with the rounds still to go known, the line names them.
    cleanup();
    showPlayer({ ...PREVIEW_HELM_PLAYER_NO_ROUNDS, roundsToGo: 4 });
    await expectCode('CH-13301', /CoachHelm reads the rounds you post\. After 4 rounds, one thing to work on this week shows up here\./);
  });

  it('CH-13992 every read cleared: the Cleared lines still show beside the empty state, for their two more checks', async () => {
    showPlayer({ ...PREVIEW_HELM_PLAYER_EMPTY, cleared: ['4–6 ft putts · Cleared — 22 of your last 29 (76%).'] });
    await expectCode('CH-13302');
    expect(screen.getByRole('region', { name: 'Cleared' })).toHaveTextContent('4–6 ft putts · Cleared');
  });

  it('CH-13302 rounds posted but no insight yet: it says how many, that CoachHelm needs enough to find a pattern, and no threshold', async () => {
    showPlayer(PREVIEW_HELM_PLAYER_EMPTY);
    await expectCode('CH-13302', /No insights yet.*You’ve posted 3 rounds\. CoachHelm needs enough rounds to find a pattern worth acting on/);
    expect(code('CH-13302')!.textContent).not.toMatch(/five|of 5/i);
    showPlayer({ ...PREVIEW_HELM_PLAYER_EMPTY, rounds: 1 });
    expect(screen.getAllByText(/You’ve posted 1 round\./)).toHaveLength(1);
    showPlayer({ ...PREVIEW_HELM_PLAYER_EMPTY, rounds: null });
    expect(screen.getAllByText(/^CoachHelm needs enough rounds/)).toHaveLength(1);
    // Wave 7: with the coach's minimum read, the page says how many rounds are still to come (the real number, never a made-up one).
    showPlayer({ ...PREVIEW_HELM_PLAYER_EMPTY, rounds: 1, roundsToGo: 2 });
    expect(screen.getAllByText('Post 2 more rounds and CoachHelm starts reading your game.')).toHaveLength(1);
    showPlayer({ ...PREVIEW_HELM_PLAYER_EMPTY, rounds: 2, roundsToGo: 1 });
    expect(screen.getAllByText('Post 1 more round and CoachHelm starts reading your game.')).toHaveLength(1);
    cleanup();
    showPlayer({ ...PREVIEW_HELM_PLAYER_EMPTY, rounds: 3, roundsToGo: 0 });
    expect(screen.getAllByText(/^You’ve posted 3 rounds\. CoachHelm needs enough rounds/)).toHaveLength(1);
  });

  it('CH-13303 only strengths: nothing needs work, and what is working is listed beside it', async () => {
    showPlayer(PREVIEW_HELM_PLAYER_WORKING);
    await expectCode('CH-13303', /Nothing needs work right now/);
    expect(inList('What’s working').getByRole('button', { name: /Double bogey-or-worse rate/ })).toBeTruthy();
    expect(document.querySelector('.ch-hl-focus')).toBeNull();
    // Nothing else to look at, so that list isn't drawn empty.
    expect(screen.queryByRole('region', { name: 'Also worth knowing' })).toBeNull();
  });

  it('CH-13303 the only read is a measured zero: nothing needs work, no list is promised, and the read is a tap away in the Deep dive', async () => {
    const user = userEvent.setup();
    const zero = { ...PREVIEW_HELM_PLAYER.insights.list[1]!, measuredZero: true };
    showPlayer({ ...PREVIEW_HELM_PLAYER, insights: { list: [zero], error: false } });
    await expectCode('CH-13303', /^Nothing needs work right now/);
    expect(code('CH-13303')!.textContent).not.toMatch(/What is working/);
    router.push.mockClear();
    await user.click(screen.getByRole('button', { name: '1 more read in the Deep dive' }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/coachhelm?view=deep-dive');
  });

  it('nine that need work and three working: three and one on the board, and the other eight counted, a tap from the Deep dive', async () => {
    const user = userEvent.setup();
    const [finding, , , strength] = PREVIEW_HELM_PLAYER.insights.list;
    const list = [...Array.from({ length: 9 }, (_, n) => ({ ...finding!, id: `f${n}` })), ...Array.from({ length: 3 }, (_, n) => ({ ...strength!, id: `s${n}` }))];
    showPlayer({ ...PREVIEW_HELM_PLAYER, insights: { list, error: false } });
    expect(document.querySelectorAll('.ch-hl-focus')).toHaveLength(1);
    expect(inList('Also worth knowing').getAllByRole('button')).toHaveLength(2);
    expect(inList('What’s working').getAllByRole('button')).toHaveLength(1);
    router.push.mockClear();
    await user.click(screen.getByRole('button', { name: '8 more reads in the Deep dive' }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/coachhelm?view=deep-dive');
  });

  it('a board that shows every read says nothing about more', () => {
    showPlayer(PREVIEW_HELM_PLAYER);
    expect(screen.queryByRole('button', { name: /more reads? in the Deep dive/ })).toBeNull();
  });

  it('CH-13701 on the phone, choosing an insight brings the focus into view; on a wider screen the page stays where it is', async () => {
    const user = userEvent.setup();
    const scroll = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: scroll, configurable: true, writable: true });
    const real = window.matchMedia;
    try {
      showPlayer(PREVIEW_HELM_PLAYER);
      await user.click(inList('Also worth knowing').getByRole('button', { name: /Penalty strokes/ }));
      expect(scroll).not.toHaveBeenCalled();
      cleanup();
      window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
      showPlayer(PREVIEW_HELM_PLAYER);
      await user.click(inList('Also worth knowing').getByRole('button', { name: /Penalty strokes/ }));
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    } finally {
      window.matchMedia = real;
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });

  it('CH-13304 CoachHelm turned off: said plainly, with the coach’s reason when there is one', async () => {
    showPlayer(PREVIEW_HELM_PLAYER_OFF);
    await expectCode('CH-13304', /CoachHelm is off for your team.*no insights are being shown/);
    expect(screen.queryByRole('region', { name: 'What’s working' })).toBeNull();
  });

  it('CH-13304 the coach’s own words are quoted', () => {
    showPlayer({ ...PREVIEW_HELM_PLAYER_OFF, off: { reason: 'Off during the offseason' } });
    expect(code('CH-13304')!.textContent).toMatch(/Your coach turned it off: “Off during the offseason”/);
  });

  it('131402 CH-13201 the insights fail to load: said so, Try again asks the server again, never "no insights"', async () => {
    const user = userEvent.setup();
    showPlayer(PREVIEW_HELM_PLAYER_FAILED);
    await expectCode('CH-13201', /Your insights didn’t load.*Nothing is lost/);
    expect(code('CH-13301')).toBeNull();
    expect(code('CH-13302')).toBeNull();
    await user.click(within(code('CH-13201') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-13204 a section that crashes while drawing is contained: the rest of the page stays', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const list = PREVIEW_HELM_PLAYER.insights.list;
    // An insight whose evidence can't be read throws inside the focus card only.
    showPlayer({ ...PREVIEW_HELM_PLAYER, insights: { list: [{ ...list[0]!, evidence: null as never }, ...list.slice(1)], error: false } });
    await expectCode('CH-13204', /Your focus couldn’t be shown/);
    expect(inList('What’s working').getByRole('button', { name: /Double bogey-or-worse rate/ })).toBeTruthy();
    quiet.mockRestore();
  });
});

// ── A focus area a coach proposed, answered on the player's board (Q-77) ───

describe('CoachHelm proposals, on the player’s board', () => {
  const user = () => userEvent.setup();
  const okPlayerWrites = (): ChPlayerWrites => ({
    accept: vi.fn(() => Promise.resolve({ success: true })),
    decline: vi.fn(() => Promise.resolve({ success: true })),
  });
  const showProposed = (w: ChPlayerWrites = okPlayerWrites(), data: ChPlayerHelm = PREVIEW_HELM_PLAYER_PROPOSED) => {
    render(wrap(<PlayerBoard data={data} writes={w} />));
    return w;
  };
  const row = (title: string) => screen.getByRole('group', { name: `Answer ${title}` });

  it('CH-13807 130101 what a coach proposed is a labelled section above the insights: each focus, where it came from, and Accept and Decline', () => {
    showProposed();
    const sec = within(screen.getByRole('region', { name: 'Proposed for you' }));
    expect(sec.getByText('Accept to start a focus, or decline to set it aside.')).toBeTruthy();
    expect(sec.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Downhill putts inside 6 ftFrom the read “Downhill putts from 4–6\u00a0ft: a real penalty”AcceptDecline',
      'Lag putting from 30 ftYour coach proposed this as a focus.AcceptDecline',
    ]);
    expect(within(row('Lag putting from 30 ft')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Accept', 'Decline']);
    // It sits above the focus card, and the insights below are as they were.
    const all = Array.from(document.querySelectorAll('.ch-hl > *'));
    expect(all.findIndex((n) => n.classList.contains('ch-hl-prop'))).toBeLessThan(all.findIndex((n) => n.classList.contains('ch-hl-grid')));
    expect(focusHeading()).toBe('Downhill putts from 4–6\u00a0ft: a real penalty');
  });

  it('with nothing proposed there is no section, and with CoachHelm off there is none either', () => {
    showPlayer(PREVIEW_HELM_PLAYER);
    expect(screen.queryByRole('region', { name: 'Proposed for you' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Accept|Decline/ })).toBeNull();
    cleanup();
    showPlayer({ ...PREVIEW_HELM_PLAYER_OFF, proposals: PREVIEW_HELM_PLAYER_PROPOSED.proposals });
    expect(screen.queryByRole('region', { name: 'Proposed for you' })).toBeNull();
    expect(code('CH-13304')).not.toBeNull();
  });

  it('130902 the coach’s board is never handed Accept or Decline: they are the player’s answer', () => {
    showCoach();
    expect(screen.queryByRole('button', { name: /^(Accept|Decline)/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Proposed for you' })).toBeNull();
  });

  it('P013 D10: with more than one proposal each Accept is secondary (one primary per screen); a lone proposal keeps its primary Accept', () => {
    showProposed();
    const accepts = screen.getAllByRole('button', { name: 'Accept' });
    expect(accepts.length).toBeGreaterThan(1);
    for (const b of accepts) expect(b.className).toContain('ch-btn--secondary');
    cleanup();
    const one = { ...PREVIEW_HELM_PLAYER_PROPOSED, proposals: { ...PREVIEW_HELM_PLAYER_PROPOSED.proposals, list: PREVIEW_HELM_PLAYER_PROPOSED.proposals.list.slice(0, 1) } };
    showProposed(okPlayerWrites(), one);
    expect(screen.getByRole('button', { name: 'Accept' }).className).toContain('ch-btn--primary');
  });

  it('CH-13704 CH-13404 CH-13902 Accept: the focus id is sent, both buttons wait and say Accepting, then it is Started in place, with the light press and then success', async () => {
    const u = user();
    let done!: (v: { success: boolean }) => void;
    const w = okPlayerWrites();
    vi.mocked(w.accept).mockReturnValueOnce(new Promise((r) => (done = r)));
    showProposed(w);
    await u.click(within(row('Downhill putts inside 6 ft')).getByRole('button', { name: 'Accept' }));
    expect(hapticSpy).toHaveBeenCalledWith('press');
    expect(w.accept).toHaveBeenCalledWith('fa-ladder');
    await expectCode('CH-13404', /Accepting…/);
    const pair = within(row('Downhill putts inside 6 ft')).getAllByRole('button') as HTMLButtonElement[];
    expect(pair.map((b) => b.disabled)).toEqual([true, true]);
    // The other proposal is its own: it is not waiting.
    expect(within(row('Lag putting from 30 ft')).getAllByRole('button').every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
    done({ success: true });
    await expectCode('CH-13902', /Started · Downhill putts inside 6 ft/);
    expect(code('CH-13902')!.getAttribute('role')).toBe('status');
    expect(screen.queryByRole('group', { name: 'Answer Downhill putts inside 6 ft' })).toBeNull();
    expect(hapticSpy).toHaveBeenCalledWith('success');
    // The chip is the confirmation: no toast, and the page is not refreshed away from it.
    expect(document.querySelector('.ch-toast')).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(w.decline).not.toHaveBeenCalled();
  });

  it('CH-13912 CH-13902 Decline: Declined in place at once with Tell coach why, held under an Undo toast, and the focus id sent when the toast goes', async () => {
    const u = user();
    const w = okPlayerWrites();
    showProposed(w);
    await u.click(within(row('Lag putting from 30 ft')).getByRole('button', { name: 'Decline' }));
    await expectCode('CH-13902', /Declined · Lag putting from 30 ft/);
    expect(screen.getByRole('link', { name: 'Tell coach why' }).getAttribute('href')).toBe('/golf/dashboard/messages?user=u-maya');
    await expectCode('CH-13912', /Declined · Lag putting from 30 ft.*Undo/);
    // Held: nothing is written while Undo is offered.
    expect(w.decline).not.toHaveBeenCalled();
    await u.click(within(code('CH-13912') as HTMLElement).getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => expect(w.decline).toHaveBeenCalledWith('fa-lag'));
    expect(w.decline).toHaveBeenCalledTimes(1);
    expect(code('CH-13902')!.textContent).toMatch(/Declined · Lag putting from 30 ft/);
    expect(w.accept).not.toHaveBeenCalled();
  });

  it('CH-13912 with the proposing coach unknown (their read failed) there is no "Tell coach why": never a guess at the coach', async () => {
    const u = user();
    showProposed();
    await u.click(within(row('Downhill putts inside 6 ft')).getByRole('button', { name: 'Decline' }));
    await expectCode('CH-13902', /Declined · Downhill putts inside 6 ft/);
    expect(screen.queryByRole('link', { name: 'Tell coach why' })).toBeNull();
  });

  it('CH-13912 Undo puts Accept and Decline back and writes nothing; a decline still held when the page goes is written then', async () => {
    const u = user();
    const w = okPlayerWrites();
    const { unmount } = render(wrap(<PlayerBoard data={PREVIEW_HELM_PLAYER_PROPOSED} writes={w} />));
    await u.click(within(row('Lag putting from 30 ft')).getByRole('button', { name: 'Decline' }));
    await u.click(within(code('CH-13912') as HTMLElement).getByRole('button', { name: 'Undo' }));
    expect(within(row('Lag putting from 30 ft')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Accept', 'Decline']);
    expect(screen.queryByRole('link', { name: 'Tell coach why' })).toBeNull();
    expect(w.decline).not.toHaveBeenCalled();
    // Leaving the page (pagehide) writes it at once, and its toast goes with it: no Undo is left that could no longer undo.
    await u.click(within(row('Lag putting from 30 ft')).getByRole('button', { name: 'Decline' }));
    expect(code('CH-13912')).not.toBeNull();
    window.dispatchEvent(new Event('pagehide'));
    expect(w.decline).toHaveBeenCalledTimes(1);
    expect(w.decline).toHaveBeenCalledWith('fa-lag');
    await waitFor(() => expect(code('CH-13912')).toBeNull());
    // Unmounting after that writes nothing more; a decline still held when the row unmounts is written then.
    unmount();
    expect(w.decline).toHaveBeenCalledTimes(1);
    const w2 = okPlayerWrites();
    const again = render(wrap(<PlayerBoard data={PREVIEW_HELM_PLAYER_PROPOSED} writes={w2} />));
    await u.click(within(row('Lag putting from 30 ft')).getByRole('button', { name: 'Decline' }));
    again.unmount();
    expect(w2.decline).toHaveBeenCalledWith('fa-lag');
    expect(w2.decline).toHaveBeenCalledTimes(1);
  });

  it('CH-13004 a failed Accept says so and keeps the buttons; Retry that works starts it, chip included', async () => {
    const u = user();
    const w = okPlayerWrites();
    vi.mocked(w.accept).mockResolvedValueOnce({ success: false }).mockResolvedValueOnce({ success: true });
    showProposed(w);
    await u.click(within(row('Downhill putts inside 6 ft')).getByRole('button', { name: 'Accept' }));
    await expectCode('CH-13004', /Couldn’t accept Downhill putts inside 6 ft/);
    expect(screen.getByText('It is still waiting for you. Try again in a moment.')).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(within(row('Downhill putts inside 6 ft')).getByRole('button', { name: 'Accept' })).toBeTruthy();
    expect(code('CH-13902')).toBeNull();
    await u.click(within(code('CH-13004') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await expectCode('CH-13902', /Started · Downhill putts inside 6 ft/);
    expect(w.accept).toHaveBeenCalledTimes(2);
    expect(w.accept).toHaveBeenLastCalledWith('fa-ladder');
  });

  it('CH-13005 a failed Decline says so and puts the buttons back; Retry that works sets it aside', async () => {
    const u = user();
    const w = okPlayerWrites();
    vi.mocked(w.decline).mockResolvedValueOnce({ success: false, error: 'Focus area not found or no longer pending' }).mockResolvedValueOnce({ success: true });
    showProposed(w);
    await u.click(within(row('Lag putting from 30 ft')).getByRole('button', { name: 'Decline' }));
    // The decline is written when its Undo toast goes.
    await u.click(within(code('CH-13912') as HTMLElement).getByRole('button', { name: 'Dismiss notification' }));
    await expectCode('CH-13005', /Couldn’t decline Lag putting from 30 ft/);
    expect(within(row('Lag putting from 30 ft')).getByRole('button', { name: 'Decline' })).toBeTruthy();
    await u.click(within(code('CH-13005') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await expectCode('CH-13902', /Declined · Lag putting from 30 ft/);
    expect(w.decline).toHaveBeenCalledTimes(2);
  });

  it('CH-13205 a proposals read that failed is its own notice, never "nothing proposed"; Try again reads the page again and the insights below are still there', async () => {
    const u = user();
    showPlayer(PREVIEW_HELM_PLAYER_PROPOSALS_FAILED);
    await expectCode('CH-13205', /Your proposed focus areas didn’t load.*still waiting for you/);
    expect(screen.queryByRole('region', { name: 'Proposed for you' })).toBeNull();
    expect(focusHeading()).toBe('Downhill putts from 4–6\u00a0ft: a real penalty');
    await u.click(within(code('CH-13205') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-13204 a proposals section that crashes while drawing is contained: the insights stay', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    showPlayer({ ...PREVIEW_HELM_PLAYER_PROPOSED, proposals: { list: [null as never], error: false } });
    await expectCode('CH-13204', /Proposed focus areas couldn’t be shown/);
    expect(focusHeading()).toBe('Downhill putts from 4–6\u00a0ft: a real penalty');
    quiet.mockRestore();
  });

  it('the dev preview’s writes: ?state=failproposal fails both answers, so the toast and its Retry can be seen', async () => {
    const u = user();
    render(wrap(<PreviewCoachHelmPlayer data={PREVIEW_HELM_PLAYER_PROPOSED} state="failproposal" />));
    await u.click(within(row('Lag putting from 30 ft')).getByRole('button', { name: 'Accept' }));
    await expectCode('CH-13004', /Couldn’t accept Lag putting from 30 ft/);
  });
});

// ── The coach's board ──────────────────────────────────────────────────────

describe('CoachHelm for the coach, on screen', () => {
  const user = () => userEvent.setup();
  const pick = (u: ReturnType<typeof userEvent.setup>, name: string) => u.click(screen.getByRole('button', { name: new RegExp(name) }));

  it('CH-13969 the Track record link is drawn only when the route hands its address over (flag on), and never with CoachHelm off', () => {
    showCoach();
    expect(code('CH-13969')).toBeNull();
    cleanup();
    render(wrap(<CoachBoard data={PREVIEW_HELM_COACH} writes={okWrites()} trackRecordHref="/golf/dashboard/coachhelm?view=track-record" />));
    expect(within(code('CH-13969') as HTMLElement).getByRole('link', { name: 'Track record' }).getAttribute('href')).toBe('/golf/dashboard/coachhelm?view=track-record');
    cleanup();
    render(wrap(<CoachBoard data={PREVIEW_HELM_COACH_OFF} writes={okWrites()} trackRecordHref="/golf/dashboard/coachhelm?view=track-record" />));
    expect(code('CH-13969')).toBeNull();
  });

  it('CH-13938 the Brief link is drawn only when the route hands its address over (flag on), and never with CoachHelm off', () => {
    showCoach();
    expect(code('CH-13938')).toBeNull();
    cleanup();
    render(wrap(<CoachBoard data={PREVIEW_HELM_COACH} writes={okWrites()} briefHref="/golf/dashboard/coachhelm?view=brief" />));
    expect(within(code('CH-13938') as HTMLElement).getByRole('link', { name: 'Brief' }).getAttribute('href')).toBe('/golf/dashboard/coachhelm?view=brief');
    cleanup();
    render(wrap(<CoachBoard data={PREVIEW_HELM_COACH_OFF} writes={okWrites()} briefHref="/golf/dashboard/coachhelm?view=brief" />));
    expect(code('CH-13938')).toBeNull();
  });

  it('CH13-4 D4 the header counts the players with an open signal, never the rows behind them; the pulse is one collapsed line in it, up to three items, in their own words', async () => {
    const u = user();
    showCoach();
    expect(screen.getByText('Coach')).toBeTruthy();
    // Jonah, Eli and Priya have a finding open; Theo's top card is what is working, which is not an open signal.
    expect(screen.getByText('3 players have an open signal.')).toBeTruthy();
    const header = document.querySelector('.ch-hl-h') as HTMLElement;
    const since = within(header).getByRole('button', { name: /Since you were last here/ });
    expect(since.getAttribute('aria-expanded')).toBe('false');
    const list = document.getElementById(since.getAttribute('aria-controls')!)!;
    expect(list.hidden).toBe(true);
    await u.click(since);
    expect(list.hidden).toBe(false);
    expect([...list.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      '2 players haven’t replied to Team dinner Thu, Oct 16, 6:30 PM · 4 of 6 replied',
      '2 players are scoring worse over their last three rounds Jonah Okafor +2.1 strokes · Eli Brandt +0.8 strokes',
      '1 active focus area has no recent progress Priya Natarajan: Lag putting',
    ]);
    // B11: the open line is a way into What's new.
    expect(within(list).getByRole('link', { name: 'Everything in What’s new' }).getAttribute('href')).toBe('/golf/dashboard/whats-new');
    // No block of its own comes before the decision: the header, then By player.
    expect(screen.queryByRole('region', { name: 'Program pulse' })).toBeNull();
    // The pulse's own signals item is left out: the header says it.
    expect(screen.queryByText('7 open signals across 4 players', { exact: false })).toBeNull();
  });

  it('by player: each with their top signal and how many they have; the most pressing is open first', () => {
    showCoach();
    const players = within(screen.getByRole('region', { name: 'By player' }));
    expect(players.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'EBEli BrandtPenalty strokes: 1.1 per round2',
      'JOJonah OkaforDownhill putts from 4–6\u00a0ft: a real penalty3',
      'PNPriya NatarajanPutting break: under-reading left-to-right (10–20\u00a0ft)1',
      'TMTheo MarchettiDouble bogey-or-worse rate: 1.6%', // no open signal: no count (P013 D12)
    ]);
    expect(players.getByRole('button', { name: /Eli Brandt/ }).getAttribute('aria-pressed')).toBe('true');
    expect(focusHeading()).toBe('Penalty strokes: 1.1 per round');
    expect(within(document.querySelector('.ch-hl-focus') as HTMLElement).getByText('Eli · Course management · Priority')).toBeTruthy();
  });

  it('CH-13701 choosing a player shows their focus, with the selection haptic', async () => {
    const u = user();
    showCoach();
    await pick(u, 'Jonah Okafor');
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(focusHeading()).toBe('Downhill putts from 4–6\u00a0ft: a real penalty');
    expect(screen.getByRole('button', { name: /Jonah Okafor/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Assign as focus' })).toBeTruthy();
  });

  it("?player= (Roster's View insights) opens the board on that player; an id not on the board opens the most pressing", () => {
    render(wrap(<CoachBoard data={PREVIEW_HELM_COACH} writes={okWrites()} initialPlayer="pl-theo" />));
    expect(screen.getByRole('button', { name: /Theo Marchetti/ }).getAttribute('aria-pressed')).toBe('true');
    expect(focusHeading()).toBe('Double bogey-or-worse rate: 1.6%');
    cleanup();
    render(wrap(<CoachBoard data={PREVIEW_HELM_COACH} writes={okWrites()} initialPlayer="someone-else" />));
    expect(screen.getByRole('button', { name: /Eli Brandt/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('Share with the player has no action behind it (players already see their insights), so it is not drawn', () => {
    showCoach();
    expect(screen.queryByRole('button', { name: /Share/ })).toBeNull();
    expect(screen.getAllByRole('button').some((b) => /Share|Send/.test(b.textContent ?? ''))).toBe(false);
  });

  it('130902 130901 CH-13702 CH-13403 Assign as focus: sends the insight’s own title, first sentence, area, metric and the player’s value now (CH13-22); while it works the button says so; then it is assigned, as a proposal the player accepts', async () => {
    const u = user();
    let done!: (v: { success: boolean }) => void;
    const w = okWrites();
    vi.mocked(w.assign).mockReturnValueOnce(new Promise((r) => (done = r)));
    showCoach(PREVIEW_HELM_COACH, w);
    await pick(u, 'Jonah Okafor');
    await u.click(screen.getByRole('button', { name: 'Assign as focus' }));
    expect(hapticSpy).toHaveBeenCalledWith('press');
    expect(w.assign).toHaveBeenCalledWith({
      playerId: 'pl-jonah',
      insightId: 'in-slope',
      // Typeset as the player reads it, with plain spaces: it is saved, and Fairway draws it too.
      title: 'Downhill putts from 4–6 ft: a real penalty',
      description: 'From 4–6 ft, you’re making 58% of downhill putts vs 81% of level putts at the same distance, a 23-point gap.',
      areaType: 'putting',
      targetMetric: 'putt_slope_downhill_penalty_pct',
      // CH13-22: the player's value now is the focus's starting point.
      currentValue: 23,
    });
    await expectCode('CH-13403', /Assigning…/);
    expect((code('CH-13403')!.closest('button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Dismiss/ }) as HTMLButtonElement).disabled).toBe(true);
    done({ success: true });
    await expectCode('CH-13601', /Assigned as Jonah’s focus/);
    // The chip is announced as a status.
    expect(code('CH-13601')!.getAttribute('role')).toBe('status');
    expect(screen.queryByRole('button', { name: 'Assign as focus' })).toBeNull();
    expect(screen.getByText('Jonah sees it as a proposal and accepts it to start.')).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('success');
    // The chip is the confirmation: no toast beside it.
    expect(document.querySelector('.ch-toast')).toBeNull();
    // It stays with Jonah when the coach looks at someone else and comes back.
    await pick(u, 'Eli Brandt');
    await pick(u, 'Jonah Okafor');
    expect(code('CH-13601')).not.toBeNull();
  });

  it('131401 CH-13001 a failed assign says so and keeps the button; Retry that works finishes it, chip included', async () => {
    const u = user();
    const w = okWrites();
    vi.mocked(w.assign).mockResolvedValueOnce({ success: false, error: 'refused' }).mockResolvedValueOnce({ success: true });
    showCoach(PREVIEW_HELM_COACH, w);
    await pick(u, 'Jonah Okafor');
    await u.click(screen.getByRole('button', { name: 'Assign as focus' }));
    await expectCode('CH-13001', /Couldn’t assign the focus to Jonah/);
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(screen.getByRole('button', { name: 'Assign as focus' })).toBeTruthy();
    expect(code('CH-13601')).toBeNull();
    await u.click(within(code('CH-13001') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await expectCode('CH-13601', /Assigned as Jonah’s focus/);
    expect(w.assign).toHaveBeenCalledTimes(2);
  });

  it('130903 a player who already has an active focus on the metric is the outcome wanted: assigned, said in a toast, not an error', async () => {
    const u = user();
    const w = okWrites();
    vi.mocked(w.assign).mockResolvedValueOnce({ success: false, error: ACTIVE_FOCUS_DUPLICATE_ERROR });
    showCoach(PREVIEW_HELM_COACH, w);
    await pick(u, 'Jonah Okafor');
    await u.click(screen.getByRole('button', { name: 'Assign as focus' }));
    expect(await screen.findByText('Jonah already has a focus on this')).toBeTruthy();
    expect(code('CH-13001')).toBeNull();
    expect(code('CH-13601')).not.toBeNull();
    // Whether that focus has started is not known, so the proposal note is not claimed.
    expect(screen.queryByText(/accepts it to start/)).toBeNull();
    expect(hapticSpy).not.toHaveBeenCalledWith('error');
  });

  it('CH-13601 an insight that already has a focus made from it opens assigned, still waiting on the player', async () => {
    showCoach(PREVIEW_HELM_COACH_ASSIGNED);
    await userEvent.setup().click(screen.getByRole('button', { name: /Jonah Okafor/ }));
    expect(code('CH-13601')!.textContent).toBe('Assigned as Jonah’s focus');
    expect(screen.queryByRole('button', { name: 'Assign as focus' })).toBeNull();
    expect(screen.getByText('Jonah sees it as a proposal and accepts it to start.')).toBeTruthy();
  });

  it('130105 CH-13703 CH-13901 Dismiss: the warning comes first, then the write; the insight is replaced by a notice that says so, and the count drops', async () => {
    const u = user();
    const w = showCoach();
    await pick(u, 'Jonah Okafor');
    await u.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(hapticSpy.mock.calls.map((c) => c[0]).filter((k) => k === 'warning' || k === 'success')).toEqual(['warning', 'success']);
    expect(w.dismiss).toHaveBeenCalledWith('in-slope');
    await expectCode('CH-13901', /Insight dismissed\. It no longer shows on your board or on Jonah’s\. Undo brings it back\./);
    // The notice is a status, inside the focus's polite live region (CH-13805).
    expect(code('CH-13901')!.getAttribute('role')).toBe('status');
    expect(code('CH-13901')!.closest('[aria-live="polite"]')).not.toBeNull();
    expect(document.querySelector('.ch-hl-focus')).toBeNull();
    // Jonah still has two more signals open, so he stays in the count of players; his own count drops by the one dismissed.
    expect(screen.getByText('3 players have an open signal.')).toBeTruthy();
    const row = screen.getByRole('button', { name: /Jonah Okafor/ });
    expect(row.textContent).toBe('JOJonah OkaforDismissed2');
    // The dismissal is saved, so nothing refreshes the page away from the notice.
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('131403 Undo brings it back: the write restores the state it had, and the focus card returns', async () => {
    const u = user();
    const w = showCoach();
    await pick(u, 'Jonah Okafor');
    await u.click(screen.getByRole('button', { name: 'Dismiss' }));
    await u.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(w.undo).toHaveBeenCalledWith('in-slope', 'detected');
    await waitFor(() => expect(code('CH-13901')).toBeNull());
    expect(focusHeading()).toBe('Downhill putts from 4–6\u00a0ft: a real penalty');
    expect(screen.getByText('3 players have an open signal.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Jonah Okafor/ }).textContent).toBe('JOJonah OkaforDownhill putts from 4–6\u00a0ft: a real penalty3');
  });

  it('Undo restores the state the insight had: a matured one comes back matured', async () => {
    const u = user();
    const list = PREVIEW_HELM_COACH.players.list.map((p) => (p.name === 'Jonah Okafor' ? { ...p, top: { ...p.top, lifecycle: 'matured' as const } } : p));
    const w = showCoach({ ...PREVIEW_HELM_COACH, players: { list, error: false } });
    await pick(u, 'Jonah Okafor');
    await u.click(screen.getByRole('button', { name: 'Dismiss' }));
    await u.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(w.undo).toHaveBeenCalledWith('in-slope', 'matured');
  });

  it('CH-13403 Undo reads Undoing while it works, and nothing on the board can be tapped until it lands', async () => {
    const u = user();
    let done!: (v: { success: boolean }) => void;
    const w = okWrites();
    vi.mocked(w.undo).mockReturnValueOnce(new Promise((r) => (done = r)));
    showCoach(PREVIEW_HELM_COACH, w);
    await pick(u, 'Jonah Okafor');
    await u.click(screen.getByRole('button', { name: 'Dismiss' }));
    await u.click(await screen.findByRole('button', { name: 'Undo' }));
    const busy = await screen.findByRole('button', { name: 'Undoing…' });
    expect(busy.querySelector('[data-ch-code="CH-13403"]')).not.toBeNull();
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    done({ success: true });
    await waitFor(() => expect(code('CH-13901')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Undoing…' })).toBeNull();
  });

  it('dismissing a player’s last signal takes them out of the count of players as well as of signals', async () => {
    const u = user();
    showCoach();
    await pick(u, 'Priya Natarajan');
    await u.click(screen.getByRole('button', { name: 'Dismiss' }));
    await expectCode('CH-13901');
    expect(screen.getByText('2 players have an open signal.')).toBeTruthy();
    // P013 D12: no open signal draws no count, never a 0 beside the line.
    expect(screen.getByRole('button', { name: /Priya Natarajan/ }).textContent).toMatch(/Dismissed$/);
  });

  it('CH-13002 a failed dismiss says so and keeps the insight; Retry that works shows the notice', async () => {
    const u = user();
    const w = okWrites();
    vi.mocked(w.dismiss).mockResolvedValueOnce({ success: false, error: 'update violates row-level constraint' }).mockResolvedValueOnce({ success: true });
    showCoach(PREVIEW_HELM_COACH, w);
    await pick(u, 'Jonah Okafor');
    await u.click(screen.getByRole('button', { name: 'Dismiss' }));
    await expectCode('CH-13002', /Couldn’t dismiss the insight.*It’s still on the board/);
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(document.querySelector('.ch-hl-focus')).not.toBeNull();
    await u.click(within(code('CH-13002') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await expectCode('CH-13901');
    expect(w.dismiss).toHaveBeenCalledTimes(2);
  });

  it('CH-13003 a failed undo says so and keeps the notice; Retry that works brings the insight back', async () => {
    const u = user();
    const w = okWrites();
    vi.mocked(w.undo).mockResolvedValueOnce({ success: false, error: 'update violates row-level constraint' }).mockResolvedValueOnce({ success: true });
    showCoach(PREVIEW_HELM_COACH, w);
    await pick(u, 'Jonah Okafor');
    await u.click(screen.getByRole('button', { name: 'Dismiss' }));
    await u.click(await screen.findByRole('button', { name: 'Undo' }));
    await expectCode('CH-13003', /Couldn’t undo the dismissal.*It’s still dismissed/);
    expect(code('CH-13901')).not.toBeNull();
    await u.click(within(code('CH-13003') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(code('CH-13901')).toBeNull());
    expect(document.querySelector('.ch-hl-focus')).not.toBeNull();
    expect(w.undo).toHaveBeenCalledTimes(2);
  });

  it('writes refuse offline: nothing is sent and the coach is told, with Retry', async () => {
    const u = user();
    const w = showCoach();
    await pick(u, 'Jonah Okafor');
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    try {
      await u.click(screen.getByRole('button', { name: 'Assign as focus' }));
      await expectCode('CH-1903', /Couldn’t assign the focus to Jonah: you’re offline/);
      expect(w.assign).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    }
  });

  it('130806 a top insight that is working can be assigned as a keep-doing focus, as the board draws it on Theo (Q-80), or dismissed', async () => {
    const u = user();
    const w = okWrites();
    showCoach(PREVIEW_HELM_COACH, w);
    await pick(u, 'Theo Marchetti');
    expect(within(document.querySelector('.ch-hl-focus') as HTMLElement).getByText('Theo · Course management · Working')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'Assign as focus' }));
    expect(w.assign).toHaveBeenCalledWith(expect.objectContaining({ playerId: 'pl-theo', title: 'Double bogey-or-worse rate: 1.6%' }));
    await expectCode('CH-13601', /Assigned as Theo’s focus/);
  });

  it('CH-13310 a player with no read yet is a By player row that says so, not a footer; the unnamed are one row', () => {
    const rows = () => [...document.querySelectorAll('[data-ch-code="CH-13310"]')].map((r) => r.textContent);
    showCoach();
    // Named (owner decision, wave 6): the coach sees who to look at, not only how many.
    expect(rows()).toEqual(['SWSam WhitfieldNo reads yet']);
    expect(document.querySelector('[data-ch-code="CH-13310"]')!.closest('.ch-hl-plist')).not.toBeNull();
    // Not a button: there is nothing to open for them.
    expect(screen.queryByRole('button', { name: /Sam Whitfield/ })).toBeNull();
    cleanup();
    showCoach({ ...PREVIEW_HELM_COACH, withoutSignals: 3 });
    expect(rows()).toEqual(['SWSam WhitfieldNo reads yet', '+22 more playersNo reads yet']);
    cleanup();
    showCoach({ ...PREVIEW_HELM_COACH, withoutSignals: 2, withoutNames: ['Sam Whitfield', 'Ada Lee'] });
    expect(rows()).toEqual(['SWSam WhitfieldNo reads yet', 'ALAda LeeNo reads yet']);
    cleanup();
    showCoach({ ...PREVIEW_HELM_COACH, withoutSignals: 1, withoutNames: undefined });
    expect(rows()).toEqual(['+11 more playerNo reads yet']);
    cleanup();
    showCoach({ ...PREVIEW_HELM_COACH, withoutSignals: 0 });
    expect(rows()).toEqual([]);
    expect(screen.queryByText(/have no insights yet|has no insights yet/)).toBeNull();
  });

  it('CH-13306 players on the team but no signal yet: says what will appear, with View roster', async () => {
    showCoach(PREVIEW_HELM_COACH_EMPTY);
    await expectCode('CH-13306', /No signals yet.*Each player’s insights appear once they’ve posted enough rounds/);
    expect(screen.getByRole('link', { name: 'View roster' }).getAttribute('href')).toBe('/golf/dashboard/roster');
    expect(screen.getByText('CoachHelm reads the rounds your players post.')).toBeTruthy();
  });

  it('CH-13307 no players on the team yet: a first-run page, with Invite players (Roster’s invite sheet), as Home has', async () => {
    showCoach(PREVIEW_HELM_COACH_NO_ROSTER);
    await expectCode('CH-13307', /Add players to start CoachHelm.*Invite your players\. Each one’s insights show up here once they post rounds\./);
    expect(screen.getByRole('link', { name: 'Invite players' }).getAttribute('href')).toBe('/golf/dashboard/roster?invite=1');
    expect(screen.queryByRole('link', { name: 'Open roster' })).toBeNull();
    expect(screen.queryByText(/Since you were last here/)).toBeNull();
  });

  it('CH-13202 the players fail to load: said so, Try again asks the server again, never "no signals"; the pulse still shows', async () => {
    const u = user();
    showCoach(PREVIEW_HELM_COACH_FAILED);
    await expectCode('CH-13202', /Your players’ insights didn’t load/);
    expect(code('CH-13306')).toBeNull();
    expect(screen.getByRole('button', { name: /Since you were last here/ })).toBeTruthy();
    await u.click(within(code('CH-13202') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-13202 a failed roster read is the same error, never an empty team', () => {
    showCoach({ ...PREVIEW_HELM_COACH_NO_ROSTER, roster: { count: 0, error: true } });
    expect(code('CH-13202')).not.toBeNull();
    expect(code('CH-13307')).toBeNull();
  });

  it('CH-13203 the pulse fails to load: said in its place, the players below are unaffected', async () => {
    const u = user();
    showCoach(PREVIEW_HELM_COACH_PULSE_FAILED);
    await expectCode('CH-13203', /What’s new since you were last here didn’t load.*not affected/);
    expect(screen.getByRole('region', { name: 'By player' })).toBeTruthy();
    await u.click(within(code('CH-13203') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-13309 nothing flagged in the pulse says so, and does not claim all is well', () => {
    showCoach(PREVIEW_HELM_COACH_QUIET);
    // Visual pass 2026-10-28 (G4 row 88): the quiet line now carries the way into What's new.
    expect(code('CH-13309')!.textContent).toBe('Nothing new since you were last here. What’s new');
    expect(within(code('CH-13309') as HTMLElement).getByRole('link', { name: 'What’s new' }).getAttribute('href')).toBe('/golf/dashboard/whats-new');
  });

  it('CH-13305 CoachHelm turned off for the team: said, with a way to Settings; a global switch has none', () => {
    showCoach(PREVIEW_HELM_COACH_OFF);
    expect(code('CH-13305')!.textContent).toMatch(/CoachHelm is off.*Your team has turned CoachHelm off\. Turn it back on in Settings/);
    expect(screen.getByRole('link', { name: 'Open CoachHelm settings' }).getAttribute('href')).toBe('/golf/dashboard/settings/coaching-intelligence');
    expect(screen.queryByText(/Since you were last here/)).toBeNull();
  });

  it('CH-13305 a reason the coach wrote is quoted; a global switch names no team', () => {
    showCoach({ ...PREVIEW_HELM_COACH_OFF, off: { by: 'user', reason: 'Summer break' } });
    expect(code('CH-13305')!.textContent).toMatch(/You have turned CoachHelm off: “Summer break”/);
    showCoach({ ...PREVIEW_HELM_COACH_OFF, off: { by: 'global', reason: null } });
    const global = [...document.querySelectorAll('[data-ch-code="CH-13305"]')].at(-1)!;
    expect(global.textContent).toMatch(/turned off for GolfHelm right now/);
    expect(within(global as HTMLElement).queryByRole('link')).toBeNull();
  });

  it('CH-13204 a section that crashes while drawing is contained: the rest of the page stays', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    // A pulse row that can't be drawn throws inside the header line's own boundary only.
    showCoach({ ...PREVIEW_HELM_COACH, pulse: { rows: [{ id: 'x', headline: {} as never, evidence: 'Some evidence', tone: 'warn', icon: 'flag' }], error: false } });
    await expectCode('CH-13204', /Since you were last here couldn’t be shown/);
    expect(screen.getByRole('region', { name: 'By player' })).toBeTruthy();
    quiet.mockRestore();
  });

  it('CH-13803 CH-13806 a player row is one button; the focus wears no pill, and a medium finding no stance word (D8)', async () => {
    const u = user();
    showCoach();
    await pick(u, 'Jonah Okafor');
    expect(document.querySelector('.ch-hl-focus .ch-hl-pri')).toBeNull();
    expect(within(document.querySelector('.ch-hl-focus') as HTMLElement).getByText('Jonah · Putting')).toBeTruthy();
  });

  it('on the phone the page is its own layout: the same boards, with the players as a row of pills', () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
    try {
      showCoach();
      expect(document.querySelector('.ch-hl.is-phone')).not.toBeNull();
      expect(screen.getByRole('region', { name: 'By player' }).querySelectorAll('button.ch-hl-pl')).toHaveLength(4);
    } finally {
      window.matchMedia = real;
    }
  });

  it('the live writes are the actions the Fairway Brief uses, unchanged', async () => {
    vi.mocked(createFocusAreaFromInsightV2).mockResolvedValue({ success: true });
    vi.mocked(dismissInsight).mockResolvedValue({ success: true });
    vi.mocked(reactivateInsight).mockResolvedValue({ success: true });
    const args = { playerId: 'p1', insightId: 'i1', title: 't', description: 'd', areaType: 'putting', targetMetric: 'm' };
    await LIVE_COACHHELM_WRITES.assign(args);
    await LIVE_COACHHELM_WRITES.dismiss('i1');
    await LIVE_COACHHELM_WRITES.undo('i1', 'matured');
    expect(createFocusAreaFromInsightV2).toHaveBeenCalledWith(args);
    expect(dismissInsight).toHaveBeenCalledWith('i1');
    expect(reactivateInsight).toHaveBeenCalledWith('i1', 'matured', 'dismiss'); // CH13-14: an undone dismissal keeps an acknowledgement
  });

  it('the live answers are the actions Stats Development’s Accept and Decline call (Q-77), unchanged', async () => {
    vi.mocked(acceptFocusArea).mockResolvedValue({ success: true });
    vi.mocked(declineFocusArea).mockResolvedValue({ success: true });
    await LIVE_PLAYER_WRITES.accept('fa1');
    await LIVE_PLAYER_WRITES.decline('fa2');
    expect(acceptFocusArea).toHaveBeenCalledWith('fa1');
    expect(declineFocusArea).toHaveBeenCalledWith('fa2');
  });
});

// ── Loading ────────────────────────────────────────────────────────────────

describe('CoachHelm route skeleton', () => {
  it('CH-13401 the player’s: the focus card beside a short list, and it says it is loading', () => {
    render(<CoachHelmSkeleton view="player" />);
    const main = screen.getByRole('main', { name: 'Loading CoachHelm' });
    expect(main.getAttribute('aria-busy')).toBe('true');
    expect(main.getAttribute('data-ch-code')).toBe('CH-13401');
    expect(main.querySelector('.ch-hl-sk--player .ch-hl-sk__card')).not.toBeNull();
  });

  it('CH-13402 the coach’s: the header with its one line, then the players beside the focus card', () => {
    render(<CoachHelmSkeleton view="coach" />);
    const main = screen.getByRole('main', { name: 'Loading CoachHelm' });
    expect(main.getAttribute('data-ch-code')).toBe('CH-13402');
    expect(main.querySelector('.ch-hl-sk__pulse')).toBeNull();
    // Desktop: the focus's claim is the green card it lands as, beside the players' rows (mocked desktop here).
    expect(main.querySelector('.ch-hl-sk--coach .ch-hl-sk__claim.ch-hl-focus__head')).not.toBeNull();
    expect(main.querySelectorAll('.ch-hl-sk--coach .ch-hl-sk__p').length).toBeGreaterThanOrEqual(4);
  });

  it('130204 the route’s skeleton takes the signed-in role’s shape, and the player’s until it is known', () => {
    const user = (role: 'coach' | 'player') => ({ role, userId: 'u', name: 'X' });
    const { unmount } = render(
      <GolfUserProvider userData={user('coach')}>
        <CoachHelmRouteSkeleton />
      </GolfUserProvider>,
    );
    expect(code('CH-13402')).not.toBeNull();
    unmount();
    render(<CoachHelmRouteSkeleton />);
    expect(code('CH-13401')).not.toBeNull();
  });

  it('the route’s skeleton is the view the address names, as the route decides it, so a hard load draws one shape, not the board’s and then the view’s', () => {
    const q = (s: string) => new URLSearchParams(s);
    // The coach's: Ask; a player's Deep dive or Standing only with the player; the board for the rest (the flagged views too).
    expect(routeSkeletonFor('coach', q('view=ask'))).toBe('ask');
    expect(routeSkeletonFor('coach', q('view=deep-dive&player=p1'))).toBe('coach-deep-dive');
    expect(routeSkeletonFor('coach', q('view=standing&player=p1'))).toBe('coach-standing');
    expect(routeSkeletonFor('coach', q('view=profile&player=p1'))).toBe('coach-standing');
    expect(routeSkeletonFor('coach', q('view=deep-dive'))).toBe('coach');
    for (const view of ['track-record', 'monday-brief', 'brief', 'nonsense', '']) expect(routeSkeletonFor('coach', q(`view=${view}`))).toBe('coach');
    expect(routeSkeletonFor('coach', null)).toBe('coach');
    // The player's own: Standing (and its old address) and the Deep dive; a player's ?view=ask is their board, as the route draws it.
    expect(routeSkeletonFor('player', q('view=standing'))).toBe('standing');
    expect(routeSkeletonFor('player', q('view=profile'))).toBe('standing');
    expect(routeSkeletonFor('player', q('view=deep-dive&player=x'))).toBe('deep-dive');
    expect(routeSkeletonFor('player', q('view=ask'))).toBe('player');
    // Before the shell knows who is signed in: the player's shapes.
    expect(routeSkeletonFor(undefined, q('view=ask'))).toBe('player');
  });

  it('130204 a coach’s hard load of Ask draws Ask’s skeleton from the route’s loading file, and of a player’s Deep dive the Deep dive’s', () => {
    const coach = { role: 'coach' as const, userId: 'u', name: 'X' };
    try {
      search.current = new URLSearchParams('view=ask');
      const { unmount } = render(
        <GolfUserProvider userData={coach}>
          <CoachHelmRouteSkeleton />
        </GolfUserProvider>,
      );
      expect(code('CH-13420')).not.toBeNull();
      expect(code('CH-13402')).toBeNull();
      unmount();
      search.current = new URLSearchParams('view=deep-dive&player=p1');
      render(
        <GolfUserProvider userData={coach}>
          <CoachHelmRouteSkeleton />
        </GolfUserProvider>,
      );
      expect(code('CH-13480')).not.toBeNull();
      expect(screen.getByRole('main', { name: 'Loading this player’s deep dive' })).toBeTruthy();
    } finally {
      search.current = new URLSearchParams();
    }
  });
});

// ── The loaders ────────────────────────────────────────────────────────────

describe('CoachHelm loaders', () => {
  type Filters = Array<[string, unknown[]]>;
  const on = { userEnabled: true, teamEnabled: true, effectivelyEnabled: true, disabledReason: null, disabledBy: null } as const;
  const filter = (f: Filters, key: string, col: string) => f.find(([k, a]) => k === key && a[0] === col)?.[1][1];
  const pulse = (items: Array<{ id: string; headline: string; evidence: string; tone: 'attention' | 'neutral' | 'positive'; weight: number }>) => ({
    items,
    latest_round_at: null,
    players_without_rounds: 0,
    players_with_recent_rounds: 4,
    recent_window_days: 30,
    active_roster: 4,
    as_of: '2026-10-14T12:00:00Z',
  });

  describe('the player', () => {
    const p1 = 'pl-jonah';
    beforeEach(() => {
      vi.mocked(isCoachHelmEnabledForPlayer).mockResolvedValue({ ...on });
    });

    it('their feed, ranked as the feed ranks it, each insight with its drill’s description', async () => {
      vi.mocked(getInsightsForPlayer).mockResolvedValue([slope(p1), bigNumber(p1)]);
      tables.current = { golf_drills: { data: [{ id: 'dr-ladder', description: 'Start 2 ft below the hole.' }] } };
      const d = await loadPlayerCoachHelm({ playerId: p1 });
      expect(getInsightsForPlayer).toHaveBeenCalledWith(p1, { limit: 30, drawnLater: expect.any(Function), includeMore: true }); // CH13-21: only drawn cards count as shown
      expect(d.off).toBeNull();
      expect(d.insights.error).toBe(false);
      expect(d.insights.list.map((i) => i.id)).toEqual(['in-slope', 'in-dbl']);
      expect(d.insights.list[0]!.week).toEqual({ title: 'Downhill ladder', text: 'Start 2\u00a0ft below the hole.', meta: '12 min · intermediate' });
      await expect(vi.mocked(getInsightsForPlayer).mock.calls.at(-1)![1]!.drawnLater!([])).resolves.toEqual(['in-slope', 'in-dbl']);
    });

    it('CH13-21 only the reads the Board draws are counted as shown: the focus and two more, not the other nine', async () => {
      const feed = Array.from({ length: 12 }, (_, n) => ({ ...slope(p1), id: `f${n}` }));
      vi.mocked(getInsightsForPlayer).mockResolvedValue(feed);
      const d = await loadPlayerCoachHelm({ playerId: p1 });
      expect(d.insights.list).toHaveLength(12);
      await expect(vi.mocked(getInsightsForPlayer).mock.calls.at(-1)![1]!.drawnLater!(feed)).resolves.toEqual(['f0', 'f1', 'f2']);
    });

    it('CH13-21 a Board with nothing drawn counts nothing as shown', async () => {
      vi.mocked(getInsightsForPlayer).mockResolvedValue([]);
      tables.current = { golf_coach_insights: { data: [] }, golf_insight_player_feedback: { data: [] } };
      await loadPlayerCoachHelm({ playerId: p1 });
      await expect(vi.mocked(getInsightsForPlayer).mock.calls.at(-1)![1]!.drawnLater!([])).resolves.toEqual([]);
    });

    it('a failed drill read keeps the drill’s name and length, and is logged', async () => {
      vi.mocked(getInsightsForPlayer).mockResolvedValue([slope(p1)]);
      tables.current = { golf_drills: { error: { message: 'boom' } } };
      const d = await loadPlayerCoachHelm({ playerId: p1 });
      expect(d.insights.list[0]!.week).toEqual({ title: 'Downhill ladder', text: null, meta: '12 min · intermediate' });
      expect(logServer).toHaveBeenCalledWith('coachhelm', 'drills', expect.anything(), 'coachhelm');
    });

    it('CH-13304 turned off by the coach: nothing else is read; the coach’s reason is kept, a default one is not', async () => {
      vi.mocked(isCoachHelmEnabledForPlayer).mockResolvedValueOnce({ ...on, effectivelyEnabled: false, disabledBy: 'coach', disabledReason: 'Off for the offseason' });
      expect((await loadPlayerCoachHelm({ playerId: p1 })).off).toEqual({ reason: 'Off for the offseason' });
      vi.mocked(isCoachHelmEnabledForPlayer).mockResolvedValueOnce({ ...on, effectivelyEnabled: false, disabledBy: 'coach', disabledReason: 'Disabled by coach' });
      expect((await loadPlayerCoachHelm({ playerId: p1 })).off).toEqual({ reason: null });
      vi.mocked(isCoachHelmEnabledForPlayer).mockResolvedValueOnce({ ...on, effectivelyEnabled: false, disabledBy: null, disabledReason: 'CoachHelm is disabled globally' });
      expect((await loadPlayerCoachHelm({ playerId: p1 })).off).toEqual({ reason: null });
      expect(getInsightsForPlayer).not.toHaveBeenCalled();
    });

    it('CH-13201 a failed gate lookup is a failed read, not "off"', async () => {
      vi.mocked(isCoachHelmEnabledForPlayer).mockResolvedValueOnce({ ...on, effectivelyEnabled: false, disabledBy: null, disabledReason: 'Player record lookup failed' });
      expect(await loadPlayerCoachHelm({ playerId: p1 })).toMatchObject({ off: null, insights: { list: [], error: true } });
      vi.mocked(isCoachHelmEnabledForPlayer).mockRejectedValueOnce(new Error('boom'));
      expect((await loadPlayerCoachHelm({ playerId: p1 })).insights.error).toBe(true);
    });

    it('CH-13201 a feed that throws is an error, logged', async () => {
      vi.mocked(getInsightsForPlayer).mockRejectedValue(new Error('boom'));
      expect((await loadPlayerCoachHelm({ playerId: p1 })).insights).toEqual({ list: [], error: true });
      expect(logServer).toHaveBeenCalledWith('coachhelm', 'feed', expect.anything(), 'coachhelm');
    });

    it('130411 CH-13201 an empty feed with insights on file is the feed having failed (it answers [] on failure), never a first run', async () => {
      vi.mocked(getInsightsForPlayer).mockResolvedValue([]);
      tables.current = { golf_coach_insights: { data: [slope(p1)] }, golf_insight_player_feedback: { data: [] } };
      expect((await loadPlayerCoachHelm({ playerId: p1 })).insights).toEqual({ list: [], error: true });
    });

    it('CH-13201 an empty feed whose visible read fails is an error, and so is a failed feedback read', async () => {
      vi.mocked(getInsightsForPlayer).mockResolvedValue([]);
      tables.current = { golf_coach_insights: { error: { message: 'boom' } }, golf_insight_player_feedback: { data: [] } };
      expect((await loadPlayerCoachHelm({ playerId: p1 })).insights.error).toBe(true);
      tables.current = { golf_coach_insights: { data: [] }, golf_insight_player_feedback: { error: { message: 'boom' } } };
      expect((await loadPlayerCoachHelm({ playerId: p1 })).insights.error).toBe(true);
    });

    it('an empty feed where the player dismissed every insight themselves is not a failure', async () => {
      vi.mocked(getInsightsForPlayer).mockResolvedValue([]);
      tables.current = {
        golf_coach_insights: { data: [slope(p1)] },
        // The newest feedback per insight decides: dismissed last.
        golf_insight_player_feedback: {
          data: [
            { insight_id: 'in-slope', rating: 'dismissed', created_at: '2026-10-13' },
            { insight_id: 'in-slope', rating: 'helpful', created_at: '2026-10-01' },
          ],
        },
        golf_rounds: { data: [] },
      };
      expect((await loadPlayerCoachHelm({ playerId: p1 })).insights).toEqual({ list: [], error: false });
    });

    it('an insight the player un-dismissed, or a row the feed could not draw, counts as the right thing: only a drawable, undismissed one means failure', async () => {
      vi.mocked(getInsightsForPlayer).mockResolvedValue([]);
      const undrawable = { ...slope(p1), evidence: { ...slope(p1).evidence, confidence: null } };
      tables.current = { golf_coach_insights: { data: [undrawable] }, golf_insight_player_feedback: { data: [] }, golf_rounds: { data: [] } };
      expect((await loadPlayerCoachHelm({ playerId: p1 })).insights.error).toBe(false);
      tables.current = {
        golf_coach_insights: { data: [slope(p1)] },
        // Newest first, as the read asks for: dismissed once, then rated helpful, so it is no longer dismissed.
        golf_insight_player_feedback: (f) => {
          expect(f.find(([k]) => k === 'order')?.[1]).toEqual(['created_at', { ascending: false }]);
          return {
            data: [
              { insight_id: 'in-slope', rating: 'helpful', created_at: '2026-10-13' },
              { insight_id: 'in-slope', rating: 'dismissed', created_at: '2026-10-01' },
            ],
          };
        },
      };
      expect((await loadPlayerCoachHelm({ playerId: p1 })).insights.error).toBe(true);
    });

    it('CH-13301 CH-13302 a real first run counts the countable rounds posted, so the empty state can say what to do', async () => {
      vi.mocked(getInsightsForPlayer).mockResolvedValue([]);
      const ok = { total_score: 74, front_nine: 36, back_nine: 38, holes_played: 18, total_putts: 30 };
      tables.current = {
        golf_coach_insights: { data: [] },
        golf_insight_player_feedback: { data: [] },
        golf_rounds: (f) => {
          expect(filter(f, 'eq', 'player_id')).toBe(p1);
          expect(filter(f, 'eq', 'is_test')).toBe(false);
          expect(filter(f, 'eq', 'status')).toBe('completed');
          // Two that count; the 37-stroke 18-hole round and a hole-less one don't.
          return {
            data: [
              { id: 'a', ...ok },
              { id: 'b', ...ok },
              { id: 'c', total_score: 37, front_nine: 18, back_nine: 19, holes_played: 18, total_putts: 18 },
              { id: 'd', ...ok, front_nine: null, back_nine: null },
            ],
          };
        },
      };
      // Beside the count, the rounds still to go before the pattern miner reads (its floor, the coach's 5 here, less the countable 2).
      expect(await loadPlayerCoachHelm({ playerId: p1 })).toEqual({ off: null, proposals: { list: [], error: false }, insights: { list: [], error: false }, rounds: 2, roundsToGo: 3 });
      tables.current = { ...tables.current, golf_rounds: { data: [] } };
      expect((await loadPlayerCoachHelm({ playerId: p1 })).rounds).toBe(0);
      tables.current = { ...tables.current, golf_rounds: { error: { message: 'boom' } } };
      const unknown = await loadPlayerCoachHelm({ playerId: p1 });
      expect(unknown.rounds).toBeNull();
      expect(unknown.insights.error).toBe(false);
    });

    describe('the Tour their insights are drawn against (Q-88)', () => {
      const standards = (asked: string[]) => (f: Filters) => {
        const tour = filter(f, 'eq', 'tour') as string;
        asked.push(tour);
        return { data: [{ metric_id: 'penalty_rate_per_round', pga_tour_value: tour === 'lpga' ? 0.4 : 0.3 }] };
      };
      const gaugeOf = async () => (await loadPlayerCoachHelm({ playerId: p1 })).insights.list[0]!.evidence.gauge;
      beforeEach(() => {
        vi.mocked(getInsightsForPlayer).mockResolvedValue([penalties(p1)]);
      });

      it('a men’s team is graded against the PGA Tour rows, and only those are read', async () => {
        const asked: string[] = [];
        tables.current = { golf_team_members: { data: { team_id: 't1', golf_teams: { gender: 'mens' } } }, golf_pga_standards: standards(asked), golf_player_focus_areas: { data: [] } };
        expect(await gaugeOf()).toMatchObject({ cmp: 'Tour 0.3', sec: null });
        expect(asked).toEqual(['pga']);
      });

      it('a women’s team is graded against the LPGA rows, never the men’s', async () => {
        const asked: string[] = [];
        tables.current = { golf_team_members: { data: { team_id: 't1', golf_teams: { gender: 'womens' } } }, golf_pga_standards: standards(asked), golf_player_focus_areas: { data: [] } };
        expect(await gaugeOf()).toMatchObject({ cmp: 'LPGA Tour 0.4', sec: null });
        expect(asked).toEqual(['lpga']);
      });

      it('a player with no team has no tour, so nothing is claimed: no Tour read and no comparison', async () => {
        const asked: string[] = [];
        tables.current = { golf_team_members: { data: null }, golf_pga_standards: standards(asked) };
        expect(await gaugeOf()).toBeNull();
        expect(asked).toEqual([]);
      });

      it('a team read that fails is logged and claims no benchmark, and the insights still load', async () => {
        const asked: string[] = [];
        tables.current = { golf_team_members: { error: { message: 'boom' } }, golf_pga_standards: standards(asked) };
        const d = await loadPlayerCoachHelm({ playerId: p1 });
        expect(d.insights.error).toBe(false);
        expect(d.insights.list[0]!.evidence.gauge).toBeNull();
        expect(asked).toEqual([]);
        expect(logServer).toHaveBeenCalledWith('coachhelm', 'playerTeam', expect.anything(), 'coachhelm');
      });

      it('a Tour read that fails is logged and draws no comparison', async () => {
        tables.current = { golf_team_members: { data: { team_id: 't1', golf_teams: { gender: 'mens' } } }, golf_pga_standards: { error: { message: 'boom' } }, golf_player_focus_areas: { data: [] } };
        expect(await gaugeOf()).toBeNull();
        expect(logServer).toHaveBeenCalledWith('coachhelm', 'tourBenchmarks', expect.anything());
      });
    });

    describe('the focus areas proposed to them (Q-77)', () => {
      const team = { data: { team_id: 't1', golf_teams: { gender: 'mens' } } };
      it('their own proposed focus areas on their team, newest first, each with the insight it came from when that insight is on the page', async () => {
        vi.mocked(getInsightsForPlayer).mockResolvedValue([slope(p1)]);
        const seen: Filters[] = [];
        tables.current = {
          golf_team_members: team,
          // The proposing coach's account, for "Tell coach why" (wave 7, decision C).
          golf_coaches: { data: [{ id: 'c1', user_id: 'u-c1' }] },
          golf_player_focus_areas: (f) => {
            seen.push(f);
            return {
              data: [
                { id: 'fa-ladder', title: 'Downhill putts inside 6 ft', from_insight_id: 'in-slope', coach_id: 'c1', created_at: '2026-10-12T14:00:00Z' },
                { id: 'fa-lag', title: 'Lag putting from 30 ft', from_insight_id: null, created_at: '2026-10-10T14:00:00Z' },
                { id: 'fa-gone', title: 'From an insight no longer on the page', from_insight_id: 'in-old', created_at: '2026-10-09T14:00:00Z' },
              ],
            };
          },
        };
        const d = await loadPlayerCoachHelm({ playerId: p1 });
        expect(d.proposals).toEqual({
          list: [
            { id: 'fa-ladder', title: 'Downhill putts inside 6 ft', from: 'Downhill putts from 4–6\u00a0ft: a real penalty', coachUserId: 'u-c1' },
            { id: 'fa-lag', title: 'Lag putting from 30 ft', from: null, coachUserId: null },
            { id: 'fa-gone', title: 'From an insight no longer on the page', from: null, coachUserId: null },
          ],
          error: false,
        });
        // Only this player's, on this team or on none, that still wait for an answer (CH13-5).
        const read = seen.find((f) => filter(f, 'eq', 'player_id') === p1)!;
        expect(read.find(([k]) => k === 'or')![1]).toEqual(['team_id.is.null,team_id.eq.t1']);
        expect(filter(read, 'eq', 'team_id')).toBeUndefined();
        expect(filter(read, 'eq', 'status')).toBe('proposed');
        expect(read.find(([k]) => k === 'order')![1]).toEqual(['created_at', { ascending: false }]);
      });

      it('a first run still says what was proposed: no insights yet is not "nothing waiting"', async () => {
        vi.mocked(getInsightsForPlayer).mockResolvedValue([]);
        tables.current = {
          golf_team_members: team,
          golf_coach_insights: { data: [] },
          golf_insight_player_feedback: { data: [] },
          golf_rounds: { data: [] },
          golf_player_focus_areas: { data: [{ id: 'fa-lag', title: 'Lag putting from 30 ft', from_insight_id: null, created_at: null }] },
        };
        const d = await loadPlayerCoachHelm({ playerId: p1 });
        expect(d.insights).toEqual({ list: [], error: false });
        expect(d.proposals).toEqual({ list: [{ id: 'fa-lag', title: 'Lag putting from 30 ft', from: null, coachUserId: null }], error: false });
      });

      it('a player with no team has nothing proposed to them, and none is read', async () => {
        vi.mocked(getInsightsForPlayer).mockResolvedValue([slope(p1)]);
        const asked: Filters[] = [];
        tables.current = {
          golf_team_members: { data: null },
          golf_player_focus_areas: (f) => {
            asked.push(f);
            return { data: [{ id: 'x', title: 'x', from_insight_id: null }] };
          },
        };
        expect((await loadPlayerCoachHelm({ playerId: p1 })).proposals).toEqual({ list: [], error: false });
        // The proposals are not read (the focus areas made from the insights on the page are: those are by insight, not by player).
        expect(asked.filter((f) => filter(f, 'eq', 'player_id') !== undefined)).toEqual([]);
      });

      it('CH-13205 a failed read is an error, logged, never "nothing proposed", and the insights still load', async () => {
        vi.mocked(getInsightsForPlayer).mockResolvedValue([slope(p1)]);
        tables.current = { golf_team_members: team, golf_player_focus_areas: { error: { message: 'boom' } } };
        const d = await loadPlayerCoachHelm({ playerId: p1 });
        expect(d.proposals).toEqual({ list: [], error: true });
        expect(d.insights.error).toBe(false);
        expect(logServer).toHaveBeenCalledWith('coachhelm', 'proposals', expect.anything(), 'coachhelm');
      });

      it('CH-13205 a team that could not be read leaves what was proposed unknown, and says so', async () => {
        vi.mocked(getInsightsForPlayer).mockResolvedValue([slope(p1)]);
        tables.current = { golf_team_members: { error: { message: 'boom' } }, golf_player_focus_areas: { data: [] } };
        expect((await loadPlayerCoachHelm({ playerId: p1 })).proposals).toEqual({ list: [], error: true });
      });

      it('CoachHelm off for them reads nothing else, proposals included', async () => {
        vi.mocked(isCoachHelmEnabledForPlayer).mockResolvedValue({ ...on, effectivelyEnabled: false, disabledBy: 'coach', disabledReason: 'Off for the offseason' });
        const asked: Filters[] = [];
        tables.current = {
          golf_team_members: (f) => {
            asked.push(f);
            return team;
          },
          golf_player_focus_areas: (f) => {
            asked.push(f);
            return { data: [] };
          },
        };
        const d = await loadPlayerCoachHelm({ playerId: p1 });
        expect(d.proposals).toEqual({ list: [], error: false });
        expect(asked).toEqual([]);
      });
    });
  });

  describe('the coach', () => {
    const jonah = HELM_PLAYERS.jonah;
    const eli = HELM_PLAYERS.eli;
    const members = { data: [{ player_id: jonah.id }, { player_id: eli.id }] };
    const people = {
      data: [
        { id: eli.id, first_name: 'Eli', last_name: 'Brandt' },
        { id: jonah.id, first_name: 'Jonah', last_name: 'Okafor' },
      ],
    };
    const rows = [slope(jonah.id), bigNumber(jonah.id, 'in-dbl'), penalties(eli.id, 'in-pen-eli')];
    const seen: Filters[] = [];
    beforeEach(() => {
      seen.length = 0;
      vi.mocked(isCoachHelmEnabledForCoach).mockResolvedValue({ ...on });
      vi.mocked(getTopInsightsForPlayers).mockResolvedValue(
        new Map([
          [jonah.id, [slope(jonah.id)]],
          [eli.id, [penalties(eli.id, 'in-pen-eli')]],
        ]),
      );
      vi.mocked(getCoachProgramPulse).mockResolvedValue(
        pulse([
          { id: 'movement-decline', headline: '2 players are scoring worse over their last three rounds', evidence: 'Jonah Okafor +2.1', tone: 'attention', weight: 80 },
          { id: 'signals-open', headline: '3 open signals across 2 players', evidence: 'x', tone: 'neutral', weight: 70 },
        ]),
      );
      tables.current = {
        golf_team_members: (f) => {
          seen.push(f);
          return members;
        },
        golf_players: people,
        golf_coach_insights: (f) => {
          seen.push(f);
          return { data: rows };
        },
        golf_drills: { data: [{ id: 'dr-ladder', description: 'Start 2 ft below the hole.' }] },
        golf_player_focus_areas: { data: [{ from_insight_id: 'in-slope', status: 'proposed' }] },
      };
    });

    it('130802 the team’s players only, each with their top insight and how many signals they have; the pulse without the signals item', async () => {
      const d = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
      expect(isCoachHelmEnabledForCoach).toHaveBeenCalledWith('c1');
      // Only this team's active members are asked for, and only their ids reach every insight read.
      expect(filter(seen[0]!, 'eq', 'team_id')).toBe('t1');
      expect(filter(seen[0]!, 'eq', 'status')).toBe('active');
      const [askedIds, askedOpts] = vi.mocked(getTopInsightsForPlayers).mock.calls[0]!;
      expect([...askedIds].sort()).toEqual([eli.id, jonah.id]);
      expect(askedOpts).toEqual({ limit: 1 });
      expect([...(filter(seen[1]!, 'in', 'player_id') as string[])].sort()).toEqual([eli.id, jonah.id]);
      expect(d.off).toBeNull();
      expect(d.roster).toEqual({ count: 2, error: false });
      expect(d.players.error).toBe(false);
      // Eli's high-priority top insight leads; Jonah has two signals (the slope finding and one strength).
      expect(d.players.list.map((p) => [p.name, p.count, p.top.id])).toEqual([
        ['Eli Brandt', 1, 'in-pen-eli'],
        ['Jonah Okafor', 2, 'in-slope'],
      ]);
      expect(d.withoutSignals).toBe(0);
      expect((await pulseLanded(d)).rows.map((r) => r.id)).toEqual(['movement-decline']);
    });

    it('a focus area already made from the top insight, and the drill’s description, come with it', async () => {
      const d = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
      const top = d.players.list.find((p) => p.id === jonah.id)!.top;
      expect(top.assigned).toBe('proposed');
      expect(top.week?.text).toBe('Start 2\u00a0ft below the hole.');
      expect(d.players.list.find((p) => p.id === eli.id)!.top.assigned).toBeNull();
    });

    it('only focus areas that still stand count: one that has started, is in progress or paused reads as active, and beats a proposal of the same insight, in either order', async () => {
      const asked: unknown[] = [];
      const answer = (rows: Array<{ from_insight_id: string | null; status: string }>) => (f: Filters) => {
        asked.push(f.find(([k, a]) => k === 'in' && a[0] === 'status')?.[1][1]);
        return { data: rows };
      };
      tables.current = {
        ...tables.current,
        golf_player_focus_areas: answer([
          { from_insight_id: 'in-slope', status: 'proposed' },
          { from_insight_id: 'in-slope', status: 'in_progress' },
          { from_insight_id: 'in-pen-eli', status: 'paused' },
          { from_insight_id: null, status: 'active' },
        ]),
      };
      let d = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
      expect(d.players.list.map((p) => [p.name, p.top.assigned])).toEqual([
        ['Eli Brandt', 'active'],
        ['Jonah Okafor', 'active'],
      ]);
      tables.current = {
        ...tables.current,
        golf_player_focus_areas: answer([
          { from_insight_id: 'in-slope', status: 'in_progress' },
          { from_insight_id: 'in-slope', status: 'proposed' },
        ]),
      };
      d = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
      expect(d.players.list.find((p) => p.id === jonah.id)!.top.assigned).toBe('active');
      // Only the statuses that still stand are asked for: a declined or completed focus no longer blocks Assign.
      expect(asked[0]).toEqual(['proposed', 'active', 'in_progress', 'paused']);
    });

    it('a failed focus-area read leaves Assign available and is logged; the server’s duplicate guard still holds', async () => {
      tables.current = { ...tables.current, golf_player_focus_areas: { error: { message: 'boom' } } };
      const d = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
      expect(d.players.list.every((p) => p.top.assigned === null)).toBe(true);
      expect(logServer).toHaveBeenCalledWith('coachhelm', 'assigned', expect.anything(), 'coachhelm');
    });

    it('counts a player’s signals as the feed would draw them: par scoring rows collapse into one, the same subject once', async () => {
      const par = (n: number) => ({ ...bigNumber(jonah.id, `par${n}`), category: 'scoring' as const, evidence: { ...bigNumber(jonah.id).evidence, metric: `scoring_par_${n}` } });
      tables.current = { ...tables.current, golf_coach_insights: { data: [slope(jonah.id), par(3), par(4), par(5), { ...slope(jonah.id, 'in-slope-dup') }] } };
      const d = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
      expect(d.players.list.find((p) => p.id === jonah.id)!.count).toBe(2);
    });

    it('CH-13306 players with no insight yet: an empty list, every one counted as without', async () => {
      vi.mocked(getTopInsightsForPlayers).mockResolvedValue(new Map());
      tables.current = { ...tables.current, golf_coach_insights: { data: [] } };
      const d = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
      expect(d.players).toEqual({ list: [], error: false });
      expect(d.withoutSignals).toBe(2);
    });

    it('CH-13310 a player with no insight is counted as without, beside those who have one', async () => {
      vi.mocked(getTopInsightsForPlayers).mockResolvedValue(new Map([[jonah.id, [slope(jonah.id)]]]));
      tables.current = { ...tables.current, golf_coach_insights: { data: [slope(jonah.id)] } };
      const d = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
      expect(d.players.list.map((p) => p.name)).toEqual(['Jonah Okafor']);
      expect(d.withoutSignals).toBe(1);
    });

    it('CH-13202 heads that come back empty while insights are on file are the read having failed (the action answers an empty map), never "no signals"', async () => {
      vi.mocked(getTopInsightsForPlayers).mockResolvedValue(new Map());
      const d = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
      expect(d.players).toEqual({ list: [], error: true });
      expect(d.roster.error).toBe(false);
      vi.mocked(getTopInsightsForPlayers).mockRejectedValueOnce(new Error('boom'));
      expect((await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' })).players.error).toBe(true);
    });

    it('CH-13202 a failed visible read is an error, logged', async () => {
      tables.current = { ...tables.current, golf_coach_insights: { error: { message: 'boom' } } };
      expect((await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' })).players.error).toBe(true);
      expect(logServer).toHaveBeenCalledWith('coachhelm', 'visible', expect.anything(), 'coachhelm');
    });

    it('CH-13202 a failed roster read is an error (never an empty team), and the pulse still loads', async () => {
      tables.current = { ...tables.current, golf_team_members: { error: { message: 'boom' } } };
      const d = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
      expect(d.roster).toEqual({ count: 0, error: true });
      expect((await pulseLanded(d)).error).toBe(false);
      expect(logServer).toHaveBeenCalledWith('coachhelm', 'roster', expect.anything(), 'coachhelm');
      tables.current = { ...tables.current, golf_team_members: members, golf_players: { error: { message: 'boom' } } };
      expect((await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' })).roster.error).toBe(true);
    });

    it('CH-13307 a team with no active players is a real empty roster: nothing else is read', async () => {
      tables.current = { ...tables.current, golf_team_members: { data: [] } };
      const d = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
      expect(d.roster).toEqual({ count: 0, error: false });
      expect(getTopInsightsForPlayers).not.toHaveBeenCalled();
    });

    it('CH-13203 a pulse that could not be read is its own failure', async () => {
      vi.mocked(getCoachProgramPulse).mockResolvedValue(null);
      const d = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
      expect(await pulseLanded(d)).toEqual({ rows: [], error: true });
      expect(d.players.error).toBe(false);
    });

    it('CH-13305 turned off by the coach, the team, or globally: nothing else is read; a default reason is dropped', async () => {
      vi.mocked(isCoachHelmEnabledForCoach).mockResolvedValueOnce({ ...on, effectivelyEnabled: false, disabledBy: 'team', disabledReason: 'Summer break' });
      expect((await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' })).off).toEqual({ by: 'team', reason: 'Summer break' });
      vi.mocked(isCoachHelmEnabledForCoach).mockResolvedValueOnce({ ...on, effectivelyEnabled: false, disabledBy: 'user', disabledReason: 'Disabled by user' });
      expect((await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' })).off).toEqual({ by: 'user', reason: null });
      vi.mocked(isCoachHelmEnabledForCoach).mockResolvedValueOnce({ ...on, effectivelyEnabled: false, disabledBy: null, disabledReason: 'CoachHelm is disabled globally' });
      expect((await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' })).off).toEqual({ by: 'global', reason: null });
      expect(getTopInsightsForPlayers).not.toHaveBeenCalled();
    });

    it('CH-13202 a failed gate lookup is a failed read, not "off"', async () => {
      vi.mocked(isCoachHelmEnabledForCoach).mockResolvedValueOnce({ ...on, effectivelyEnabled: false, disabledBy: null, disabledReason: 'Coach record lookup failed' });
      vi.mocked(getCoachProgramPulse).mockClear();
      const failed = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
      expect(failed).toMatchObject({ off: null, roster: { error: true } });
      // The pulse still reads (CH-13309 is never drawn over an unread pulse).
      expect(getCoachProgramPulse).toHaveBeenCalledTimes(1);
      vi.mocked(isCoachHelmEnabledForCoach).mockRejectedValueOnce(new Error('gate down'));
      vi.mocked(getCoachProgramPulse).mockClear();
      expect(await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' })).toMatchObject({ off: null, roster: { error: true } });
      expect(getCoachProgramPulse).toHaveBeenCalledTimes(1);
    });

    describe('the Tour their players’ insights are drawn against (Q-88)', () => {
      const standards = (asked: string[]) => (f: Filters) => {
        const tour = filter(f, 'eq', 'tour') as string;
        asked.push(tour);
        return { data: [{ metric_id: 'penalty_rate_per_round', pga_tour_value: tour === 'lpga' ? 0.4 : 0.3 }] };
      };
      const eliGauge = async () => (await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' })).players.list.find((p) => p.id === eli.id)!.top.evidence.gauge;

      it('the team’s own tour, read for the team the coach is working in: men’s the PGA rows, women’s the LPGA rows', async () => {
        const asked: string[] = [];
        const teamsAsked: Filters[] = [];
        tables.current = {
          ...tables.current,
          golf_teams: (f) => {
            teamsAsked.push(f);
            return { data: { gender: 'mens' } };
          },
          golf_pga_standards: standards(asked),
        };
        expect(await eliGauge()).toMatchObject({ cmp: 'Tour 0.3', sec: null });
        expect(filter(teamsAsked[0]!, 'eq', 'id')).toBe('t1');
        tables.current = { ...tables.current, golf_teams: { data: { gender: 'womens' } } };
        expect(await eliGauge()).toMatchObject({ cmp: 'LPGA Tour 0.4', sec: null });
        expect(asked).toEqual(['pga', 'lpga']);
      });

      it('a team row that cannot be read claims no benchmark: it is logged, no Tour is read, and the players still load', async () => {
        const asked: string[] = [];
        tables.current = { ...tables.current, golf_teams: { error: { message: 'boom' } }, golf_pga_standards: standards(asked) };
        const d = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
        expect(d.players.error).toBe(false);
        expect(d.players.list.find((p) => p.id === eli.id)!.top.evidence.gauge).toBeNull();
        expect(asked).toEqual([]);
        expect(logServer).toHaveBeenCalledWith('coachhelm', 'team', expect.anything(), 'coachhelm');
      });

      it('a metric the tour has no value for draws no comparison', async () => {
        tables.current = {
          ...tables.current,
          golf_teams: { data: { gender: 'mens' } },
          golf_pga_standards: { data: [{ metric_id: 'sg_total', pga_tour_value: 0.1 }, { metric_id: 'penalty_rate_per_round', pga_tour_value: null }] },
        };
        expect(await eliGauge()).toBeNull();
      });
    });
  });
});

// ── The route ──────────────────────────────────────────────────────────────

describe('CoachHelm route', () => {
  const on = { userEnabled: true, teamEnabled: true, effectivelyEnabled: true, disabledReason: null, disabledBy: null } as const;
  beforeEach(() => {
    vi.mocked(isCoachHelmEnabledForCoach).mockResolvedValue({ ...on });
    vi.mocked(isCoachHelmEnabledForPlayer).mockResolvedValue({ ...on });
    vi.mocked(getCoachProgramPulse).mockResolvedValue({
      items: [],
      latest_round_at: null,
      players_without_rounds: 0,
      players_with_recent_rounds: 0,
      recent_window_days: 30,
      active_roster: 1,
      as_of: '2026-10-14T12:00:00Z',
    });
    vi.mocked(getTopInsightsForPlayers).mockResolvedValue(new Map([['pl-jonah', [slope('pl-jonah')]]]));
    vi.mocked(getInsightsForPlayer).mockResolvedValue([slope('pl-jonah')]);
    tables.current = {
      golf_team_members: { data: [{ player_id: 'pl-jonah' }] },
      golf_players: { data: [{ id: 'pl-jonah', first_name: 'Jonah', last_name: 'Okafor' }] },
      golf_coach_insights: { data: [slope('pl-jonah')] },
      golf_drills: { data: [] },
      golf_player_focus_areas: { data: [] },
    };
  });

  it('a coach gets their board for the team the shell resolved; a player gets their own', async () => {
    session.current = { userId: 'u1', role: 'coach', coach: { id: 'c1', organization_id: 'org1' }, player: null };
    teamOf.current = { role: 'coach', teamId: 't1', coachId: 'c1' };
    let askedTeam: unknown;
    tables.current = {
      ...tables.current,
      golf_team_members: (f) => {
        askedTeam = f.find(([k, a]) => k === 'eq' && a[0] === 'team_id')?.[1][1];
        return { data: [{ player_id: 'pl-jonah' }] };
      },
    };
    const coach = await resolved(await ClubhouseCoachHelmRoute());
    render(wrap(coach));
    // The players read is the resolved team's, not every team the coach staffs.
    expect(askedTeam).toBe('t1');
    expect(screen.getByText('Coach')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'By player' })).toBeTruthy();
    expect(isCoachHelmEnabledForCoach).toHaveBeenCalledWith('c1');
    expect(getTopInsightsForPlayers).toHaveBeenCalledWith(['pl-jonah'], { limit: 1 });

    document.body.innerHTML = '';
    session.current = { userId: 'u2', role: 'player', coach: null, player: { id: 'pl-jonah' } };
    render(wrap(await resolved(await ClubhouseCoachHelmRoute())));
    expect(screen.getByText('One thing to work on this week, based on the rounds you’ve posted.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'By player' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Assign|Dismiss/ })).toBeNull();
    expect(isCoachHelmEnabledForPlayer).toHaveBeenCalledWith('pl-jonah');
    expect(getInsightsForPlayer).toHaveBeenCalledWith('pl-jonah', { limit: 30, drawnLater: expect.any(Function), includeMore: true });
  });

  it('CH-1301 no CoachHelm address says "hasn’t been rebuilt yet" any more: ?view=deep-dive is the Deep dive (coachhelm-dive.test), ?view=insights is the board', async () => {
    session.current = { userId: 'u2', role: 'player', coach: null, player: { id: 'pl-jonah' } };
    // The Deep dive is drawn inside the one Suspense every view shares (not keyed by view), whose fallback is the Deep dive's own skeleton.
    const dive = (await ClubhouseCoachHelmRoute({ view: 'deep-dive' })) as { key?: string | null; type?: unknown; props?: { fallback?: { type?: unknown } } } | null;
    expect(dive?.type).toBe(Suspense);
    expect(dive?.key).toBeNull();
    expect(dive?.props?.fallback?.type).toBe(DiveSkeleton);
    document.body.innerHTML = '';
    render(wrap(await resolved(await ClubhouseCoachHelmRoute({ view: 'insights' }))));
    expect(code('CH-1301')).toBeNull();
    expect(screen.getByText('One thing to work on this week, based on the rounds you’ve posted.')).toBeTruthy();
  });

  it('?view=development (every stored dev-plan notification) lands on Stats Development, not a placeholder (swap audit §14 D4)', async () => {
    session.current = { userId: 'u2', role: 'player', coach: null, player: { id: 'pl-jonah' } };
    await expect(ClubhouseCoachHelmRoute({ view: 'development' })).rejects.toThrow('redirect:/golf/dashboard/stats?tab=dev');
  });

  it('no session renders nothing here', async () => {
    session.current = null;
    expect(await ClubhouseCoachHelmRoute()).toBeNull();
  });

  it('CH-13308 a coach with no team gets a first-run page, not an error or a redirect', async () => {
    session.current = { userId: 'u1', role: 'coach', coach: { id: 'c1', organization_id: 'org1' }, player: null };
    teamOf.current = null;
    render(wrap(await ClubhouseCoachHelmRoute()));
    expect(code('CH-13308')!.textContent).toMatch(/You aren’t on a team yet.*CoachHelm reads the rounds your players post/);
    expect(getTopInsightsForPlayers).not.toHaveBeenCalled();
  });

  it('CH-13308 a coach session whose resolved team is not a coach team is never handed a team’s players', async () => {
    session.current = { userId: 'u1', role: 'coach', coach: { id: 'c1', organization_id: 'org1' }, player: null };
    teamOf.current = { role: 'player', teamId: 't1', playerId: 'pl-jonah' };
    render(wrap(await ClubhouseCoachHelmRoute()));
    expect(code('CH-13308')).not.toBeNull();
    expect(getTopInsightsForPlayers).not.toHaveBeenCalled();
  });

  it('130803 a player needs no team: their insights are their own', async () => {
    session.current = { userId: 'u2', role: 'player', coach: null, player: { id: 'pl-jonah' } };
    teamOf.current = null;
    render(wrap(await resolved(await ClubhouseCoachHelmRoute())));
    expect(focusHeading()).toBe('Downhill putts from 4–6\u00a0ft: a real penalty');
  });

  const noView = { searchParams: Promise.resolve({}) };
  it('130805 the page gives a Clubhouse coach or player the new screen, and Fairway’s page is unchanged everywhere else', async () => {
    const isRoute = (el: unknown) => (el as { type?: unknown } | null)?.type === ClubhouseCoachHelmRoute;
    gate.on = true;
    session.current = { userId: 'u1', role: 'coach', coach: { id: 'c1', organization_id: 'org1' }, player: null };
    expect(isRoute(await GolfCoachHelmPage(noView))).toBe(true);
    session.current = { userId: 'u2', role: 'player', coach: null, player: { id: 'pl-jonah' } };
    expect(isRoute(await GolfCoachHelmPage(noView))).toBe(true);
    expect(((await GolfCoachHelmPage({ searchParams: Promise.resolve({ view: 'development' }) })) as { props: { view?: string } }).props.view).toBe('development');
    // Off: a coach still gets Fairway's pointer to the Brief, and no session still goes to sign in.
    gate.on = false;
    session.current = { userId: 'u1', role: 'coach', coach: { id: 'c1', organization_id: 'org1' }, player: null };
    const legacy = (await GolfCoachHelmPage(noView)) as { props: { title: string; actionLabel: string } };
    expect(isRoute(legacy)).toBe(false);
    expect(legacy.props.title).toBe('CoachHelm');
    expect(legacy.props.actionLabel).toMatch(/^Open /);
    session.current = null;
    await expect(GolfCoachHelmPage(noView)).rejects.toThrow('redirect:/golf/login');
    gate.on = true;
    await expect(GolfCoachHelmPage(noView)).rejects.toThrow('redirect:/golf/login');
  });

  it('the loading file is the Clubhouse skeleton inside Clubhouse, and Fairway’s everywhere else', async () => {
    const Loading = (await import('@/app/golf/(dashboard)/dashboard/coachhelm/loading')).default;
    const { unmount } = render(
      <ClubhouseMarker>
        <Loading />
      </ClubhouseMarker>,
    );
    expect(code('CH-13401')).not.toBeNull();
    unmount();
    render(<Loading />);
    expect(code('CH-13401')).toBeNull();
    expect(screen.getByText('Loading CoachHelm…')).toBeTruthy();
  });
});
