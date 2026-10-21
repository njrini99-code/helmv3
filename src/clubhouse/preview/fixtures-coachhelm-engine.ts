import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { projectInsightForPlayer } from '@/lib/coachhelm/delivery/player-projection';
import type { InsightCause } from '@/lib/coachhelm/v2/insights/types';
import type { FocusAreaVerdict } from '@/lib/coachhelm/v3/verdicts/verdict';
import { toChDeepInsight, type ChDeepDive } from '../data/coachhelm-dive-shape';
import { shapeReadsLifecycle, type ChEngineFlags, type ChVerdictRow } from '../data/coachhelm-engine-shape';
import { toChInsight } from '../data/coachhelm-map';
import { firstName, sortCoachPlayers, type ChCoachHelmData, type ChCoachPlayer, type ChPlayerHelm } from '../data/coachhelm-shape';
import { speak, type ChViewer } from '../data/coachhelm-voice';
import { DIVE_BIG, DIVE_BREAK, DIVE_PENALTIES, DIVE_SLOPE, diveOf, FULL_INPUTS } from './fixtures-coachhelm-views';
import { bigNumber, breakBias, HELM_PLAYERS, penalties, PREVIEW_HELM_COACH, PREVIEW_TOUR, slope } from './fixtures-coachhelm';

/**
 * What the engine now knows, with every engine flag on (CoachHelm surfaces A): the claim ladder and its range, the three cause
 * states, Cleared / Contradicted / Under review and a focus area's verdict, on the coach's board, the player's board and the Deep
 * dive. Every person and number is synthetic, shaped as supercharge 04 §3 examples 2, 3, 5, 7, 11 and 12 write them, and every
 * row goes through the loaders' own mappers (`toChInsight`, `shapeReadsLifecycle`, the player feed's projection), so a preview
 * cannot draw what the page cannot. `?state=engine` on `coachhelm`, `coachhelm-player` and the Deep dive.
 */

export const ENGINE_ON: ChEngineFlags = { support: true, cause: true, recheck: true, verdicts: true };
/** The preview's clock: two days after the Contradicted pair was found, so the player sees it too. */
export const ENGINE_NOW = '2026-10-19T15:00:00Z';
const RUN_AT = '2026-10-19T03:00:00Z';

const M = { m: 58, m_recorded: 41, m_gated: 12, m_refused: 5 };

const patch = (ins: EvidenceInsight, extra: Record<string, unknown>): EvidenceInsight => ({ ...ins, evidence: { ...ins.evidence, ...extra } as EvidenceInsight['evidence'] });

const notTraced = (over: Partial<InsightCause>): InsightCause => ({
  state: 'not_traced',
  population: null,
  window: null,
  path: null,
  occurrences: null,
  denominator: null,
  distinct_rounds: null,
  example_holes: [],
  event_strokes: null,
  checked: { holes_with_full_record: 0, of: 0, fields_missing: [] },
  alternatives: [],
  data_gap: null,
  coach_override: null,
  ...over,
});

/** Example 12: downhill 4–6 ft, Observed, and the why held back by a data gap (4 of the misses carry a side). */
export const ENGINE_SLOPE = (row: EvidenceInsight): EvidenceInsight =>
  patch(row, {
    window_start: '2026-07-05',
    window_end: '2026-10-17',
    rounds_n: 12,
    support: {
      version: 'support_v1',
      testable: true,
      family: 'putt_slope',
      gap: 0.23,
      gap_unit: 'pct_points',
      range_lo: 0.03,
      range_hi: 0.43,
      p_one_sided: 0.004,
      q_adj: 0.04,
      tests_in_run: 58,
      m_basis: M,
      method: 'newcombe',
      test: 'pooled_z',
      direction: 'weakness',
      n: 31,
      n_unit: 'attempts',
      rounds_n: 12,
      floor: 15,
      round_floor: 3,
      benchmark: { source: 'self', value: 0.81 },
      clear: true,
      run_at: RUN_AT,
    },
    ladder: 'observed',
    what_ladder: 'observed',
    ladder_reasons: ['one_window_only'],
    cause: notTraced({
      population: 'missed downhill putts from 4–6 ft',
      checked: { holes_with_full_record: 31, of: 31, fields_missing: ['miss_direction'] },
      data_gap: { field: 'miss_direction', shot_filter: {}, target_count: 10, have_count: 4, prompt: 'Which side? Short · Long · High · Low' },
      not_traced_reason: 'data_gap',
    }),
  });

/** Example 3, on penalties: Likely, the cause inferred from the totals with both arms counted. */
export const ENGINE_PENALTIES = (row: EvidenceInsight): EvidenceInsight =>
  patch(row, {
    window_start: '2026-06-20',
    window_end: '2026-10-17',
    rounds_n: 21,
    support: {
      version: 'support_v1',
      testable: true,
      family: 'penalties',
      gap: 0.5,
      gap_unit: 'per_round',
      range_lo: 0.1,
      range_hi: 0.9,
      p_one_sided: 0.02,
      q_adj: 0.07,
      tests_in_run: 58,
      m_basis: M,
      method: 'poisson',
      test: 'conditional_binomial',
      direction: 'weakness',
      n: 21,
      n_unit: 'rounds',
      rounds_n: 21,
      floor: 8,
      round_floor: 3,
      benchmark: { source: 'team', value: 0.6 },
      clear: false,
      run_at: RUN_AT,
    },
    ladder: 'likely',
    what_ladder: 'likely',
    ladder_reasons: ['below_clear_n'],
    cause: {
      ...notTraced({}),
      state: 'inferred_hypothesis',
      population: 'holes with a penalty',
      alternatives: [{ label: 'Driver off the tee', lift: 2.1, arm_a: { n: 58, failures: 12, rate: 12 / 58 }, arm_b: { n: 62, failures: 6, rate: 6 / 62 }, lower_bound: 0.01, upper_bound: 0.2 }],
    },
  });

/** The same penalties read with a counted path, as a player is shown it: 5 of 7 penalties came after a driver into water. */
export const ENGINE_PENALTIES_COUNTED = (row: EvidenceInsight): EvidenceInsight =>
  patch(ENGINE_PENALTIES(row), {
    cause: { ...notTraced({}), state: 'observed_sequence', population: 'penalties', path: ['driver off the tee', 'into the water'], occurrences: 5, denominator: 7, distinct_rounds: 4 },
  });

/** Example 2: a thin read held back, Not enough yet, and the count-down to the floor. */
export const ENGINE_BREAK = (row: EvidenceInsight): EvidenceInsight =>
  patch(row, {
    support: {
      version: 'support_v1',
      testable: true,
      family: 'putt_break',
      gap: 0.15,
      gap_unit: 'pct_points',
      range_lo: -0.1,
      range_hi: 0.39,
      p_one_sided: 0.11,
      q_adj: 0.61,
      tests_in_run: 58,
      m_basis: M,
      method: 'newcombe',
      test: 'pooled_z',
      direction: 'weakness',
      n: 28,
      n_unit: 'attempts',
      rounds_n: 9,
      floor: 40,
      round_floor: 3,
      benchmark: { source: 'self', value: 0.51 },
      clear: false,
      run_at: RUN_AT,
    },
    ladder: 'not_enough_yet',
    what_ladder: 'not_enough_yet',
    ladder_reasons: ['below_attempt_floor', 'not_supported'],
    cause: notTraced({ population: 'missed left-to-right putts', not_traced_reason: 'count_down', count_down: { need_events: 10, need_rounds: 3, have_events: 6, have_rounds: 9 } }),
    under_review: { reason: 'wrong_cause', since: '2026-10-18T20:00:00Z' },
  });

/** Example 4: a strength Seen repeatedly (both halves agree). */
export const ENGINE_BIG = (row: EvidenceInsight): EvidenceInsight =>
  patch(row, {
    support: {
      version: 'support_v1',
      testable: true,
      family: 'big_number',
      gap: -0.03,
      gap_unit: 'pct_points',
      range_lo: -0.05,
      range_hi: -0.01,
      p_one_sided: 0.01,
      q_adj: 0.05,
      tests_in_run: 58,
      m_basis: M,
      method: 'wilson',
      test: 'exact_binomial',
      direction: 'strength',
      n: 378,
      n_unit: 'attempts',
      rounds_n: 21,
      floor: 60,
      round_floor: 3,
      benchmark: { source: 'tour', value: 0.02 },
      clear: true,
      run_at: RUN_AT,
    },
    ladder: 'seen_repeatedly',
    what_ladder: 'seen_repeatedly',
    ladder_reasons: [],
  });

/** Example 5: a 4–6 ft read the recheck found cleared. */
export const ENGINE_CLEARED = (playerId: string): EvidenceInsight =>
  patch(
    { ...slope(playerId, `in-cleared-${playerId}`), title: '4–6 ft putts' },
    {
      metric_label: '4–6 ft putts',
      recheck: {
        window: 'newest_15_rounds',
        rounds_n: 15,
        recent_value: 75.9,
        recent_n: 29,
        recent_unit: 'putts',
        recent_lower_90: 65.7,
        recent_upper_90: 84,
        old_value: 62,
        old_n: 95,
        benchmark: 72,
        polarity: 'higher_better',
        outcome: 'cleared',
        min_n: 20,
        computed_at: '2026-10-12T03:00:00Z',
      },
    },
  );

/** Example 7: tee strategy, driver gains; paired with the penalty read as one Contradicted item. */
const teeStrategy = (playerId: string, id: string, partner: string): EvidenceInsight =>
  patch(
    { ...bigNumber(playerId, id), category: 'course_management', title: 'Driver off the tee gains 0.15 a hole', priority: 'medium' },
    {
      metric: 'tee_strategy_driver_gain',
      metric_label: 'Driver against the other tee club',
      conflict: {
        with_insight_id: partner,
        kind: 'opposing_strategy',
        role: 'paired',
        net_strokes: 0.9,
        resolution: 'net_favours_driver',
        subject: 'driver_vs_penalties',
        link: { penalties_after_driver: 5, penalties: 7, rounds_n: 9 },
        computed_at: '2026-10-17T03:00:00Z',
      },
    },
  );
const withConflict = (row: EvidenceInsight, partner: string): EvidenceInsight =>
  patch(row, {
    conflict: {
      with_insight_id: partner,
      kind: 'opposing_strategy',
      role: 'paired',
      net_strokes: 0.9,
      resolution: 'net_favours_driver',
      subject: 'driver_vs_penalties',
      link: { penalties_after_driver: 5, penalties: 7, rounds_n: 9 },
      computed_at: '2026-10-17T03:00:00Z',
    },
  });

/** Example 11: the focus area made from the 4–6 ft read, at its horizon. */
const WORKED: FocusAreaVerdict = {
  word: 'worked',
  post: { value: 31 / 42, made: 31, n: 42, window_start: '2026-09-01', window_end: '2026-10-17' },
  lower_bound_90: 0.651,
  upper_bound_90: 0.82,
  bound_method: 'normal',
  expected_without_coaching: 0.635,
  threshold: 0.7,
  horizon: { attempts: 40 },
  computed_at: RUN_AT,
};
export const focusWorked = (insightId: string): ChVerdictRow => ({
  id: `fa-${insightId}`,
  from_insight_id: insightId,
  baseline_value: 58,
  baseline_n: 31,
  criterion: { direction: 'higher', threshold: 0.7, unit: 'pct' },
  horizon: { attempts: 40 },
  verdict: WORKED,
});
export const focusDidNotMove = (insightId: string): ChVerdictRow => ({
  ...focusWorked(insightId),
  verdict: { ...WORKED, word: 'did_not_move', post: { value: 0.6, made: 24, n: 40, window_start: '2026-09-01', window_end: '2026-10-17' }, lower_bound_90: 0.501, upper_bound_90: 0.699 },
});
export const focusTooEarly = (insightId: string): ChVerdictRow => ({ ...focusWorked(insightId), verdict: null });

const coachOf = (p: { name: string }): ChViewer => ({ role: 'coach', first: firstName(p.name) });

/** One coach card through the loader's own steps: the player's reads shaped for their lifecycle, the head mapped with its engine. */
function coachCard(p: { id: string; name: string }, reads: EvidenceInsight[], count: number, focus: ChVerdictRow | null, drillText: string | null = null): ChCoachPlayer {
  const viewer = coachOf(p);
  const head = reads[0]!;
  const shaped = shapeReadsLifecycle(reads, true, viewer, ENGINE_NOW);
  const top = toChInsight(head, { drillText, tour: PREVIEW_TOUR, viewer, engine: { flags: ENGINE_ON, lifecycle: shaped.byId.get(head.id) ?? null, focus, now: ENGINE_NOW } });
  return { id: p.id, name: p.name, count, top, ...(shaped.cleared.length > 0 ? { cleared: shaped.cleared } : {}) };
}

const DRILL_TEXT = 'Rehearse a downhill-only ladder: start 2 ft below the hole and add a foot at a time, focused on dying the ball into the front of the cup rather than a firm strike.';
const { jonah, eli, priya, theo } = HELM_PLAYERS;

/** The coach's board with every engine flag on: Jonah Observed with a data gap and a Worked focus area; Eli Likely and Contradicted; Priya held back and under review; Theo a strength Seen repeatedly, with one read cleared. */
export const PREVIEW_HELM_COACH_ENGINE: ChCoachHelmData = {
  ...PREVIEW_HELM_COACH,
  players: {
    list: sortCoachPlayers([
      coachCard(jonah, [ENGINE_SLOPE(slope(jonah.id))], 3, focusWorked('in-slope'), DRILL_TEXT),
      coachCard(eli, [withConflict(ENGINE_PENALTIES(penalties(eli.id, 'in-pen-eli')), 'in-tee-eli'), teeStrategy(eli.id, 'in-tee-eli', 'in-pen-eli')], 2, focusTooEarly('in-pen-eli')),
      coachCard(priya, [ENGINE_BREAK(breakBias(priya.id, 'in-brk-priya'))], 1, null),
      coachCard(theo, [ENGINE_BIG(bigNumber(theo.id, 'in-dbl-theo')), ENGINE_CLEARED(theo.id)], 0, null),
    ]),
    error: false,
  },
};
/** Jonah's focus area did not move. `?state=engine-notmoved`. */
export const PREVIEW_HELM_COACH_ENGINE_NOT_MOVED: ChCoachHelmData = {
  ...PREVIEW_HELM_COACH_ENGINE,
  players: {
    list: PREVIEW_HELM_COACH_ENGINE.players.list.map((p) => (p.id === jonah.id ? coachCard(jonah, [ENGINE_SLOPE(slope(jonah.id))], 3, focusDidNotMove('in-slope'), DRILL_TEXT) : p)),
    error: false,
  },
};

const ME: ChViewer = { role: 'player' };
/** What the player's feed hands the page: the support pass's keys are dropped on the server (`delivery/player-projection.ts`). */
const JONAH_READS: EvidenceInsight[] = [
  ENGINE_SLOPE(DIVE_SLOPE),
  withConflict(ENGINE_PENALTIES_COUNTED(DIVE_PENALTIES), 'in-tee'),
  teeStrategy(jonah.id, 'in-tee', 'in-pen'),
  ENGINE_BREAK(DIVE_BREAK),
  ENGINE_BIG(DIVE_BIG),
  ENGINE_CLEARED(jonah.id),
].map(projectInsightForPlayer);
const JONAH_FOCUS = new Map([['in-slope', focusWorked('in-slope')]]);

function playerList() {
  const shaped = shapeReadsLifecycle(JONAH_READS, true, ME, ENGINE_NOW);
  const card = (r: EvidenceInsight) =>
    toChInsight(r, {
      drillText: r.id === 'in-slope' ? DRILL_TEXT : null,
      tour: PREVIEW_TOUR,
      viewer: ME,
      engine: { flags: ENGINE_ON, lifecycle: shaped.byId.get(r.id) ?? null, focus: JONAH_FOCUS.get(r.id) ?? null, now: ENGINE_NOW },
    });
  return { shaped, card };
}

/** The player's board with every engine flag on. */
export const PREVIEW_HELM_PLAYER_ENGINE: ChPlayerHelm = (() => {
  const { shaped, card } = playerList();
  return { off: null, proposals: { list: [], error: false }, insights: { list: shaped.kept.map(card), error: false }, rounds: null, cleared: shaped.cleared };
})();

/** The Deep dive with every engine flag on: `?view=deep-dive&state=engine`. */
export const PREVIEW_DIVE_ENGINE: ChDeepDive = (() => {
  const { shaped, card } = playerList();
  const say = (t: string) => speak(t, ME);
  return diveOf(
    shaped.kept.map((r) => toChDeepInsight(r, card(r), FULL_INPUTS, say)),
    { cleared: shaped.cleared },
  );
})();
