import { computeMondayBrief, type MondayBriefRead } from '@/lib/coachhelm/v3/monday-brief/brief';
import type { TeamPattern } from '@/lib/coachhelm/v3/team-pattern/pattern';
import { toChMondayBrief, type ChMondayBrief } from '../data/coachhelm-monday-brief-shape';

/**
 * Preview fixtures for the coach's Monday brief (P013 `?view=monday-brief`; `/clubhouse-preview/coachhelm-brief`). Synthetic
 * players and reads, run through the real `computeMondayBrief` and `toChMondayBrief`, so the preview draws what the engine would.
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
  // Left out: a Working hypothesis, a strength and Watching.
  read('pv-r5', 'pv-lena', 'Par 5 scoring', ev('working_hypothesis', 0.9)),
  read('pv-r6', 'pv-sam', 'Sand saves', ev('observed', 0.6, { support: { direction: 'strength' } })),
  read('pv-r7', 'pv-ava', 'Lag putts', ev('not_enough_yet', 0.3)),
  // Cleared this week.
  read('pv-r8', 'pv-noah', '4–6 ft putts', ev('observed', 0.5, { recheck: { outcome: 'cleared', computed_at: '2026-10-16T04:00:00Z' } })),
  // Two rounds behind: counted out of date, not in the brief.
  read('pv-r9', 'pv-iris', 'Approach 125–175 yd', ev('observed', 0.6), '2026-09-20T10:00:00Z', '2026-10-06T02:00:00Z'),
];

const ROUNDS = [
  ...['2026-10-12', '2026-10-14', '2026-10-17'].map((day) => ({ player_id: 'pv-iris', day })),
  ...['2026-10-12', '2026-10-17'].map((day) => ({ player_id: 'pv-theo', day })),
  ...['2026-10-13', '2026-10-16', '2026-10-17'].map((day) => ({ player_id: 'pv-priya', day })),
  ...['2026-10-15', '2026-10-17'].map((day) => ({ player_id: 'pv-maya', day })),
  ...['2026-10-14', '2026-10-16'].map((day) => ({ player_id: 'pv-jonah', day })),
  ...['2026-10-13', '2026-10-15'].map((day) => ({ player_id: 'pv-sam', day })),
];

const PATTERN: TeamPattern = {
  team_id: 'preview-team',
  family: 'approach_green_hit|approach_proximity_50_125|short',
  base_family: 'approach_green_hit',
  metric: 'approach_proximity_50_125',
  side: 'short',
  label: 'Wedges 50–125 yd · finishing short',
  unit: 'percent',
  window_end: '2026-10-19',
  members: ['pv-lena', 'pv-ava', 'pv-noah', 'pv-sam', 'pv-maya'],
  member_reads: [],
  roster_with_reads: 6,
  roster_total: 9,
  strokes_sum: 1.1,
  common_next: 'Carry-distance ladder with three wedges, 15 minutes, before Tuesday.',
  computed_at: NOW.toISOString(),
};

export const PREVIEW_MONDAY_BRIEF: ChMondayBrief = toChMondayBrief(
  computeMondayBrief({ teamId: 'preview-team', roster: ROSTER, reads: READS, rounds: ROUNDS, teamPattern: PATTERN, withEnoughRounds: 6, now: NOW }),
);

/** Every read is below Likely (the engine fields are still empty): no rows, every count zero. */
export const PREVIEW_MONDAY_BRIEF_EMPTY: ChMondayBrief = toChMondayBrief(
  computeMondayBrief({
    teamId: 'preview-team',
    roster: ROSTER,
    reads: READS.map((r) => ({ ...r, evidence: { strokes_impact: 0.4, strokes_impact_method: 'peer_delta' } })),
    rounds: ROUNDS,
    teamPattern: null,
    withEnoughRounds: 6,
    now: NOW,
  }),
);
