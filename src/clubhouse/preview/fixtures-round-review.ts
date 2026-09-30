import { toHoles, toReview, type ChHoleRow, type ChReviewRoundRow, type ChRoundReview, type ChShotRow } from '../data/round-review-shape';
import { previewRoundId } from './fixtures-rounds';

/**
 * A round review from design/handoff/rounds-review.jsx: Finley GC, Blue tees
 * (6,984 yds, 73.1 / 133), Wed Oct 14, practice, 74 (+2). Holes and shots are
 * built like the board's `buildRound` and go through the page's own shaping.
 */

// Finley GC, Blue: [par, yards] (rounds-data.js FINLEY scaled to 6,984).
const FINLEY: Array<[number, number]> = [
  [4, 397],
  [5, 518],
  [3, 170],
  [4, 381],
  [4, 425],
  [3, 197],
  [5, 532],
  [4, 355],
  [4, 412],
  [4, 388],
  [4, 371],
  [3, 181],
  [5, 541],
  [4, 417],
  [4, 343],
  [3, 161],
  [5, 504],
  [4, 441],
];
// Strokes against par per hole: +2 over the round, a bogey on each par 5 and two birdies.
const PATTERN = [0, 1, 0, 0, -1, 0, 1, 0, 0, 0, -1, 0, 1, 0, 0, 0, 1, 0];

function build(): { holes: ChHoleRow[]; shots: ChShotRow[] } {
  const holes: ChHoleRow[] = [];
  const shots: ChShotRow[] = [];
  FINLEY.forEach(([par, y], i) => {
    const n = i + 1;
    const d = PATTERN[i]!;
    const score = par + d;
    const putts = d < 0 ? 1 : d > 0 && i % 2 ? 3 : 2;
    const teeLie = par === 3 ? (d <= 0 ? 'green' : 'sand') : i % 3 === 1 ? 'rough' : 'fairway';
    let k = 0;
    const add = (s: Partial<ChShotRow>) =>
      shots.push({
        hole_number: n,
        shot_number: ++k,
        shot_type: 'approach',
        club_type: null,
        result: 'green',
        lie_after: 'green',
        distance_to_hole_before: null,
        distance_unit_before: 'yards',
        distance_to_hole_after: null,
        distance_unit_after: 'yards',
        miss_direction: null,
        putt_break: null,
        putt_slope: null,
        is_penalty: false,
        ...s,
      });
    const teeTo = par === 3 ? (teeLie === 'green' ? 24 : 18) : Math.round(y * (par === 5 ? 0.46 : 0.36));
    add({
      shot_type: 'tee',
      club_type: par === 3 ? null : i % 4 === 2 ? 'non_driver' : 'driver',
      result: teeLie,
      lie_after: teeLie,
      distance_to_hole_before: y,
      distance_to_hole_after: teeTo,
      distance_unit_after: teeLie === 'green' ? 'feet' : 'yards',
      miss_direction: teeLie === 'rough' ? 'right' : null,
    });
    let from = teeTo;
    let fromUnit = teeLie === 'green' ? 'feet' : 'yards';
    const approaches = Math.max(0, score - putts - 1);
    for (let a = 0; a < approaches; a++) {
      const last = a === approaches - 1;
      const to = last ? 12 + ((i * 7) % 26) : Math.round(from * 0.3);
      add({
        shot_type: from < 40 ? 'around_green' : 'approach',
        result: last ? 'green' : 'fairway',
        lie_after: last ? 'green' : 'fairway',
        distance_to_hole_before: from,
        distance_unit_before: fromUnit,
        distance_to_hole_after: to,
        distance_unit_after: last ? 'feet' : 'yards',
      });
      from = to;
      fromUnit = last ? 'feet' : 'yards';
    }
    for (let p = 0; p < putts; p++) {
      const last = p === putts - 1;
      add({
        shot_type: 'putting',
        club_type: 'putter',
        result: last ? 'hole' : 'green',
        lie_after: last ? 'hole' : 'green',
        distance_to_hole_before: p === 0 ? from : 3,
        distance_unit_before: 'feet',
        distance_to_hole_after: last ? 0 : 3,
        distance_unit_after: 'feet',
        putt_break: ['left_to_right', 'straight', 'right_to_left'][i % 3]!,
        putt_slope: ['uphill', 'level', 'downhill'][i % 3]!,
      });
    }
    holes.push({ hole_number: n, par, yardage: y, score, putts, fairway_hit: par === 3 ? null : teeLie === 'fairway', gir: score - putts <= par - 2, penalty_strokes: 0 });
  });
  return { holes, shots };
}

const { holes: HOLES, shots: SHOTS } = build();
const sum = (from: number, to: number, k: 'score' | 'par') => HOLES.filter((h) => h.hole_number >= from && h.hole_number <= to).reduce((a, h) => a + (h[k] ?? 0), 0);

export const PREVIEW_REVIEW_ROUND: ChReviewRoundRow = {
  id: previewRoundId(99),
  player_id: 'preview-player',
  course_name: 'Finley GC',
  tees_played: 'Blue',
  round_date: '2026-10-14',
  round_type: 'practice',
  total_score: sum(1, 18, 'score'),
  score_to_par: sum(1, 18, 'score') - sum(1, 18, 'par'),
  front_nine: sum(1, 9, 'score'),
  back_nine: sum(10, 18, 'score'),
  holes_played: 18,
  total_putts: HOLES.reduce((a, h) => a + (h.putts ?? 0), 0),
  total_fairways_hit: HOLES.filter((h) => h.fairway_hit).length,
  total_fairways: HOLES.filter((h) => h.par !== 3).length,
  total_gir: HOLES.filter((h) => h.gir).length,
  total_gir_possible: 18,
  course_rating: 73.1,
  course_slope: 133,
  ai_recap:
    'Ball-striking carried this one at Finley. The damage came on the par 5s, where four bogeys undid two birdies, and the putter held steady. Scoring the long holes is the work before Thursday.',
  notes: 'Wind picked up on the back nine. Lag putting felt good.',
};

const review = (over: Partial<Parameters<typeof toReview>[1]> = {}, row: Partial<ChReviewRoundRow> = {}): ChRoundReview =>
  toReview({ ...PREVIEW_REVIEW_ROUND, ...row }, { holes: toHoles(HOLES, SHOTS), holesError: false, shotsError: false, playerName: null, teeYards: 6984, ...over });

export const PREVIEW_REVIEW = review();
export const PREVIEW_REVIEW_COACH = review({ playerName: 'Jonah Okafor' });
export const PREVIEW_REVIEW_NO_SHOTS = review({ shotsError: true });
export const PREVIEW_REVIEW_NO_HOLES = review({ holes: [], holesError: true });
/** Posted with its score only: no holes, no recap, no notes. */
export const PREVIEW_REVIEW_TOTAL_ONLY = review({ holes: [] }, { ai_recap: null, notes: null });
export const PREVIEW_REVIEW_HOLE_BY_HOLE = review({ holes: toHoles(HOLES, []) });
export { HOLES as PREVIEW_REVIEW_HOLES, SHOTS as PREVIEW_REVIEW_SHOTS };
