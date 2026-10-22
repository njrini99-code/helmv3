import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { computeMondayBrief, type MondayBriefRead, type MondayBriefRound } from '@/lib/coachhelm/v3/monday-brief/brief';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { TeamPattern, TeamPatternResult } from '@/lib/coachhelm/v3/team-pattern/pattern';
import { toChCoachBrief, type BriefFocusRow, type ChCoachBrief, type CoachBriefInputs } from '../data/coachhelm-coach-brief-shape';
import type { ChViewLoad } from '../data/coachhelm-views-shape';
import { PREVIEW_TRACK_RECORD } from './fixtures-coachhelm-track';

/**
 * Preview fixtures for the coach's Brief (P013 `?view=brief`; `/clubhouse-preview/coachhelm-coach-brief`). Synthetic players,
 * reads, focus areas, goals and standing, run through the real `computeMondayBrief` and `toChCoachBrief`, so the preview draws
 * what the loader would. States: full (every section), thin (a small team early in the season: two reads, one focus area, no
 * pattern, no record yet), noreads (no read at Likely or above; the team sections still draw), partial (the goals read failed).
 */

const NOW = new Date('2026-10-19T05:00:00Z');

const ROSTER = [
  { id: 'pv-maya', name: 'Maya Chen' },
  { id: 'pv-jonah', name: 'Jonah Okafor' },
  { id: 'pv-priya', name: 'Priya Shah' },
  { id: 'pv-theo', name: 'Theo Marchetti' },
  { id: 'pv-lena', name: 'Lena Duarte' },
  { id: 'pv-sam', name: 'Sam Whitaker' },
  { id: 'pv-ava', name: 'Ava Lindqvist' },
  { id: 'pv-noah', name: 'Noah Brandt' },
  { id: 'pv-iris', name: 'Iris Moreau' },
];

const ev = (ladder: string, strokes: number, over: Record<string, unknown> = {}) => ({
  ladder,
  strokes_impact: strokes,
  strokes_impact_method: 'peer_delta',
  strokes_shrunk: strokes * 0.8,
  support: { direction: 'weakness' },
  ...over,
});

const read = (id: string, player: string, title: string, evidence: Record<string, unknown>, created = '2026-10-02T10:00:00Z', refreshed = '2026-10-18T02:00:00Z'): MondayBriefRead => ({
  id,
  player_id: player,
  title,
  created_at: created,
  evidence,
  metadata: { last_refreshed_at: refreshed },
});

const READS: MondayBriefRead[] = [
  read('pv-r1', 'pv-priya', 'Three-putts', ev('seen_repeatedly', 0.8), '2026-10-14T03:00:00Z'),
  read('pv-r2', 'pv-maya', 'Tee shots with driver: penalties', ev('observed', 0.7)),
  read('pv-r3', 'pv-jonah', 'Downhill putts, 4–6 ft', ev('likely', 0.4), '2026-10-15T03:00:00Z'),
  read('pv-r4', 'pv-theo', 'Bogey after a missed green', ev('likely', 0.5), '2026-10-02T10:00:00Z', '2026-10-15T02:00:00Z'),
  read('pv-r10', 'pv-lena', 'Up and down from short-sided misses', ev('observed', 0.45)),
  read('pv-r11', 'pv-ava', 'Second putts from 3–5 ft', ev('likely', 0.35)),
  // Left out: a Working hypothesis, a strength and Watching.
  read('pv-r5', 'pv-lena', 'Par 5 scoring', ev('working_hypothesis', 0.9)),
  read('pv-r6', 'pv-sam', 'Sand saves', ev('observed', 0.6, { support: { direction: 'strength' } })),
  read('pv-r7', 'pv-ava', 'Lag putts', ev('not_enough_yet', 0.3)),
  // Cleared this week.
  read('pv-r8', 'pv-noah', '4–6 ft putts', ev('observed', 0.5, { recheck: { outcome: 'cleared', computed_at: '2026-10-16T04:00:00Z' } })),
  // Two rounds behind: counted out of date, not in the brief.
  read('pv-r9', 'pv-iris', 'Approach 125–175 yd', ev('observed', 0.6), '2026-09-20T10:00:00Z', '2026-10-06T02:00:00Z'),
];

const ROUNDS: MondayBriefRound[] = [
  ...['2026-10-12', '2026-10-14', '2026-10-17'].map((day) => ({ player_id: 'pv-iris', day })),
  ...['2026-10-12', '2026-10-17'].map((day) => ({ player_id: 'pv-theo', day })),
  ...['2026-10-03', '2026-10-08', '2026-10-13', '2026-10-16', '2026-10-17'].map((day) => ({ player_id: 'pv-priya', day })),
  ...['2026-10-06', '2026-10-15', '2026-10-17'].map((day) => ({ player_id: 'pv-maya', day })),
  ...['2026-10-14', '2026-10-16'].map((day) => ({ player_id: 'pv-jonah', day })),
  ...['2026-10-13', '2026-10-15'].map((day) => ({ player_id: 'pv-sam', day })),
];

const member = (player_id: string, value: number, ladder: TeamPattern['member_reads'][number]['ladder']) => ({ player_id, insight_id: `tp-${player_id}`, ladder, strokes: 0.22, value });

const PATTERN: TeamPattern = {
  team_id: 'preview-team',
  family: 'approach_green_hit|approach_proximity_50_125|short',
  base_family: 'approach_green_hit',
  metric: 'approach_proximity_50_125',
  side: 'short',
  label: 'Wedges 50–125 yd · finishing short',
  unit: 'percent',
  window_end: '2026-10-19',
  members: ['pv-noah', 'pv-sam', 'pv-iris', 'pv-maya', 'pv-jonah'],
  member_reads: [member('pv-noah', 64, 'observed'), member('pv-sam', 61, 'likely'), member('pv-iris', 58, 'likely'), member('pv-maya', 57, 'likely'), member('pv-jonah', 55, 'likely')],
  roster_with_reads: 6,
  roster_total: 9,
  strokes_sum: 1.1,
  common_next: 'Three carry distances × 10 balls, with the number called before the swing.',
  computed_at: NOW.toISOString(),
};

const PATTERNS: TeamPatternResult = { patterns: [PATTERN], below_threshold: 1, roster_with_reads: 6, roster_total: 9 };

const focus = (id: string, player: string, title: string, metric: string | null, values: [number | null, number | null, number | null], started: string, rounds: number | null = null, status = 'active'): BriefFocusRow => ({
  id,
  player_id: player,
  title,
  status,
  target_metric: metric,
  baseline_value: values[0],
  current_value: values[1],
  target_value: values[2],
  target_rounds: rounds,
  started_at: `${started}T12:00:00Z`,
  created_at: `${started}T12:00:00Z`,
});

const FOCUS: BriefFocusRow[] = [
  focus('pv-f1', 'pv-priya', 'Lag putting inside 3 ft', 'putts_made_3_5ft_pct', [71, 78, 85], '2026-10-01', 8),
  focus('pv-f2', 'pv-maya', 'Wedges inside 20 ft', 'approach_proximity_50_125ft', [27, 23, 18], '2026-10-05', null, 'in_progress'),
  focus('pv-f3', 'pv-jonah', 'Downhill putts, 4–6 ft', 'putts_made_3_5ft_pct', [null, null, null], '2026-10-15'),
  // A coach's own focus without a measured stat: its words, no numbers.
  focus('pv-f4', 'pv-theo', 'Pre-shot routine under pressure', null, [null, null, null], '2026-09-28'),
];

function goal(id: string, player: string, metric: MetricId, title: string, current: number, target: number, ends: string): Goal {
  return {
    id,
    player_id: player,
    team_id: 'preview-team',
    created_by_user_id: 'pv-coach',
    creator_role: 'coach',
    coach_id_if_assigned: 'pv-coach',
    metric_id: metric,
    title,
    category: 'putting',
    started_at: '2026-09-15T00:00:00Z',
    ends_at: `${ends}T00:00:00Z`,
    window_days: 60,
    baseline_value: null,
    current_value: current,
    target_value: target,
    target_source: 'manual',
    state: 'active',
    outcome_evaluated_at: null,
    shared_with_coach: true,
    shared_at: null,
    coach_assignment_mode: 'suggested',
    player_accepted_at: null,
    player_declined_at: null,
    origin: 'manual',
    origin_insight_id: null,
    snapshots: [],
    created_at: '2026-09-15T00:00:00Z',
    updated_at: '2026-10-18T00:00:00Z',
  };
}

const GOALS = new Map<string, Goal[]>([
  ['pv-priya', [goal('pv-g1', 'pv-priya', 'putts_made_5_10ft_pct', 'Make more 5–10 footers', 44, 55, '2026-11-14')]],
  ['pv-maya', [goal('pv-g2', 'pv-maya', 'gir_pct', 'Hit 10 greens a round', 51, 56, '2026-11-30'), goal('pv-g3', 'pv-maya', 'sg_putting', 'Break even on the greens', -0.4, 0, '2026-11-30')]],
  ['pv-sam', [goal('pv-g4', 'pv-sam', 'scrambling_pct_rough', 'Get up and down from the rough', 38, 45, '2026-11-07')]],
]);

function stand(player: string, metric: MetricId, value: number, team: number | null, teamN: number, tour: number): PlayerStanding {
  return { player_id: player, metric_id: metric, player_value: value, team_avg: team, team_n: teamN, team_pct: null, level_avg: null, level_n: 0, level_pct: null, pga_value: tour, pga_delta: value - tour, computed_at: NOW.toISOString() };
}

const STANDING = new Map<string, Map<string, PlayerStanding>>([
  ['pv-priya', new Map([['putts_made_5_10ft_pct', stand('pv-priya', 'putts_made_5_10ft_pct', 44, 49, 8, 56)]])],
  ['pv-maya', new Map([['gir_pct', stand('pv-maya', 'gir_pct', 51, 54, 8, 67)]])],
  // Too few teammates for a team marker: only the Tour is printed.
  ['pv-sam', new Map([['scrambling_pct_rough', stand('pv-sam', 'scrambling_pct_rough', 38, 41, 3, 58)]])],
]);

function brief(over: Partial<Pick<CoachBriefInputs, 'focus' | 'goals' | 'standing' | 'record'>> & { reads?: MondayBriefRead[]; roster?: typeof ROSTER; patterns?: TeamPatternResult | null } = {}): ChCoachBrief {
  const roster = over.roster ?? ROSTER;
  const ids = new Set(roster.map((p) => p.id));
  const patterns = over.patterns === undefined ? PATTERNS : over.patterns;
  const rounds = ROUNDS.filter((r) => ids.has(r.player_id));
  return toChCoachBrief({
    brief: computeMondayBrief({
      teamId: 'preview-team',
      roster,
      reads: (over.reads ?? READS).filter((r) => ids.has(r.player_id)),
      rounds,
      teamPattern: patterns?.patterns[0] ?? null,
      withEnoughRounds: Math.min(6, roster.length),
      now: NOW,
      maxItems: Number.POSITIVE_INFINITY,
    }),
    patterns,
    roster,
    rounds,
    focus: 'focus' in over ? (over.focus ?? null) : FOCUS,
    goals: 'goals' in over ? (over.goals ?? null) : GOALS,
    standing: 'standing' in over ? (over.standing ?? null) : STANDING,
    record: 'record' in over ? (over.record ?? null) : PREVIEW_TRACK_RECORD,
  });
}

export const PREVIEW_COACH_BRIEF = brief();

/** A four-player team early in the season: two reads, one focus area, one goal, no pattern and no record yet. */
export const PREVIEW_COACH_BRIEF_THIN = brief({
  roster: ROSTER.filter((p) => ['pv-priya', 'pv-jonah', 'pv-theo', 'pv-sam'].includes(p.id)),
  patterns: null,
  focus: FOCUS.filter((f) => f.id === 'pv-f1'),
  record: null,
});

/** Every read is below Likely (the engine's ladder is not written yet): no reads; focus areas, goals and the record still draw. */
export const PREVIEW_COACH_BRIEF_NO_READS = brief({
  reads: READS.map((r) => ({ ...r, evidence: { strokes_impact: 0.4, strokes_impact_method: 'peer_delta' } })),
  patterns: null,
});

/** The goals read failed: the rest draws and the notice names what is missing. */
export const PREVIEW_COACH_BRIEF_PARTIAL = brief({ goals: null });

export function coachBriefLoad(state: string | undefined): ChViewLoad<ChCoachBrief> {
  if (state === 'failed') return { status: 'failed' };
  if (state === 'off') return { status: 'off', reason: 'We are pausing AI insights until after the spring qualifier' };
  const data = { thin: PREVIEW_COACH_BRIEF_THIN, noreads: PREVIEW_COACH_BRIEF_NO_READS, partial: PREVIEW_COACH_BRIEF_PARTIAL }[state ?? ''] ?? PREVIEW_COACH_BRIEF;
  return { status: 'ready', data };
}
