import { withCanonicalRoundTotal } from '@/lib/golf/round-total';
import type { ChSgTour } from '../lib/sg';
import { roundType, teeColorFor, teeLabel, type ChRoundType, type ChTeeColor } from './rounds-shape';

/**
 * A round's review (Clubhouse P011; design/handoff/rounds-review.jsx): the
 * shapes and the pure steps that build them from `golf_rounds`, `golf_holes`
 * and `golf_shots`, kept apart from the server loader so the preview and
 * tests use the same code.
 */

export type ChLie = 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'hole' | 'penalty' | 'other';

export interface ChReviewShot {
  n: number;
  /** "Tee", "Approach", "Around green", "Putt", "Penalty" */
  kind: string;
  /** "Driver", "Non-driver"; null when not a tee club or not recorded. */
  club: string | null;
  /** "395 yds", "24 ft"; null when not recorded. */
  from: string | null;
  /** Where it finished: "Fairway", "Holed", ... */
  lie: ChLie;
  /** "152 yds"; null once holed or not recorded. */
  to: string | null;
  /** "missed short right"; null when it didn't miss or it wasn't recorded. */
  miss: string | null;
  /** "Left to right · uphill" for a putt with its read recorded. */
  read: string | null;
  penalty: boolean;
}

export interface ChReviewHole {
  n: number;
  par: number | null;
  yards: number | null;
  score: number | null;
  putts: number | null;
  /** null on a par 3 or when not recorded. */
  fairway: boolean | null;
  gir: boolean | null;
  penalties: number;
  shots: ChReviewShot[];
}

/** The round's strokes gained (golf_rounds.strokes_gained_*): the total and the four legs, positive is gained. A leg the round has no value for is null. */
export interface ChReviewSg {
  total: number | null;
  tee: number | null;
  approach: number | null;
  around: number | null;
  putting: number | null;
}

export interface ChRoundReview {
  id: string;
  playerId: string;
  /** The player's name, for a coach viewing; null for the player's own round (or for a coach's view whose name didn't load: `playerError`). */
  playerName: string | null;
  /**
   * A coach is looking (Back to Stats, whose notes). Said outright, not read from `playerName`: a name that failed to load is null
   * too. Absent in a fixture: then a name means a coach.
   */
  coachView?: boolean;
  date: string;
  course: string;
  tee: string | null;
  teeColor: ChTeeColor | null;
  type: ChRoundType | null;
  /** "6,984 yds · 73.1 / 133": whatever of yards, rating and slope is known. */
  teeFacts: string | null;
  holesPlayed: number;
  /** The round's total; null when none is recorded (the hero says so: never drawn as 0 strokes). */
  score: number | null;
  toPar: number | null;
  front: { score: number | null; toPar: number | null };
  back: { score: number | null; toPar: number | null };
  putts: number | null;
  fairways: { hit: number; of: number } | null;
  greens: { hit: number; of: number } | null;
  /** Null when the round has no strokes gained at all (posted without shots). */
  strokesGained: ChReviewSg | null;
  /** What that strokes gained is measured against; null when the player's team isn't known. */
  tour: ChSgTour;
  /** The AI recap stored on the round; null when none was written. */
  recap: string | null;
  /** What the player wrote about the round when posting it. */
  notes: string | null;
  holes: ChReviewHole[];
  /** The holes read failed: the totals still show, the card and shots don't. */
  holesError: boolean;
  /** The shots read failed: the card shows, each hole's shots don't. */
  shotsError: boolean;
  /** The tee's read failed: the tee's yardage is missing from the hero, which says so. */
  teeError?: boolean;
  /** A coach's read of the player's name failed, or found no player row: the name is missing, and the page says so (never an invented "Player"). */
  playerError?: boolean;
  /** The team's read failed: which Tour the strokes gained is measured against is unknown, and the card says so (no team at all is not this). */
  tourError?: boolean;
}

export type ChDistribution = Array<{ label: 'Eagle+' | 'Birdie' | 'Par' | 'Bogey' | 'Double+'; count: number }>;

const KIND: Record<string, string> = { tee: 'Tee', approach: 'Approach', around_green: 'Around green', putting: 'Putt', penalty: 'Penalty' };
const CLUB: Record<string, string> = { driver: 'Driver', non_driver: 'Non-driver' };
const LIES: ReadonlyArray<ChLie> = ['fairway', 'rough', 'sand', 'green', 'hole', 'penalty', 'other'];
const BREAK: Record<string, string> = { left_to_right: 'Left to right', right_to_left: 'Right to left', straight: 'Straight', multiple: 'Multiple breaks' };

export type ChShotRow = {
  hole_number: number | null;
  shot_number: number;
  shot_type: string | null;
  club_type: string | null;
  result: string | null;
  lie_after: string | null;
  distance_to_hole_before: number | null;
  distance_unit_before: string | null;
  distance_to_hole_after: number | null;
  distance_unit_after: string | null;
  miss_direction: string | null;
  putt_break: string | null;
  putt_slope: string | null;
  is_penalty: boolean | null;
};

export type ChHoleRow = {
  hole_number: number;
  par: number | null;
  yardage: number | null;
  score: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  gir: boolean | null;
  penalty_strokes: number | null;
};

const dist = (v: number | null, unit: string | null) => (v == null ? null : `${Math.round(v)} ${unit === 'feet' ? 'ft' : 'yds'}`);

export function toShot(r: ChShotRow): ChReviewShot {
  const raw = (r.result ?? r.lie_after ?? 'other').toLowerCase();
  const lie: ChLie = (LIES as readonly string[]).includes(raw) ? (raw as ChLie) : 'other';
  const penalty = r.shot_type === 'penalty' || r.is_penalty === true;
  return {
    n: r.shot_number,
    kind: KIND[r.shot_type ?? ''] ?? 'Shot',
    club: r.shot_type === 'tee' ? (CLUB[r.club_type ?? ''] ?? null) : null,
    from: dist(r.distance_to_hole_before, r.distance_unit_before),
    lie,
    to: lie === 'hole' ? null : dist(r.distance_to_hole_after, r.distance_unit_after),
    miss: r.miss_direction ? `missed ${r.miss_direction.replace(/_/g, ' ')}` : null,
    read: r.shot_type === 'putting' && r.putt_break ? [BREAK[r.putt_break] ?? r.putt_break, r.putt_slope].filter(Boolean).join(' · ') : null,
    penalty,
  };
}

export function toHoles(holes: ChHoleRow[], shots: ChShotRow[]): ChReviewHole[] {
  const byHole = new Map<number, ChReviewShot[]>();
  for (const s of [...shots].sort((a, b) => (a.hole_number ?? 0) - (b.hole_number ?? 0) || a.shot_number - b.shot_number)) {
    if (s.hole_number == null) continue;
    const xs = byHole.get(s.hole_number) ?? [];
    xs.push(toShot(s));
    byHole.set(s.hole_number, xs);
  }
  return [...holes]
    .sort((a, b) => a.hole_number - b.hole_number)
    .map((h) => ({
      n: h.hole_number,
      par: h.par,
      yards: h.yardage,
      score: h.score,
      putts: h.putts,
      fairway: h.par === 3 ? null : h.fairway_hit,
      gir: h.gir,
      penalties: h.penalty_strokes ?? 0,
      shots: byHole.get(h.hole_number) ?? [],
    }));
}

/** Score and to par for a stretch of holes; null when any hole in it has no score. */
export function nineOf(holes: ChReviewHole[], from: number, to: number): { score: number | null; toPar: number | null } {
  const hs = holes.filter((h) => h.n >= from && h.n <= to);
  if (!hs.length || hs.some((h) => h.score == null)) return { score: null, toPar: null };
  const score = hs.reduce((a, h) => a + (h.score ?? 0), 0);
  return { score, toPar: hs.every((h) => h.par != null) ? score - hs.reduce((a, h) => a + (h.par ?? 0), 0) : null };
}

export function distribution(holes: ChReviewHole[]): ChDistribution {
  const d = holes.filter((h) => h.score != null && h.par != null).map((h) => (h.score as number) - (h.par as number));
  return [
    { label: 'Eagle+', count: d.filter((x) => x <= -2).length },
    { label: 'Birdie', count: d.filter((x) => x === -1).length },
    { label: 'Par', count: d.filter((x) => x === 0).length },
    { label: 'Bogey', count: d.filter((x) => x === 1).length },
    { label: 'Double+', count: d.filter((x) => x >= 2).length },
  ];
}

export type ChReviewRoundRow = {
  id: string;
  player_id: string;
  course_name: string | null;
  tees_played: string | null;
  round_date: string;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
  front_nine: number | null;
  back_nine: number | null;
  holes_played: number | null;
  total_putts: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  course_rating: number | null;
  course_slope: number | null;
  ai_recap: string | null;
  notes: string | null;
  strokes_gained_total: number | null;
  strokes_gained_tee: number | null;
  strokes_gained_approach: number | null;
  strokes_gained_around_green: number | null;
  strokes_gained_putting: number | null;
};

/** The round's strokes gained; null when none of the five values is there. */
export function sgOf(r: ChReviewRoundRow): ChReviewSg | null {
  const sg = { total: r.strokes_gained_total, tee: r.strokes_gained_tee, approach: r.strokes_gained_approach, around: r.strokes_gained_around_green, putting: r.strokes_gained_putting };
  return Object.values(sg).some((v) => v != null) ? sg : null;
}

export function toReview(
  r: ChReviewRoundRow,
  input: {
    holes: ChReviewHole[];
    holesError: boolean;
    shotsError: boolean;
    playerName: string | null;
    teeYards: number | null;
    tour?: ChSgTour;
    coachView?: boolean;
    teeError?: boolean;
    playerError?: boolean;
    tourError?: boolean;
  },
): ChRoundReview {
  const c = withCanonicalRoundTotal(r);
  // No total is no total: it is never drawn as 0 strokes.
  const score = c.total_score;
  const facts = [input.teeYards ? `${input.teeYards.toLocaleString('en-US')} yds` : null, r.course_rating && r.course_slope ? `${r.course_rating} / ${r.course_slope}` : null].filter(Boolean);
  const front = input.holes.length ? nineOf(input.holes, 1, 9) : { score: r.front_nine, toPar: null };
  const back = input.holes.length ? nineOf(input.holes, 10, 18) : { score: r.back_nine, toPar: null };
  return {
    id: r.id,
    playerId: r.player_id,
    playerName: input.playerName,
    ...(input.coachView === undefined ? {} : { coachView: input.coachView }),
    date: r.round_date.slice(0, 10),
    course: r.course_name?.trim() || 'Course not recorded',
    tee: teeLabel(r.tees_played),
    teeColor: teeColorFor(r.tees_played),
    type: roundType(r.round_type),
    teeFacts: facts.length ? facts.join(' · ') : null,
    holesPlayed: r.holes_played ?? 18,
    score,
    toPar: c.score_to_par,
    front,
    back: (r.holes_played ?? 18) === 9 ? { score: null, toPar: null } : back,
    putts: r.total_putts,
    fairways: r.total_fairways ? { hit: r.total_fairways_hit ?? 0, of: r.total_fairways } : null,
    greens: r.total_gir_possible ? { hit: r.total_gir ?? 0, of: r.total_gir_possible } : null,
    strokesGained: sgOf(r),
    tour: input.tour ?? null,
    recap: r.ai_recap?.trim() || null,
    notes: r.notes?.trim() || null,
    holes: input.holes,
    holesError: input.holesError,
    shotsError: input.shotsError,
    ...(input.teeError ? { teeError: true } : {}),
    ...(input.playerError ? { playerError: true } : {}),
    ...(input.tourError ? { tourError: true } : {}),
  };
}
