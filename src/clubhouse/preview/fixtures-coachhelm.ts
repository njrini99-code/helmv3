import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import type { PulseItem } from '@/lib/coachhelm/v3/chat/program-pulse';
import { SLOPE_METRIC, toChInsight } from '../data/coachhelm-map';
import { pulseRows, sortCoachPlayers, type ChCoachHelmData, type ChCoachPlayer, type ChInsight, type ChPlayerHelm, type ChTourBaseline } from '../data/coachhelm-shape';

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
    title: 'Downhill putts inside 4-6 ft: a real penalty',
    content:
      "Inside 4-6 ft you're making 58% of downhill putts vs 81% of level putts at the same distance, a 23-point gap (n=31 downhill / 44 level). Short putts carry the highest leverage per attempt in your bag (a miss costs a full stroke), so this gap is worth closing. It's consistent with a pace-control pattern rather than a green-reading one: the gap shows up inside 6 ft and not beyond it, where line matters more than speed. Rehearse a downhill-only ladder drill: start 2 ft below the hole and add a foot at a time, focused on dying the ball into the front of the cup rather than a firm strike.",
    evidence: evidence({
      metric: SLOPE_METRIC,
      metric_label: 'Downhill penalty vs level putts (distance-controlled)',
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

/** Double bogey or worse (course-mgmt.ts, the big-number variant): ahead of the cohort at low priority, so it is working. */
export const bigNumber = (playerId: string, id = 'in-dbl'): EvidenceInsight =>
  insight(playerId, {
    id,
    category: 'course_management',
    priority: 'low',
    title: 'Double bogey-or-worse rate: 3.1%',
    content: 'Across all 21 rounds on file, 3.1% of holes ended in double bogey or worse. College players in our data average ~4.8%. This is the #1 separator between 70s and 80s rounds.',
    evidence: evidence({
      metric: 'big_number_rate',
      metric_label: 'Double Bogey-or-Worse Rate',
      unit: 'percent',
      your_value: 3.1,
      your_value_display: '3.1%',
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

const NO_PROPOSALS: ChPlayerHelm['proposals'] = { list: [], error: false };
const jonah = HELM_PLAYERS.jonah.id;
/** A men's team's Tour values for the two metrics whose generator writes a college comparison (golf_pga_standards, tour = pga). */
export const PREVIEW_TOUR: ChTourBaseline = { tour: 'pga', values: new Map([['penalty_rate_per_round', 0.3], ['big_number_rate', 2]]) };
const chTour = (i: EvidenceInsight) => toChInsight(i, { tour: PREVIEW_TOUR });
const chSlope = (playerId: string, id?: string, assigned: ChInsight['assigned'] = null) => toChInsight(slope(playerId, id), { drillText: DRILL_TEXT, assigned });

/** Jonah's own CoachHelm, as the board draws it: the downhill penalty as the focus, two more, and one thing working. */
export const PREVIEW_HELM_PLAYER: ChPlayerHelm = {
  off: null,
  proposals: NO_PROPOSALS,
  insights: { list: [chSlope(jonah), chTour(penalties(jonah)), toChInsight(breakBias(jonah)), chTour(bigNumber(jonah))], error: false },
  rounds: null,
};
/** Two focus areas Coach Reyes proposed to Jonah: one made from his downhill-putts insight, one of the coach's own. */
export const PREVIEW_HELM_PLAYER_PROPOSED: ChPlayerHelm = {
  ...PREVIEW_HELM_PLAYER,
  proposals: {
    list: [
      { id: 'fa-ladder', title: 'Downhill putts inside 6 ft', from: 'Downhill putts inside 4-6 ft: a real penalty' },
      { id: 'fa-lag', title: 'Lag putting from 30 ft', from: null },
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
export const PREVIEW_HELM_PLAYER_WORKING: ChPlayerHelm = { off: null, proposals: NO_PROPOSALS, insights: { list: [chTour(bigNumber(jonah))], error: false }, rounds: null };

const PULSE_ITEMS: PulseItem[] = [
  { id: 'rsvp-e1', headline: '2 players have not responded for Team dinner', evidence: 'Thu, Oct 16, 6:30 PM · 4 of 6 responded', tone: 'attention', weight: 85 },
  { id: 'movement-decline', headline: '2 players are scoring higher than their previous three rounds', evidence: 'Jonah Okafor +2.1 · Eli Brandt +0.8', tone: 'attention', weight: 80 },
  { id: 'signals-open', headline: '7 open signals across 4 players', evidence: 'Downhill putts inside 4-6 ft: a real penalty', tone: 'neutral', weight: 70 },
  { id: 'focus-stalled', headline: '1 active focus area has no recent progress', evidence: 'Priya Natarajan: Lag putting', tone: 'attention', weight: 65 },
  { id: 'coverage-stale', headline: 'No rounds recorded in 9 days', evidence: 'The most recent round anywhere on the team was Oct 5.', tone: 'attention', weight: 60 },
];

const player = (p: { id: string; name: string }, top: ChInsight, count: number): ChCoachPlayer => ({ id: p.id, name: p.name, count, top });

const COACH_PLAYERS: ChCoachPlayer[] = sortCoachPlayers([
  player(HELM_PLAYERS.jonah, chSlope(jonah), 3),
  player(HELM_PLAYERS.eli, chTour(penalties(HELM_PLAYERS.eli.id, 'in-pen-eli')), 2),
  player(HELM_PLAYERS.priya, toChInsight(breakBias(HELM_PLAYERS.priya.id, 'in-brk-priya')), 1),
  player(HELM_PLAYERS.theo, chTour(bigNumber(HELM_PLAYERS.theo.id, 'in-dbl-theo')), 1),
]);

/** The coach's board: the pulse, four players with signals, one without. */
export const PREVIEW_HELM_COACH: ChCoachHelmData = {
  off: null,
  roster: { count: 5, error: false },
  pulse: { rows: pulseRows(PULSE_ITEMS), error: false },
  players: { list: COACH_PLAYERS, error: false },
  withoutSignals: 1,
};
/** Jonah's slope insight already has a focus area made from it, waiting for him to accept. */
export const PREVIEW_HELM_COACH_ASSIGNED: ChCoachHelmData = {
  ...PREVIEW_HELM_COACH,
  players: { list: sortCoachPlayers([player(HELM_PLAYERS.jonah, chSlope(jonah, 'in-slope', 'proposed'), 3), ...COACH_PLAYERS.filter((p) => p.id !== HELM_PLAYERS.jonah.id)]), error: false },
};
/** Players on the team, none with a signal yet. */
export const PREVIEW_HELM_COACH_EMPTY: ChCoachHelmData = { ...PREVIEW_HELM_COACH, players: { list: [], error: false }, withoutSignals: 5 };
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
