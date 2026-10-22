import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import type { PulseItem } from '@/lib/coachhelm/v3/chat/program-pulse';
import { SLOPE_METRIC, toChInsight } from '../data/coachhelm-map';
import type { ChViewer } from '../data/coachhelm-voice';
import { firstName, pulseRows, sortCoachPlayers, type ChCoachHelmData, type ChCoachPlayer, type ChInsight, type ChPlayerHelm, type ChTourBaseline } from '../data/coachhelm-shape';

/**
 * CoachHelm sample data (design/handoff/helm3.jsx `INS`, `PULSE`, `PLAYERS`).
 * Every insight is an `EvidenceInsight` in the shape its generator writes
 * (putt-slope-bias.ts, course-mgmt.ts, putt-bias.ts) and goes through the same
 * mapper the loader runs, so a preview cannot draw what the page cannot.
 */

const AT = '2026-10-12T14:00:00Z';

const evidence = (
  e: Partial<InsightEvidence> &
    Pick<InsightEvidence, 'metric' | 'metric_label' | 'unit' | 'your_value' | 'your_value_display' | 'comparison_value' | 'comparison_label' | 'comparison_source' | 'sample_n' | 'confidence'>,
): InsightEvidence => ({
  window_days: 90,
  window_start: '',
  window_end: '',
  strokes_impact: 0,
  strokes_impact_method: 'peer_delta',
  confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
  ...e,
});

type Seed = Pick<EvidenceInsight, 'id' | 'category' | 'title' | 'content' | 'priority' | 'evidence'> & Partial<EvidenceInsight>;
const insight = (playerId: string, s: Seed): EvidenceInsight => ({
  player_id: playerId,
  insight_type: null,
  signature: null,
  metadata: null,
  lifecycle_state: 'detected',
  status: 'active',
  acknowledged_at: null,
  resolved_at: null,
  created_at: AT,
  updated_at: AT,
  drills: [],
  ...s,
});

/** The generator writes a placeholder recommended action on every row without a sharper one (generator-base.ts buildDiagnosis). */
const diagnosis = (label: string): InsightEvidence['diagnosis'] => ({
  symptom: `${label}`,
  root_cause: `${label} is off its benchmark. Likely cause inferred from the aggregate, not a measured shot sequence`,
  causality_level: 'inferred_hypothesis',
  drivers: [],
  recommended_action: `Target ${label.toLowerCase()} in the next practice block`,
  confidence_reason: 'sample adequate',
});

export const HELM_PLAYERS = {
  jonah: { id: 'pl-jonah', name: 'Jonah Okafor' },
  eli: { id: 'pl-eli', name: 'Eli Brandt' },
  priya: { id: 'pl-priya', name: 'Priya Natarajan' },
  theo: { id: 'pl-theo', name: 'Theo Marchetti' },
} as const;

const DRILL_TEXT = 'Rehearse a downhill-only ladder: start 2 ft below the hole and add a foot at a time, focused on dying the ball into the front of the cup rather than a firm strike.';

/** A downhill putt penalty inside 4-6 ft (putt-slope-bias.ts): two make rates side by side, with an attached drill. */
export const slope = (playerId: string, id = 'in-slope'): EvidenceInsight =>
  insight(playerId, {
    id,
    category: 'putting',
    priority: 'medium',
    title: 'Downhill putts from 4-6 ft: a real penalty',
    content:
      "From 4-6 ft, you're making 58% of downhill putts vs 81% of level putts at the same distance, a 23-point gap. Short putts carry the highest leverage per attempt in your bag (a miss costs a full stroke), so this gap is worth closing. It's consistent with a pace-control pattern rather than a green-reading one: the gap shows up inside 6 ft and not beyond it, where line matters more than speed. Rehearse a downhill-only ladder drill: start 2 ft below the hole and add a foot at a time, focused on dying the ball into the front of the cup rather than a firm strike.",
    evidence: evidence({
      metric: SLOPE_METRIC,
      metric_label: 'Make rate, downhill vs level, same distance',
      unit: 'percent',
      polarity: 'lower_better',
      your_value: 23,
      your_value_display: '23 pts',
      comparison_value: 0,
      comparison_label: 'No downhill penalty (your level putts 81%, downhill 58%)',
      comparison_source: 'absolute_target',
      sample_n: 75,
      confidence: 1,
      detail: { band: '4-6 ft', downhill_pct: 58, level_pct: 81, downhill_n: 31, level_n: 44, alpha: 0.025 },
    }),
    drills: [{ id: 'dr-ladder', slug: 'downhill-ladder', title: 'Downhill ladder', duration_min: 12, difficulty: 'intermediate' }],
  });

/** Penalty strokes (course-mgmt.ts, the penalty variant): a lifetime value, the cohort as the tick and the Tour beside it. */
export const penalties = (playerId: string, id = 'in-pen'): EvidenceInsight =>
  insight(playerId, {
    id,
    category: 'course_management',
    priority: 'high',
    title: 'Penalty strokes: 1.1 per round',
    content:
      "Across all 21 rounds on file you're averaging 1.1 penalty strokes per round. College players in our data average ~0.6. 45.0% of your double-or-worse holes trace to penalties: pick a conservative line / bail-out target off the tee on these holes. Every penalty avoided is worth ~1.5 strokes per round.",
    evidence: evidence({
      metric: 'penalty_rate_per_round',
      metric_label: 'Penalties per Round',
      unit: 'count',
      your_value: 1.1,
      your_value_display: '1.1',
      comparison_value: 0.6,
      comparison_label: 'College cohort avg',
      comparison_source: 'cohort_avg',
      secondary_value: 0.3,
      secondary_label: 'PGA Tour avg',
      secondary_source: 'pga_baseline',
      sample_n: 21,
      window_basis: 'lifetime',
      window_days: 118,
      confidence: 0.7,
      diagnosis: diagnosis('Penalties per Round'),
    }),
  });

/** A break-direction gap (putt-bias.ts): make rate on the weak side against the other, no declared polarity. */
export const breakBias = (playerId: string, id = 'in-brk'): EvidenceInsight =>
  insight(playerId, {
    id,
    category: 'putting',
    priority: 'medium',
    title: 'Putting break: under-reading left-to-right (10-20 ft)',
    content:
      "On 10-20 ft putts you're making 36% of left-to-right breaks vs 51% the other way, a 15-point gap at matched distance (n=28/31). Start your read higher on the left edge and commit to playing more break.",
    evidence: evidence({
      metric: 'putt_miss_bias_left_pct',
      metric_label: 'Break-direction make % (distance-controlled)',
      unit: 'percent',
      your_value: 36,
      your_value_display: '36%',
      comparison_value: 51,
      comparison_label: 'Your right-to-left make % (same band)',
      comparison_source: 'your_baseline',
      sample_n: 59,
      confidence: 0.55,
    }),
  });

/** Double bogey or worse (course-mgmt.ts, the big-number variant): ahead of the Tour value it is drawn against (the college cohort's 4.8% is not drawn) at low priority, so it is working. */
export const bigNumber = (playerId: string, id = 'in-dbl'): EvidenceInsight =>
  insight(playerId, {
    id,
    category: 'course_management',
    priority: 'low',
    title: 'Double bogey-or-worse rate: 1.6%',
    content: 'Across all 21 rounds on file, 1.6% of holes ended in double bogey or worse. College players in our data average ~4.8%. This is the #1 separator between 70s and 80s rounds.',
    evidence: evidence({
      metric: 'big_number_rate',
      metric_label: 'Double Bogey-or-Worse Rate',
      unit: 'percent',
      your_value: 1.6,
      your_value_display: '1.6%',
      comparison_value: 4.8,
      comparison_label: 'College cohort avg',
      comparison_source: 'cohort_avg',
      secondary_value: 2,
      secondary_label: 'PGA Tour avg',
      secondary_source: 'pga_baseline',
      sample_n: 21,
      window_basis: 'lifetime',
      window_days: 118,
      confidence: 0.74,
    }),
  });

/**
 * Cards that state no finding: what the generators write when they looked and found nothing to fix (tee-strategy.ts "inconclusive",
 * putt-bias.ts "balanced") or a standing description (par-type.ts, stamped `feed_exempt`). Stored signatures carry the `v3:` prefix.
 */
export const teeInconclusive = (playerId: string, id = 'in-tee'): EvidenceInsight =>
  insight(playerId, {
    id,
    category: 'tee',
    priority: 'low',
    signature: 'v3:tee_strategy:inconclusive',
    title: 'Driver vs layback: no clear preference',
    content: 'Across 12 rounds your driver (61% fw, 84 attempts) and tee fairway clubs (63% fw, 30 attempts) are tracking close enough that neither insight crosses the evidence threshold.',
    evidence: evidence({
      metric: 'sg_tee_total',
      metric_label: 'Tee Strategy',
      unit: 'percent',
      polarity: 'higher_better',
      your_value: 61,
      your_value_display: '61%',
      comparison_value: 63,
      comparison_label: 'Non-driver fairway% (n=30)',
      comparison_source: 'your_baseline',
      sample_n: 84,
      confidence: 0.3,
    }),
  });

export const puttBalanced = (playerId: string, id = 'in-bal'): EvidenceInsight =>
  insight(playerId, {
    id,
    category: 'putting',
    priority: 'low',
    signature: 'v3:putt_bias:balanced',
    title: 'Putting break check: no directional bias detected',
    content: 'Across your last 14 rounds, no break direction stands out once distance and slope are controlled for. Keep working both ways on the practice green.',
    evidence: evidence({
      metric: 'putt_miss_bias_left_pct',
      metric_label: 'Left-to-right make % (distance-controlled)',
      unit: 'percent',
      your_value: 48,
      your_value_display: '48%',
      comparison_value: 52,
      comparison_label: 'Your right-to-left make % (same groups)',
      comparison_source: 'your_baseline',
      sample_n: 60,
      confidence: 0,
    }),
  });

/** The collapsed "Scoring by par type" card: the par-3 row's evidence under a title that covers all three (collapseParScoring). */
export const parType = (playerId: string, id = 'in-par'): EvidenceInsight =>
  insight(playerId, {
    id,
    category: 'scoring',
    priority: 'low',
    signature: 'v3:par_scoring:par3',
    title: 'Scoring by par type',
    content: 'Par 3: 3.27 (24.0% bogey, 3.0% double+) · Par 4: 4.19 (31.0% bogey, 6.0% double+) · Par 5: 4.91 (20.0% bogey, 2.0% double+)',
    evidence: evidence({
      metric: 'scoring_par_3',
      metric_label: 'Par 3 Scoring',
      unit: 'strokes',
      your_value: 3.27,
      your_value_display: '3.27',
      comparison_value: 3,
      comparison_label: 'Par',
      comparison_source: 'absolute_target',
      sample_n: 26,
      confidence: 0.8,
      feed_exempt: true,
      detail: { sample_unit: 'rounds', window_kind: 'lifetime', bogey_rate: 24, double_plus_rate: 3 },
    }),
  });

const NO_PROPOSALS: ChPlayerHelm['proposals'] = { list: [], error: false };
const jonah = HELM_PLAYERS.jonah.id;
/** A men's team's Tour values for the two metrics whose generator writes a college comparison (golf_pga_standards, tour = pga). */
export const PREVIEW_TOUR: ChTourBaseline = { tour: 'pga', values: new Map([['penalty_rate_per_round', 0.3], ['big_number_rate', 2]]) };
/** Whose voice a card is in, as the loaders set it: the player's own on their board, the player's first name on the coach's. */
const ME: ChViewer = { role: 'player' };
const coachOf = (p: { name: string }): ChViewer => ({ role: 'coach', first: firstName(p.name) });
const chTour = (i: EvidenceInsight, viewer: ChViewer) => toChInsight(i, { tour: PREVIEW_TOUR, viewer });
const chSlope = (playerId: string, viewer: ChViewer, id?: string, assigned: ChInsight['assigned'] = null) => toChInsight(slope(playerId, id), { drillText: DRILL_TEXT, assigned, viewer });

/** Jonah's own CoachHelm, as the board draws it: the downhill penalty as the focus, two more, and one thing working. */
export const PREVIEW_HELM_PLAYER: ChPlayerHelm = {
  off: null,
  proposals: NO_PROPOSALS,
  insights: { list: [chSlope(jonah, ME), chTour(penalties(jonah), ME), toChInsight(breakBias(jonah), { viewer: ME }), chTour(bigNumber(jonah), ME)], error: false },
  rounds: null,
};
/** Two focus areas Coach Reyes proposed to Jonah: one made from his downhill-putts insight, one of the coach's own. */
export const PREVIEW_HELM_PLAYER_PROPOSED: ChPlayerHelm = {
  ...PREVIEW_HELM_PLAYER,
  proposals: {
    list: [
      { id: 'fa-ladder', title: 'Downhill putts inside 6 ft', from: 'Downhill putts from 4–6 ft: a real penalty' },
      { id: 'fa-lag', title: 'Lag putting from 30 ft', from: null, coachUserId: 'u-maya' },
    ],
    error: false,
  },
};
/** The proposals did not load; the insights did. */
export const PREVIEW_HELM_PLAYER_PROPOSALS_FAILED: ChPlayerHelm = { ...PREVIEW_HELM_PLAYER, proposals: { list: [], error: true } };
/** Rounds posted, no insight yet. */
export const PREVIEW_HELM_PLAYER_EMPTY: ChPlayerHelm = { off: null, proposals: NO_PROPOSALS, insights: { list: [], error: false }, rounds: 3 };
/** No round posted at all. */
export const PREVIEW_HELM_PLAYER_NO_ROUNDS: ChPlayerHelm = { off: null, proposals: NO_PROPOSALS, insights: { list: [], error: false }, rounds: 0 };
export const PREVIEW_HELM_PLAYER_FAILED: ChPlayerHelm = { off: null, proposals: NO_PROPOSALS, insights: { list: [], error: true }, rounds: null };
export const PREVIEW_HELM_PLAYER_OFF: ChPlayerHelm = { off: { reason: null }, proposals: NO_PROPOSALS, insights: { list: [], error: false }, rounds: null };
/** Only strengths: nothing needs work. */
export const PREVIEW_HELM_PLAYER_WORKING: ChPlayerHelm = { off: null, proposals: NO_PROPOSALS, insights: { list: [chTour(bigNumber(jonah), ME)], error: false }, rounds: null };

/**
 * A crowded player board (`?state=many`), for the Board caps, the Deep dive Read and their before/after screenshots. Eleven
 * findings (ten current, one out of date), three strengths, two reads with the generators' placeholder cause and action, and two
 * whose stored estimate is zero ("Projected impact: ~0.00 strokes per round", course-management.ts).
 */
type ManySeed = { id: string; category: NonNullable<EvidenceInsight['category']>; priority: EvidenceInsight['priority']; title: string; content: string; metric: string; label: string; unit: InsightEvidence['unit']; polarity: 'lower_better' | 'higher_better'; you: number; display: string; cmp: number; cmpLabel: string; n: number; confidence: number; placeholder?: boolean; refreshed?: string };
const manyRead = (s: ManySeed): EvidenceInsight =>
  insight(jonah, {
    id: s.id,
    category: s.category,
    priority: s.priority,
    title: s.title,
    content: s.content,
    metadata: s.refreshed ? { last_refreshed_at: s.refreshed } : null,
    evidence: evidence({
      metric: s.metric,
      metric_label: s.label,
      unit: s.unit,
      polarity: s.polarity,
      your_value: s.you,
      your_value_display: s.display,
      comparison_value: s.cmp,
      comparison_label: s.cmpLabel,
      comparison_source: 'absolute_target',
      sample_n: s.n,
      confidence: s.confidence,
      ...(s.placeholder ? { diagnosis: diagnosis(s.label) } : {}),
    }),
  });
const ZERO_LINE = ' Projected impact: ~0.00 strokes per round.';
export const MANY_FINDINGS: EvidenceInsight[] = [
  manyRead({ id: 'in-3putt', category: 'putting', priority: 'high', title: 'Three-putt rate: 14%', content: `You three-putted 14% of greens across 21 rounds, against 8% for the Tour. Most start from outside 30 ft, so lag distance is the lever.${ZERO_LINE}`, metric: 'three_putt_rate', label: 'Three-putt Rate', unit: 'percent', polarity: 'lower_better', you: 14, display: '14%', cmp: 8, cmpLabel: 'PGA Tour avg', n: 378, confidence: 0.82 }),
  manyRead({ id: 'in-updown', category: 'short_game', priority: 'high', title: 'Up-and-down rate: 38%', content: `You got up and down 38% of the time after missing a green, against 58% for the Tour.${ZERO_LINE}`, metric: 'up_and_down_pct', label: 'Up-and-down Rate', unit: 'percent', polarity: 'higher_better', you: 38, display: '38%', cmp: 58, cmpLabel: 'PGA Tour avg', n: 96, confidence: 0.7, placeholder: true }),
  manyRead({ id: 'in-prox', category: 'approach', priority: 'medium', title: 'Approach from 150-175 yds: 31 ft from the hole', content: 'From 150-175 yards your approaches finish a median 31 ft from the hole, against 26 ft for the Tour. Projected impact: ~0.21 strokes per round.', metric: 'approach_prox_150_175', label: 'Proximity, 150-175 yds', unit: 'feet', polarity: 'lower_better', you: 31, display: '31 ft', cmp: 26, cmpLabel: 'PGA Tour avg', n: 64, confidence: 0.66 }),
  manyRead({ id: 'in-fw', category: 'tee', priority: 'medium', title: 'Fairways hit: 49%', content: 'You hit 49% of fairways over 21 rounds, against 62% for the Tour. Projected impact: ~0.34 strokes per round.', metric: 'fairway_pct', label: 'Fairways Hit', unit: 'percent', polarity: 'higher_better', you: 49, display: '49%', cmp: 62, cmpLabel: 'PGA Tour avg', n: 294, confidence: 0.78 }),
  manyRead({ id: 'in-par5', category: 'scoring', priority: 'medium', title: 'Bogeys on par 5s: 38%', content: 'You bogeyed or worse on 38% of par 5s, against 24% for the Tour. Projected impact: ~0.18 strokes per round.', metric: 'par5_bogey_rate', label: 'Par 5 Bogey Rate', unit: 'percent', polarity: 'lower_better', you: 38, display: '38%', cmp: 24, cmpLabel: 'PGA Tour avg', n: 63, confidence: 0.6, placeholder: true }),
  manyRead({ id: 'in-lag', category: 'putting', priority: 'medium', title: 'Lag putts from 30+ ft: 4.1 ft left', content: 'From 30 ft and out your first putt stops a median 4.1 ft from the hole, against 3.2 ft for the Tour. Projected impact: ~0.12 strokes per round.', metric: 'lag_leave_distance', label: 'First-putt Leave, 30+ ft', unit: 'feet', polarity: 'lower_better', you: 4.1, display: '4.1 ft', cmp: 3.2, cmpLabel: 'PGA Tour avg', n: 71, confidence: 0.58 }),
  manyRead({ id: 'in-badtee', category: 'course_management', priority: 'low', title: 'Bogey or worse after a missed fairway: 71%', content: 'After a missed fairway you made bogey or worse on 71% of holes, against 55% for the Tour. Projected impact: ~0.09 strokes per round.', metric: 'bogey_after_miss_pct', label: 'Bogey or Worse After a Missed Fairway', unit: 'percent', polarity: 'lower_better', you: 71, display: '71%', cmp: 55, cmpLabel: 'PGA Tour avg', n: 107, confidence: 0.5 }),
];
/** Older than the player's newest round (Oct 14): drawn Out of date, not an open signal. */
export const MANY_STALE: EvidenceInsight = manyRead({ id: 'in-gir', category: 'approach', priority: 'medium', title: 'Greens in regulation: 52%', content: 'You hit 52% of greens in regulation, against 65% for the Tour. Projected impact: ~0.28 strokes per round.', metric: 'gir_pct', label: 'Greens in Regulation', unit: 'percent', polarity: 'higher_better', you: 52, display: '52%', cmp: 65, cmpLabel: 'PGA Tour avg', n: 378, confidence: 0.74, refreshed: '2026-10-05T12:00:00Z' });
export const MANY_NEWEST_ROUND = '2026-10-14';
export const MANY_STRENGTHS: EvidenceInsight[] = [
  manyRead({ id: 'in-scramble', category: 'short_game', priority: 'low', title: 'Scrambling from the rough: 64%', content: 'You saved par from the rough 64% of the time, against 50% for the Tour.', metric: 'scramble_rough_pct', label: 'Scrambling From the Rough', unit: 'percent', polarity: 'higher_better', you: 64, display: '64%', cmp: 50, cmpLabel: 'PGA Tour avg', n: 41, confidence: 0.7 }),
  manyRead({ id: 'in-inside3', category: 'putting', priority: 'low', title: 'Putts inside 3 ft: 97%', content: 'You made 97% of putts inside 3 ft, against 94% for the Tour.', metric: 'make_pct_inside_3', label: 'Make Rate Inside 3 ft', unit: 'percent', polarity: 'higher_better', you: 97, display: '97%', cmp: 94, cmpLabel: 'PGA Tour avg', n: 212, confidence: 0.85 }),
];
export const PREVIEW_HELM_PLAYER_MANY: ChPlayerHelm = {
  off: null,
  proposals: NO_PROPOSALS,
  insights: {
    list: [
      chSlope(jonah, ME),
      chTour(penalties(jonah), ME),
      ...MANY_FINDINGS.slice(0, 2).map((i) => chTour(i, ME)),
      toChInsight(breakBias(jonah), { viewer: ME }),
      ...MANY_FINDINGS.slice(2).map((i) => chTour(i, ME)),
      toChInsight(MANY_STALE, { tour: PREVIEW_TOUR, viewer: ME, newestRound: MANY_NEWEST_ROUND }),
      chTour(bigNumber(jonah), ME),
      ...MANY_STRENGTHS.map((i) => chTour(i, ME)),
    ],
    error: false,
  },
  rounds: null,
};

/** `?state=zero`: the zero-estimate read leads (its "Projected impact: ~0.00 strokes per round" sits under Why we think this), then the placeholder-cause reads. */
export const PREVIEW_HELM_PLAYER_ZERO: ChPlayerHelm = {
  ...PREVIEW_HELM_PLAYER_MANY,
  insights: { list: [chTour(MANY_FINDINGS[0]!, ME), chTour(MANY_FINDINGS[1]!, ME), chTour(penalties(jonah), ME), chSlope(jonah, ME), chTour(bigNumber(jonah), ME)], error: false },
};
/** `?state=stale`: current reads first, then the one older than the player's newest round (Out of date). */
export const PREVIEW_HELM_PLAYER_STALE: ChPlayerHelm = {
  ...PREVIEW_HELM_PLAYER_MANY,
  insights: {
    list: [chSlope(jonah, ME), chTour(penalties(jonah), ME), toChInsight(MANY_STALE, { tour: PREVIEW_TOUR, viewer: ME, newestRound: MANY_NEWEST_ROUND }), chTour(bigNumber(jonah), ME)],
    error: false,
  },
};

const PULSE_ITEMS: PulseItem[] = [
  { id: 'rsvp-e1', headline: '2 players haven’t replied to Team dinner', evidence: 'Thu, Oct 16, 6:30 PM · 4 of 6 replied', tone: 'attention', weight: 85 },
  { id: 'movement-decline', headline: '2 players are scoring worse over their last three rounds', evidence: 'Jonah Okafor +2.1 strokes · Eli Brandt +0.8 strokes', tone: 'attention', weight: 80 },
  { id: 'signals-open', headline: '7 open signals across 4 players', evidence: 'Downhill putts from 4-6 ft: a real penalty', tone: 'neutral', weight: 70 },
  { id: 'focus-stalled', headline: '1 active focus area has no recent progress', evidence: 'Priya Natarajan: Lag putting', tone: 'attention', weight: 65 },
  { id: 'coverage-stale', headline: 'No rounds recorded in 9 days', evidence: 'The most recent round anywhere on the team was Oct 5.', tone: 'attention', weight: 60 },
];

const player = (p: { id: string; name: string }, top: ChInsight, count: number): ChCoachPlayer => ({ id: p.id, name: p.name, count, top });

const COACH_PLAYERS: ChCoachPlayer[] = sortCoachPlayers([
  player(HELM_PLAYERS.jonah, chSlope(jonah, coachOf(HELM_PLAYERS.jonah)), 3),
  player(HELM_PLAYERS.eli, chTour(penalties(HELM_PLAYERS.eli.id, 'in-pen-eli'), coachOf(HELM_PLAYERS.eli)), 2),
  player(HELM_PLAYERS.priya, toChInsight(breakBias(HELM_PLAYERS.priya.id, 'in-brk-priya'), { viewer: coachOf(HELM_PLAYERS.priya) }), 1),
  // What is working is not an open signal: Theo's top card is a strength, so he has none open.
  player(HELM_PLAYERS.theo, chTour(bigNumber(HELM_PLAYERS.theo.id, 'in-dbl-theo'), coachOf(HELM_PLAYERS.theo)), 0),
]);

/** The coach's board: the pulse, four players with signals, one without (Sam, named). */
export const PREVIEW_HELM_COACH: ChCoachHelmData = {
  off: null,
  roster: { count: 5, error: false },
  pulse: { rows: pulseRows(PULSE_ITEMS), error: false },
  players: { list: COACH_PLAYERS, error: false },
  withoutSignals: 1,
  withoutNames: ['Sam Whitfield'],
  withoutIds: ['pl-sam'],
};
/** Jonah's slope insight already has a focus area made from it, waiting for him to accept. */
export const PREVIEW_HELM_COACH_ASSIGNED: ChCoachHelmData = {
  ...PREVIEW_HELM_COACH,
  players: { list: sortCoachPlayers([player(HELM_PLAYERS.jonah, chSlope(jonah, coachOf(HELM_PLAYERS.jonah), 'in-slope', 'proposed'), 3), ...COACH_PLAYERS.filter((p) => p.id !== HELM_PLAYERS.jonah.id)]), error: false },
};
/** Players on the team, none with a signal yet. */
export const PREVIEW_HELM_COACH_EMPTY: ChCoachHelmData = { ...PREVIEW_HELM_COACH, players: { list: [], error: false }, withoutSignals: 5, withoutNames: [...Object.values(HELM_PLAYERS).map((p) => p.name), 'Sam Whitfield'], withoutIds: [...Object.values(HELM_PLAYERS).map((p) => p.id), 'pl-sam'] };
/** No players on the team yet. */
export const PREVIEW_HELM_COACH_NO_ROSTER: ChCoachHelmData = {
  off: null,
  roster: { count: 0, error: false },
  pulse: { rows: [], error: false },
  players: { list: [], error: false },
  withoutSignals: 0,
};
export const PREVIEW_HELM_COACH_FAILED: ChCoachHelmData = { ...PREVIEW_HELM_COACH, players: { list: [], error: true }, withoutSignals: 0 };
export const PREVIEW_HELM_COACH_PULSE_FAILED: ChCoachHelmData = { ...PREVIEW_HELM_COACH, pulse: { rows: [], error: true } };
export const PREVIEW_HELM_COACH_QUIET: ChCoachHelmData = { ...PREVIEW_HELM_COACH, pulse: { rows: [], error: false } };
export const PREVIEW_HELM_COACH_OFF: ChCoachHelmData = {
  off: { by: 'team', reason: null },
  roster: { count: 0, error: false },
  pulse: { rows: [], error: false },
  players: { list: [], error: false },
  withoutSignals: 0,
};
