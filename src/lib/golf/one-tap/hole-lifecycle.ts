import { inFeature } from '../course-geometry/spatial';
import type { LocalFeature, PointM } from '../course-geometry/types';
import { greenComplexProbability, type LiePosterior } from './lie-classifier';
import type { ShotAnchor, TerminalMethod } from './shot-anchor';

/** Hole completion (master plan "Hole completion"). CUP_MARK is the first
 * release model: the player's final MARK BALL at the cup. PIN_KNOWN needs a
 * verified current pin (UNSPECIFIED for Peek'n Peak). NEXT_TEE_INFERRED is the
 * operational fallback and never invents a final exact distance. */
export const NEXT_TEE_RULE = Object.freeze({ greenProbability: .7, minDistanceFromGreenM: 60, dwellMs: 10_000 });
export const DAILY_PIN = 'UNSPECIFIED' as const;
/** §14: "At the cup? Finish hole" is offered once the last mark plausibly sits
 * in the green complex. Lower than the inference bar on purpose: a pin cut
 * near the edge gives a boundary posterior, and the golfer's explicit tap
 * costs nothing when wrong, while a missing offer blocks the hole. */
export const FINISH_HOLE_RULE = Object.freeze({ greenComplexProbability: .35 });
export function markTerminal(anchors: readonly ShotAnchor[], id: string, method: TerminalMethod): ShotAnchor[] {
  return anchors.map(a => a.id === id ? { ...a, terminal: true, terminalMethod: method } : a.terminal && a.holeKey === anchors.find(x => x.id === id)?.holeKey ? { ...a, terminal: false, terminalMethod: null } : a);
}
export function posteriorGreenProbability(anchor: Pick<ShotAnchor, 'liePosterior'>): number {
  return greenComplexProbability({ classes: anchor.liePosterior } as LiePosterior);
}
export interface NextTeeObservation { position: PointM; nowMs: number }
export interface NextTeeState { insideSinceMs: number | null }
/** Returns the updated dwell state and whether the fallback fired. The
 * fallback only ever marks the existing green-side anchor terminal
 * (NEXT_TEE_INFERRED); it creates no anchor and moves none, so the record
 * carries no invented cup and the hole reports MISSING_CUP for review. */
export function observeNextTee(state: NextTeeState, previousAnchor: ShotAnchor | null, nextTees: readonly LocalFeature[], previousGreenCentre: PointM | null, observation: NextTeeObservation): { state: NextTeeState; inferred: boolean } {
  const inside = nextTees.some(t => inFeature(observation.position, t));
  const farEnough = previousGreenCentre ? Math.hypot(observation.position[0] - previousGreenCentre[0], observation.position[1] - previousGreenCentre[1]) >= NEXT_TEE_RULE.minDistanceFromGreenM : false;
  const eligible = !!previousAnchor && !previousAnchor.terminal && posteriorGreenProbability(previousAnchor) >= NEXT_TEE_RULE.greenProbability && inside && farEnough;
  if (!eligible) return { state: { insideSinceMs: null }, inferred: false };
  const since = state.insideSinceMs ?? observation.nowMs;
  return { state: { insideSinceMs: since }, inferred: observation.nowMs - since >= NEXT_TEE_RULE.dwellMs };
}
export type HoleStatus = 'OPEN' | 'COMPLETE';
export interface HoleStatusSummary {
  status: HoleStatus;
  terminalMethod: TerminalMethod | null;
  /** Segments between consecutive live marks — the live UI says shots, never strokes. */
  strokes: number;
  /** True only for an explicit CUP_MARK; an inferred close never claims the cup. */
  cupMarked: boolean;
  terminalAnchorId: string | null;
}
export function holeStatus(anchors: readonly ShotAnchor[]): HoleStatusSummary {
  const live = anchors.filter(a => !a.deletedAt);
  const terminal = live.find(a => a.terminal);
  return { status: terminal ? 'COMPLETE' : 'OPEN', terminalMethod: terminal?.terminalMethod ?? null, strokes: Math.max(0, live.length - 1),
    cupMarked: terminal?.terminalMethod === 'CUP_MARK', terminalAnchorId: terminal?.id ?? null };
}
/** Master design "Hole completion" (§19) visual default: a clean completion
 * card lingers this long, then fades. A flagged hole stays until reviewed. */
export const HOLE_COMPLETION_FADE_MS = 2000;
