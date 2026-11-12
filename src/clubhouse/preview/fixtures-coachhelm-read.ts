import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { diveCounts, orderDive, toChDeepInsight, type ChDeepDive, type DiveFocusRow, type DiveRoundRow } from '../data/coachhelm-dive-shape';
import { toChInsight } from '../data/coachhelm-map';
import { speak } from '../data/coachhelm-voice';
import { READ_CALLS } from '../data/coachhelm-read-calls';
import type { ChReadExtras, ReadCacheRow, ReadRoundRow } from '../data/coachhelm-read-extras-shape';
import { toChReadView, type ChReadView } from '../data/coachhelm-read-view-shape';
import type { ChHelmAssigned } from '../data/coachhelm-shape';
import { CAST, CAST_COACH, type CastPlayer } from './cast';
import { HELM_PLAYERS, PREVIEW_TOUR, bigNumber, breakBias, penalties, slope } from './fixtures-coachhelm';

/**
 * The read page's sample data, the 7 Nov design page's own set (design-refresh/coachhelm-read/redesign, "Data"): one player per read,
 * and every count on a read agrees with every other count on it. Each read is a real row in the shape its generator writes, with the
 * engine's depth beside it, and goes through the real shapers, so the preview can't draw what the page can't.
 *
 *   penalties  Eli Brandt      21 rounds, 23 penalties (1.1 a round), a counted path: 17 off the tee, 14 of those right.
 *   putts      Jonah Okafor    75 putts from 4-6 ft (31 downhill, 44 level), a 23-point gap, not traced yet: 6 of 12 greens tracked.
 *   approach   Priya Natarajan 28 approaches from 175+ yd, 16 missed (43% hit), a likely cause from the totals (coach only).
 *
 * Who each read is about, their class year and their rounds on file are the shared cast's (`preview/cast.ts`): Eli 21 rounds, Jonah 18,
 * Priya 16. The ids are `HELM_PLAYERS`', which the base rows are built with.
 */

export const READ_PREVIEW_KEYS = ['penalties', 'putts', 'approach'] as const;
export type ReadPreviewKey = (typeof READ_PREVIEW_KEYS)[number];

type Ev = EvidenceInsight['evidence'];
const more = (raw: EvidenceInsight, evidence: Record<string, unknown>, rest: Partial<EvidenceInsight> = {}): EvidenceInsight => ({ ...raw, ...rest, evidence: { ...raw.evidence, ...evidence } as unknown as Ev });
const ids = (who: string, n: number) => Array.from({ length: n }, (_, i) => `${who}-r${i + 1}`);
const steps = (list: Array<[string, string]>) => ({ steps: list.map(([label, statement]) => ({ passed: true, label, statement })), stopped_at: null });
const REFRESHED = '2026-09-29T06:00:00Z';
const FACTORS = { sample_adequacy: 1, factors_measured: true, recency: 0.8 };

/** A row the base fixtures have no builder for, on the bookkeeping of one they do. */
const row = (playerId: string, seed: Pick<EvidenceInsight, 'id' | 'category' | 'priority' | 'title' | 'content'> & { drills?: EvidenceInsight['drills'] }, evidence: Record<string, unknown>): EvidenceInsight =>
  ({
    ...penalties(playerId, seed.id),
    drills: [],
    ...seed,
    evidence: { window_days: 60, window_start: '', window_end: '', strokes_impact: 0, strokes_impact_method: 'peer_delta', confidence_factors: FACTORS, comparison_source: 'pga_baseline', comparison_label: 'Tour', unit: 'percent', ...evidence },
  }) as unknown as EvidenceInsight;

const ELI = HELM_PLAYERS.eli.id;
const JONAH = HELM_PLAYERS.jonah.id;
const PRIYA = HELM_PLAYERS.priya.id;

const RAW: Record<string, () => EvidenceInsight> = {
  penalties: () =>
    more(
      penalties(ELI, 'in-pen'),
      {
        source_round_ids: ids('eli', CAST.eli.rounds),
        confidence_factors: FACTORS,
        comparison: { lines: [{ source: 'team_pool', label: 'Team pool', value: 0.7, n: 186, n_noun: 'rounds', players: 9 }, { source: 'tour', label: 'Tour', value: 0.3 }] },
        diagnosis: { ...penalties(ELI).evidence.diagnosis, basis: { narrowing: steps([['Off the tee', '17 of 23 penalties came off the tee'], ['Finished right', '14 of 17 tee-shot penalties finished right of the fairway']]), checked: ['Club off the tee', 'shape: 14 of 17 right of the fairway', 'par: par 4s and par 5s'] } },
        cause: {
          state: 'observed_sequence',
          population: 'penalties',
          path: ['Driver off the tee', 'Right of the fairway', 'Penalty drop'],
          occurrences: 14,
          denominator: 23,
          distinct_rounds: 11,
          example_holes: [{ round_id: 'eli-r1', hole_number: 7 }, { round_id: 'eli-r2', hole_number: 14 }, { round_id: 'eli-r2', hole_number: 3 }, { round_id: 'eli-r4', hole_number: 11 }, { round_id: 'eli-r6', hole_number: 7 }],
          event_strokes: null,
          checked: { holes_with_full_record: 280, of: 378, fields_missing: ['lie'] },
        },
      },
      { metadata: { movement: { from: 1.4, to: 1.1, direction: 'down' }, last_refreshed_at: REFRESHED } as never },
    ),
  putts: () =>
    more(
      slope(JONAH, 'in-slope'),
      {
        source_round_ids: ids('jonah', CAST.jonah.rounds),
        confidence_factors: FACTORS,
        diagnosis: { symptom: 'Downhill putts from 4-6 ft', root_cause: '', causality_level: 'inferred_hypothesis', drivers: [], recommended_action: '', confidence_reason: 'sample adequate', basis: { narrowing: steps([['Downhill', '13 of 31 downhill putts from 4–6 ft were missed']]), checked: ['Distance of the putt', 'Slope of the putt'] } },
        cause: { state: 'not_traced', population: 'putts', count_down: { have_events: 6, need_events: 12, have_rounds: 3, need_rounds: 6 }, data_gap: { have_count: 6, target_count: 6, prompt: 'Track putts on 6 more greens' } },
      },
      { metadata: { last_refreshed_at: REFRESHED } as never },
    ),
  approach: () =>
    more(
      row(
        PRIYA,
        {
          id: 'in-approach',
          category: 'approach',
          priority: 'medium',
          title: 'Greens from 175+ yd: 43%',
          content: "From 175+ yd you're hitting 43% of greens over 28 approaches. Tour players hit 52%. Club up one on long approaches and aim at the middle of the green.",
          drills: [{ id: 'dr-long-iron', slug: 'long-iron-ladder', title: 'Long-iron ladder', duration_min: 15, difficulty: 'range' }],
        },
        { metric: 'approach_gir_175_plus_pct', metric_label: 'Greens in regulation from 175+ yd', polarity: 'higher_better', your_value: 43, your_value_display: '43%', comparison_value: 52, sample_n: 28, confidence: 0.8 },
      ),
      {
        source_round_ids: ids('priya', CAST.priya.rounds),
        comparison: { lines: [{ source: 'team_pool', label: 'Team pool', value: 49, n: 340, n_noun: 'approaches', players: 9 }, { source: 'tour', label: 'Tour', value: 52 }] },
        diagnosis: { symptom: 'Greens from 175+ yd', root_cause: '', causality_level: 'inferred_hypothesis', drivers: [], recommended_action: '', confidence_reason: 'sample adequate', basis: { narrowing: steps([['From 175+ yd', '16 of 28 approaches from 175+ yd missed the green'], ['On long par 4s', '12 of 16 misses came on long par 4s']]), checked: ['length: 16 of 28 from 175+ yd', 'par: long par 4s', 'shape: short and right'] } },
        // 12 of 20 is 60% and 11 of 40 is 27.5%, so the lift is 2.2 (the design page printed 2.1).
        cause: { state: 'inferred_hypothesis', alternatives: [{ label: 'Long par 4s', lift: 2.2, arm_a: { n: 20, failures: 12, rate: 0.6 }, arm_b: { n: 40, failures: 11, rate: 0.275 } }], checked: { holes_with_full_record: 52, of: 60, fields_missing: ['finish'] } },
      },
      { metadata: { movement: { from: 34, to: 43, direction: 'up' }, last_refreshed_at: REFRESHED } as never },
    ),
};

/** The lighter reads beside each one on the player's own list: only the fields they carry draw. */
const NEIGHBOURS: Record<string, () => EvidenceInsight[]> = {
  penalties: () => [
    bigNumber(ELI, 'in-dbl'),
    row(ELI, { id: 'in-tee', category: 'tee', priority: 'medium', title: 'Fairways with driver: 48%', content: "You're hitting 48% of fairways with driver. Tour players hit 59%." }, { metric: 'tee_fairway_driver_pct', metric_label: 'Fairways hit with driver', polarity: 'higher_better', your_value: 48, your_value_display: '48%', comparison_value: 59, sample_n: 9, confidence: 0.5, window_basis: 'lifetime' }),
  ],
  putts: () => [breakBias(JONAH, 'in-brk'), bigNumber(JONAH, 'in-dbl')],
  approach: () => [
    row(PRIYA, { id: 'in-sand', category: 'short_game', priority: 'low', title: 'Sand saves: 52%', content: "You're getting up and down from the sand 52% of the time. Tour players save 50%." }, { metric: 'scrambling_sand_save_pct', metric_label: 'Up and down from the sand', polarity: 'higher_better', your_value: 52, your_value_display: '52%', comparison_value: 50, sample_n: 23, confidence: 0.8 }),
    row(PRIYA, { id: 'in-lag', category: 'putting', priority: 'medium', title: 'Three-putts from 30+ ft: 14%', content: "You're three-putting 14% of first putts from 30+ ft. Tour players three-putt 9%." }, { metric: 'putt_three_putt_30_plus_pct', metric_label: 'Three-putts from 30+ ft', polarity: 'lower_better', your_value: 14, your_value_display: '14%', comparison_value: 9, sample_n: 29, confidence: 0.5 }),
  ],
};

const OWNER: Record<string, { id: string; cast: CastPlayer }> = { penalties: { id: ELI, cast: CAST.eli }, putts: { id: JONAH, cast: CAST.jonah }, approach: { id: PRIYA, cast: CAST.priya } };

type RoundSeed = readonly [date: string, course: string, score: number, toPar: number, holes?: number];
const ROUND_SEEDS: Record<string, { who: string; rounds: readonly RoundSeed[] }> = {
  penalties: { who: 'eli', rounds: [['2026-09-28', 'Oak Hollow', 74, 2], ['2026-09-21', 'Oak Hollow', 77, 5], ['2026-09-14', 'Pine Ridge', 72, 0], ['2026-09-07', 'Pine Ridge', 75, 3], ['2026-08-31', 'Lakeshore', 71, -1], ['2026-08-24', 'Oak Hollow', 79, 7], ['2026-08-17', 'Lakeshore', 38, 2, 9], ['2026-08-10', 'Pine Ridge', 78, 6]] },
  putts: { who: 'jonah', rounds: [['2026-09-28', 'Oak Hollow', 73, 1], ['2026-09-21', 'Oak Hollow', 75, 3], ['2026-09-14', 'Pine Ridge', 71, -1], ['2026-09-07', 'Pine Ridge', 74, 2], ['2026-08-31', 'Lakeshore', 72, 0], ['2026-08-24', 'Oak Hollow', 76, 4], ['2026-08-17', 'Pine Ridge', 74, 2], ['2026-08-10', 'Lakeshore', 75, 3]] },
  approach: { who: 'priya', rounds: [['2026-09-27', 'Lonnie Poole', 74, 2], ['2026-09-20', 'Hilltop', 76, 4], ['2026-09-13', 'Lonnie Poole', 72, 0], ['2026-09-06', 'Hilltop', 75, 3], ['2026-08-30', 'Lonnie Poole', 73, 1], ['2026-08-23', 'Hilltop', 77, 5], ['2026-08-16', 'Lonnie Poole', 74, 2], ['2026-08-09', 'Hilltop', 76, 4]] },
};
const roundsOf = (q: string): Map<string, DiveRoundRow> => {
  const { who, rounds } = ROUND_SEEDS[q]!;
  return new Map(rounds.map(([round_date, course_name, total_score, score_to_par, holes], i) => [`${who}-r${i + 1}`, { id: `${who}-r${i + 1}`, round_date, course_name, total_score, score_to_par, holes_played: holes ?? 18 }]));
};

/**
 * Eli's penalties round by round, so the trend, the rounds list and the read agree: 23 over 21 rounds (1.1 a round). The newest
 * eight are the listed rounds (2, 3, 0, 1, 0, 3, 1, 2, newest first: 12); the thirteen before them hold the other 11.
 */
const ELI_PENALTIES_LISTED = [2, 3, 0, 1, 0, 3, 1, 2];
const ELI_PENALTIES_EARLIER = [1, 0, 2, 1, 0, 1, 2, 0, 1, 1, 0, 1, 1];
/** The score on each hole the counted path names. */
const ELI_HOLES = [{ round_id: 'eli-r1', hole_number: 7, score: 5, par: 4 }, { round_id: 'eli-r2', hole_number: 14, score: 6, par: 4 }, { round_id: 'eli-r2', hole_number: 3, score: 5, par: 4 }, { round_id: 'eli-r4', hole_number: 11, score: 5, par: 4 }, { round_id: 'eli-r6', hole_number: 7, score: 6, par: 5 }];

const roundRow = (id: string, round_date: string, total_score: number, score_to_par: number, holes: number, penalties: number): ReadRoundRow => ({
  id,
  round_date,
  holes_played: holes,
  total_score,
  front_nine: holes === 18 ? Math.floor(total_score / 2) : total_score,
  back_nine: holes === 18 ? Math.ceil(total_score / 2) : null,
  total_putts: holes === 18 ? 31 : 16,
  score_to_par,
  strokes_gained_total: 0.4,
  strokes_gained_tee: 0.1,
  strokes_gained_approach: 0.1,
  strokes_gained_around_green: 0.1,
  strokes_gained_putting: 0.1,
  total_penalties: penalties,
});

/**
 * What the page reads beside the read: the player's rounds with their stats rows. `stale`: two rounds played after the read was last
 * made. The season starts 1 August, as `seasonStartDate` says it.
 */
function extrasOf(key: ReadPreviewKey, stale: boolean): ChReadExtras {
  const { who, rounds } = ROUND_SEEDS[key]!;
  const listed = rounds.map(([date, , score, toPar, holes], i) => roundRow(`${who}-r${i + 1}`, date, score, toPar, holes ?? 18, key === 'penalties' ? (ELI_PENALTIES_LISTED[i] ?? 0) : 0));
  // Twice a week through June and July, back from the first week of August.
  const earlier = key === 'penalties' ? ELI_PENALTIES_EARLIER.map((n, i) => roundRow(`eli-r${9 + i}`, new Date(Date.UTC(2026, 7, 6) - i * 3.5 * 86_400_000).toISOString().slice(0, 10), 74 + (i % 4), 2 + (i % 4), 18, n)) : [];
  const newer = stale ? [roundRow(`${who}-n1`, '2026-10-03', 73, 1, 18, 1), roundRow(`${who}-n2`, '2026-10-01', 75, 3, 18, 0)] : [];
  const all = [...newer, ...listed, ...earlier];
  const cache: ReadCacheRow[] = all.map((r) => ({ round_id: r.id, strokes_gained_total: r.strokes_gained_total, penalty_strokes: r.total_penalties }));
  return { rounds: all, cache, holes: key === 'penalties' ? ELI_HOLES : [], seasonSince: '2026-08-01' };
}

const DRILL_TEXT: Record<string, string> = {
  'in-slope': 'Rehearse a downhill-only ladder: start 2 ft below the hole and add a foot at a time, focused on dying the ball into the front of the cup rather than a firm strike.',
  'in-approach': 'Alternate 4- and 5-iron to a 30-yard-wide target at 175, 185 and 195 yards. Count greens out of 15, and log the number.',
};

const keyOf = (q: string | undefined): ReadPreviewKey => ((READ_PREVIEW_KEYS as readonly string[]).includes(q ?? '') ? (q as ReadPreviewKey) : 'penalties');

/**
 * A real row through the real shapers. `state`: `assigned` (a focus made from it and started), `proposed` (a coach proposed it; the
 * player has not answered), `focus` (the player's active focus), `stale` (a round played after the read was last made).
 */
export function previewReadView(q: string | undefined, role: 'coach' | 'player', gone = false, state?: string): ChReadView {
  const key = keyOf(q);
  const raw = RAW[key]!();
  const owner = { id: OWNER[key]!.id, name: OWNER[key]!.cast.name };
  const first = OWNER[key]!.cast.first;
  const viewer = role === 'coach' ? ({ role: 'coach', first } as const) : ({ role: 'player' } as const);
  const assigned: ChHelmAssigned | null = state === 'assigned' || state === 'focus' ? 'active' : state === 'proposed' ? 'proposed' : null;
  const focusAreas: DiveFocusRow[] = assigned ? [{ id: 'fa-read', title: raw.title, status: assigned, from_insight_id: raw.id, target_metric: raw.evidence.metric }] : [];
  const inputs = { rounds: roundsOf(key), focusAreas, goals: [], themes: null };
  const deepOf = (r: EvidenceInsight) => {
    const own = r.id === raw.id;
    const base = toChInsight(r, {
      tour: PREVIEW_TOUR,
      viewer,
      drillText: DRILL_TEXT[r.id] ?? null,
      assigned: own ? assigned : null,
      newestRound: own && state === 'stale' ? '2026-10-03' : null,
      // The engine's parts as production draws them with their flags on: the cause state on the Why line, the claim ladder, the chips.
      engine: own ? { flags: { support: true, cause: true } as never, now: '2026-10-01T12:00:00.000Z', viewer, corrections: { role, latest: null, laterRounds: null } } : undefined,
    });
    return toChDeepInsight(r, base, own ? inputs : { ...inputs, rounds: new Map(), focusAreas: [] }, (t) => speak(t, viewer), role);
  };
  const others = NEIGHBOURS[key]!();
  const list = orderDive([deepOf(raw), ...others.map(deepOf)]);
  const dive: ChDeepDive = { list, tour: 'Tour', rounds: null, themes: {}, roundsFailed: false, plansFailed: false, themesFailed: false, counts: diveCounts(list) };
  const head = { playerId: role === 'coach' ? owner.id : null, name: role === 'coach' ? owner.name : 'You', first: role === 'coach' ? first : 'You' };
  // The team pool call is on, as production has it with coachhelm_team_pool_v1 on: a coach's ladder carries it, a player's never does.
  const view = toChReadView(dive, new Map([raw, ...others].map((r) => [r.id, r])), gone ? 'gone' : raw.id, role, head, { ...READ_CALLS, teamPool: true }, extrasOf(key, state === 'stale'));
  // A player's page knows who their coach is (the shared cast's head coach), for Message Coach Reyes.
  return role === 'player' ? { ...view, coach: { name: CAST_COACH.formal, userId: 'user-coach-reyes' } } : view;
}

/** Who a coach's preview is about, as the route's scope would say it. */
export function previewReadHead(q: string | undefined): { playerId: string; name: string; first: string; line: string } {
  const { id, cast } = OWNER[keyOf(q)]!;
  const last = { penalties: 'Last round Sep 28, 3 days ago', putts: 'Last round Sep 28, 3 days ago', approach: 'Last round Sep 27, 4 days ago' }[keyOf(q)];
  return { playerId: id, name: cast.name, first: cast.first, line: `${cast.classYear} · ${last}` };
}
