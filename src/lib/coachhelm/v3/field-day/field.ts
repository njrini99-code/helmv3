/**
 * Same-day field adjustment (CoachHelm supercharge Slice 7b; `03` §5.2,
 * `01` row 11, `07` §B "Same-day field adjustment").
 *
 * When at least 3 teammates post a round on the same day on the same course,
 * the day's conditions (wind, pins, a hard set-up) hit all of them. A round's
 * score relative to that field separates "a bad day for the player" from "a
 * hard day for everyone". Each round in such a field gets its per-18 score to
 * par minus the field's mean per-18 score to par that day (every member's
 * round, the player's own included, as `03` §5.2 says: "relative to the
 * team's mean that day").
 *
 * Computed on read and pure: no table (the design's side table is optional,
 * "store ... in the stats cache or a side table"; the field is a few rounds,
 * so recomputing it costs less than keeping one current). Rounds without a
 * `course_id` or a score cannot join a field.
 *
 * Audit wording: {@link FIELD_DAY_LABEL}.
 */

/** `03` §5.2: rounds on one (team, day, course) that make a field. */
export const FIELD_MIN_MEMBERS = 3;
/** The audit view's words (`03` §5.2). */
export const FIELD_DAY_LABEL = 'Relative to the team on the day';

export interface FieldRoundInput {
  round_id: string;
  player_id: string;
  team_id: string | null;
  /** YYYY-MM-DD. */
  date: string;
  course_id: string | null;
  /** Raw score to par (a 9-hole round is a 9-hole total). */
  score_to_par: number | null;
  holes: number;
}

export interface FieldDayEntry {
  round_id: string;
  player_id: string;
  /** Players in the field (distinct). */
  field_n: number;
  /** The field's mean per-18 score to par. */
  field_mean: number;
  /** This round's per-18 score to par minus the field mean (positive = worse than the team that day). */
  relative: number;
}

/** round id → its field entry, for rounds that sat in a field of 3 or more. */
export type FieldDayContext = ReadonlyMap<string, FieldDayEntry>;

function per18(r: FieldRoundInput): number | null {
  if (r.score_to_par === null || !Number.isFinite(r.score_to_par)) return null;
  const holes = r.holes > 0 ? r.holes : 18;
  return (r.score_to_par * 18) / holes;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The field context for a set of rounds. A player with two rounds in one
 * field (two rounds a day) counts once in `field_n`, and the field mean is the
 * mean over rounds.
 */
export function buildFieldDayContext(rounds: readonly FieldRoundInput[]): FieldDayContext {
  const groups = new Map<string, Array<{ r: FieldRoundInput; v: number }>>();
  for (const r of rounds) {
    if (!r.team_id || !r.course_id || !r.date) continue;
    const v = per18(r);
    if (v === null) continue;
    const key = `${r.team_id}|${r.date.slice(0, 10)}|${r.course_id}`;
    const g = groups.get(key) ?? [];
    g.push({ r, v });
    groups.set(key, g);
  }
  const out = new Map<string, FieldDayEntry>();
  for (const g of groups.values()) {
    const players = new Set(g.map((x) => x.r.player_id)).size;
    if (players < FIELD_MIN_MEMBERS) continue;
    const mean = g.reduce((s, x) => s + x.v, 0) / g.length;
    for (const { r, v } of g) {
      out.set(r.round_id, {
        round_id: r.round_id,
        player_id: r.player_id,
        field_n: players,
        field_mean: round2(mean),
        relative: round2(v - mean),
      });
    }
  }
  return out;
}

export interface FieldSideSummary {
  /** Rounds on this side that sat in a field. */
  n: number;
  /** Mean relative-to-field score over them; null when none. */
  mean_relative: number | null;
}

/** Field summary of a set of the player's rounds. */
export function summariseFieldSide(roundIds: readonly string[], ctx: FieldDayContext): FieldSideSummary {
  const vals = roundIds.map((id) => ctx.get(id)?.relative).filter((v): v is number => typeof v === 'number');
  return { n: vals.length, mean_relative: vals.length ? round2(vals.reduce((s, v) => s + v, 0) / vals.length) : null };
}

/** Rounds per side the pressure field gap needs (the pressure read's own floor). */
export const FIELD_PRESSURE_MIN_PER_SIDE = 3;

export interface PressureFieldSummary {
  label: typeof FIELD_DAY_LABEL;
  practice: FieldSideSummary;
  pressure: FieldSideSummary;
  /**
   * Pressure minus practice, each relative to the team on the day: the
   * pressure gap with the day's course and conditions taken out. Null below
   * {@link FIELD_PRESSURE_MIN_PER_SIDE} field rounds on either side.
   */
  gap: number | null;
}

/** The pressure read's field context (`03` §5.2). */
export function pressureFieldSummary(
  practiceIds: readonly string[],
  pressureIds: readonly string[],
  ctx: FieldDayContext,
): PressureFieldSummary {
  const practice = summariseFieldSide(practiceIds, ctx);
  const pressure = summariseFieldSide(pressureIds, ctx);
  const gap =
    practice.n >= FIELD_PRESSURE_MIN_PER_SIDE &&
    pressure.n >= FIELD_PRESSURE_MIN_PER_SIDE &&
    practice.mean_relative !== null &&
    pressure.mean_relative !== null
      ? round2(pressure.mean_relative - practice.mean_relative)
      : null;
  return { label: FIELD_DAY_LABEL, practice, pressure, gap };
}
