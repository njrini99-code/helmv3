import { computeTeamPatterns, type TeamPatternRead } from '@/lib/coachhelm/v3/team-pattern/pattern';
import type { ChCoachHelmData } from '../data/coachhelm-shape';
import { toChTeamPatterns } from '../data/coachhelm-team-pattern';
import { HELM_PLAYERS, PREVIEW_HELM_COACH } from './fixtures-coachhelm';

/**
 * The coach board with Team patterns (supercharge Slice 7b, `coachhelm_team_pattern_v1`): synthetic reads run through the real
 * `computeTeamPatterns`, so the preview draws exactly what the engine would. Five players, all with enough rounds: three share approaches from
 * 50-125 yd finishing short and three share 5-10 ft putts; two share penalties, which is under the threshold and only counted.
 */
const SAM = { id: 'pl-sam', name: 'Sam Whitfield' };
const ROSTER = [...Object.values(HELM_PLAYERS), SAM];

const ACTION_WEDGE = 'Three carry distances × 10 balls, with the number called before the swing.';
const ACTION_PUTT = 'Gate drill from 6 ft: 20 putts through a two-tee gate, start line first.';

function read(player: string, id: string, ev: Record<string, unknown>): TeamPatternRead {
  return { id, player_id: player, insight_type: String(ev.insight_type ?? 'approach_miss'), evidence: ev };
}

const wedge = (player: string, value: number, strokes: number, ladder: string) =>
  read(player, `tp-w-${player}`, {
    insight_type: 'approach_miss',
    metric: 'approach_miss_recovery_cost',
    metric_label: 'Approaches 50–125 yd',
    unit: 'percent',
    your_value: value,
    ladder,
    strokes_shrunk: strokes,
    support: { family: 'approach_miss_compass', direction: 'weakness' },
    detail: { worse_side: 'short' },
    diagnosis: { recommended_action: ACTION_WEDGE },
  });

const putt = (player: string, value: number, strokes: number, ladder: string) =>
  read(player, `tp-p-${player}`, {
    insight_type: 'putt_distance',
    metric: 'putts_made_5_10ft_pct',
    metric_label: 'Putts made 5–10 ft',
    unit: 'percent',
    your_value: value,
    ladder,
    strokes_shrunk: strokes,
    support: { family: 'putt_distance', direction: 'weakness' },
    diagnosis: { recommended_action: ACTION_PUTT },
  });

const penalty = (player: string) =>
  read(player, `tp-pen-${player}`, {
    insight_type: 'course_management',
    metric: 'penalty_rate_per_round',
    metric_label: 'Penalties per round',
    unit: 'count',
    your_value: 1.2,
    ladder: 'likely',
    strokes_shrunk: 0.5,
    support: { family: 'penalty_rate', direction: 'weakness' },
  });

const { jonah, eli, priya, theo } = HELM_PLAYERS;
const READS: TeamPatternRead[] = [
  wedge(eli.id, 64, 0.42, 'observed'),
  wedge(priya.id, 58, 0.36, 'likely'),
  wedge(SAM.id, 61, 0.31, 'likely'),
  putt(jonah.id, 41, 0.34, 'likely'),
  putt(theo.id, 44, 0.31, 'likely'),
  putt(eli.id, 39, 0.3, 'seen_repeatedly'),
  penalty(jonah.id),
  penalty(priya.id),
];

export const PREVIEW_TEAM_PATTERNS = toChTeamPatterns(
  computeTeamPatterns({
    teamId: 'team-preview',
    reads: READS,
    rosterTotal: ROSTER.length,
    eligiblePlayerIds: new Set(ROSTER.map((p) => p.id)),
    now: new Date('2026-10-20T12:00:00Z'),
  }),
  new Map(ROSTER.map((p) => [p.id, p.name])),
);

export const PREVIEW_HELM_COACH_PATTERNS: ChCoachHelmData = {
  ...PREVIEW_HELM_COACH,
  ...(PREVIEW_TEAM_PATTERNS ? { teamPatterns: PREVIEW_TEAM_PATTERNS } : {}),
};
