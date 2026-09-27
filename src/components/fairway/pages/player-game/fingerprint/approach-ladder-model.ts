/**
 * Serializable shape for the coach-only approach distance ladder. Built on the
 * server (game/sections/loadApproachLadder.ts) from APPROACH shots only, meaning
 * shots whose starting lie is neither the tee nor the green. It is shot-level SG
 * against the default baseline (`buildDefaultBaseline`), which is NOT the
 * stats-cache baseline behind the waterfall, so it is always labelled as such
 * and never shares a heading with it.
 */

export const LADDER_MIN_YARDS = 50;
export const LADDER_MAX_YARDS = 250;
/** Below this many shots a band is drawn as an outline and called thin. */
export const LADDER_THIN_SHOTS = 5;

export interface ApproachLadderBand {
  start: number;
  end: number;
  shots: number;
  /** Average shot-level strokes gained per shot. */
  avgSg: number;
  /** Average leave to the hole after the shot, feet. */
  leaveFeet: number;
  /** 0..100 share of these shots that finished on the green. */
  greenPct: number;
}

export interface ApproachLadderData {
  bands: ApproachLadderBand[];
  shots: number;
  rounds: number;
  windowDays: number;
}
