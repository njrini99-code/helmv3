/**
 * CoachHelm analyst: the fact sheet's shapes.
 *
 * A fact sheet is a typed, deterministic description of ONE player for ONE run:
 * every measure with its value, sample, window, 95% range, the same measure for
 * the player's previous window, the team's spread and the Tour figure. Code
 * measures; a model judges and writes from it later; code checks the model
 * against it. Nothing here is prose for a coach.
 *
 * Pure types: no Supabase, no React, no `server-only`.
 */

/** The named windows. Never "all time": a figure always says which rounds it read. */
export type WindowKey = 'last10' | 'previous10' | 'season';

/** How many rounds the two rolling windows cut (Stats' default "Last 10" and its "vs previous 10"). */
export const WINDOW_ROUNDS = 10;

export interface WindowRef {
  key: WindowKey;
  /** Plain words: "Last 10 rounds", "The 10 rounds before those", "This season". */
  label: string;
  /** Rounds in the window (18-hole rounds that count, practice left out). */
  rounds: number;
  /** First and last round date in the window (YYYY-MM-DD); null when it holds no round. */
  from: string | null;
  to: string | null;
  /** Newest first. */
  round_ids: string[];
}

export type MeasureUnit =
  | 'strokes_per_round'
  | 'strokes'
  | 'strokes_per_hole'
  | 'percent'
  | 'feet'
  | 'putts_per_round'
  | 'per_round';

export type Direction = 'higher_is_better' | 'lower_is_better';

/** The part of the game a measure belongs to. One candidate is raised per area. */
export type MeasureArea =
  | 'scoring'
  | 'off_the_tee'
  | 'approach'
  | 'around_the_green'
  | 'putting'
  | 'course_management'
  | 'pressure';

/**
 * `outcome`: the round's result (scoring average, strokes gained total): what the other measures explain.
 * `area`: one part of the game in strokes (the four strokes-gained areas).
 * `detail`: a rate or distance inside an area.
 */
export type MeasureLevel = 'outcome' | 'area' | 'detail';

/**
 * What the figure was read from.
 *   logged_shots        measured shot by shot (strokes gained with shots logged, make rates, approach bands)
 *   scorecard           counted from the hole-by-hole card (greens, fairways, putts, penalties, scoring by par)
 *   scorecard_estimate  strokes gained for a round with no shots logged: fixed credits from the card, NOT on the Tour's scale
 *   round_scores        the round's posted score
 */
export type MeasureBasis = 'logged_shots' | 'scorecard' | 'scorecard_estimate' | 'round_scores';

/** What a sample counts ("31 putts over 9 rounds"). */
export type SampleUnit = 'rounds' | 'holes' | 'putts' | 'approach_shots' | 'chances';

/**
 * The sufficient statistics a test needs, kept beside the value so a later check can redo the arithmetic.
 *   proportion: successes of attempts.
 *   mean: the estimate's standard error and degrees of freedom (n − 1 for a plain mean; Welch's for a difference of two means).
 *         `sd` is the spread of the observations where the figure is a plain mean, else null.
 */
export type FigureStat =
  | { kind: 'proportion'; successes: number; attempts: number }
  | { kind: 'mean'; n: number; sd: number | null; se: number | null; df: number | null };

export interface Range95 {
  low: number;
  high: number;
  /** How it was computed: Wilson score (a rate), Student t (a mean), Welch (a difference of two means). */
  method: 'wilson' | 't' | 'welch';
}

export interface WindowFigure {
  window: { key: WindowKey; label: string; rounds: number; from: string | null; to: string | null };
  /** Null when the sample is under the floor the Stats screen uses for this figure (see `withheld`). */
  value: number | null;
  /** Two-sided 95% range of `value`; null when the value is withheld or one observation gives no spread. */
  range95: Range95 | null;
  sample: {
    /** How many of `unit` the figure rests on. */
    attempts: number;
    unit: SampleUnit;
    /** How many rounds those came from. */
    rounds: number;
  };
  stat: FigureStat | null;
  /** Why there is no value: the floor in plain words ("needs 10 putts in the band; 6 so far"). */
  withheld?: string;
}

export interface TeammateFigure {
  /** Ids only: no names travel with a fact sheet. */
  player_id: string;
  value: number;
  attempts: number;
  rounds: number;
}

/**
 * Where the team sits on a measure over each teammate's own last 10 rounds. The player the sheet is about is NOT in it
 * (leave-one-out), so their own figure cannot move the median it is compared with.
 */
export interface TeamDistribution {
  /** A player never sees a teammate's figures: drop this block (`withoutCoachOnly`) before anything reaches a player. */
  audience: 'coach_only';
  window: 'last10';
  /** Teammates with a value at the measure's floor, ordered by player id. */
  teammates: TeammateFigure[];
  n: number;
  median: number | null;
  /** Median absolute deviation from the median. */
  mad: number | null;
  /** MAD × 1.4826: the robust stand-in for a standard deviation. Null when MAD is 0 or there are no teammates. */
  spread: number | null;
  min: number | null;
  max: number | null;
}

/**
 *   measured       a published Tour statistic from the standards table
 *   approximate    a figure the table's own source note calls an estimate, or a band anchor never cross-checked (approach green-hit)
 *   by_definition  strokes gained is measured against the Tour, so the Tour's own figure is zero
 */
export type TourProvenance = 'measured' | 'approximate' | 'by_definition';

export interface TourFigure {
  value: number;
  tour: 'pga' | 'lpga';
  provenance: TourProvenance;
  /** Where the number comes from (the standards row's source note, or the code constant). */
  source: string;
}

export interface MeasureFact {
  id: string;
  /** Full words: no "SG", "GIR" or "ft". */
  label: string;
  unit: MeasureUnit;
  direction: Direction;
  area: MeasureArea;
  level: MeasureLevel;
  basis: MeasureBasis;
  /** True only for strokes gained estimated from the scorecard. An estimate is never blended with a measured figure. */
  estimated: boolean;
  /** The existing function or table the number comes from. */
  source: string;
  /** The player's last 10 rounds. */
  current: WindowFigure;
  /** The same measure over the 10 rounds before those; null when the player has fewer than three earlier rounds. */
  previous: WindowFigure | null;
  season: WindowFigure;
  /** Null when the sheet was built without teammates. */
  team: TeamDistribution | null;
  /** Null where the Tour has no figure on the same basis. */
  tour: TourFigure | null;
  /**
   * Strokes gained only: the figure the Stats screen prints for the last 10 rounds, which averages measured and estimated
   * rounds together. Kept so a number quoted from the screen can be traced; `blended` says whether the two were mixed.
   */
  screen?: { value: number | null; rounds: number; blended: boolean };
}

/** One round's stored strokes gained, for the checks that pair the areas round by round. */
export interface RoundStrokesGained {
  round_id: string;
  date: string;
  /** True when the round has shots logged (measured); false when the figure is the scorecard estimate. */
  measured: boolean;
  total: number | null;
  off_the_tee: number | null;
  approach: number | null;
  around_the_green: number | null;
  putting: number | null;
}

export interface FactSheet {
  version: 1;
  team_id: string;
  player_id: string;
  /** The day the sheet was built for (YYYY-MM-DD). The builder never reads the clock. */
  as_of: string;
  timezone: string;
  season_start: string;
  tour: 'pga' | 'lpga';
  /** The baseline strokes gained is measured against: the Tour curve, scaled for a women's team. */
  strokes_gained_baseline: 'pga_tour' | 'womens';
  windows: { last10: WindowRef; previous10: WindowRef | null; season: WindowRef };
  /** The last 10 rounds' stored strokes gained, newest first, each marked measured or estimated. */
  strokes_gained_by_round: RoundStrokesGained[];
  measures: MeasureFact[];
  /** Things a reader must know about the data behind this sheet ("4 of the last 10 rounds have no shots logged"). */
  notes: string[];
}

/** A fact sheet with every coach-only block removed: what may travel toward a player. */
export function withoutCoachOnly(sheet: FactSheet): FactSheet {
  return { ...sheet, measures: sheet.measures.map((m) => ({ ...m, team: null })) };
}
