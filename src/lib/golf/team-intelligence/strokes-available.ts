/**
 * Team-level "strokes per round available" for one engine category.
 *
 * The Home theme card used to show the top-ranked insight's counterfactual,
 * which is ONE player's figure (audit rows 1 and 7: a single 2.50-stroke
 * putting row headlined a whole team). This is the roster mean instead: for
 * each counted player, their LARGEST live counterfactual in the category
 * (rows for one player overlap, so they are not summed), summed over players
 * and divided by the number of counted players. It reads as "the average
 * current player could save about X strokes a round here".
 *
 * Pure. The caller reads visible engine rows for the roster and passes the
 * players with a recent countable round (`recent-players.ts`).
 */
import type { IntelStrokesAvailable } from './types';

export interface EngineLeakRow {
  player_id: string | null;
  category: string | null;
  evidence: unknown;
}

/** `evidence.counterfactual.strokes_saved_per_round` when live (not
 *  suppressed, finite, > 0), else null. */
export function liveCounterfactual(evidence: unknown): number | null {
  if (!evidence || typeof evidence !== 'object') return null;
  const cf = (evidence as Record<string, unknown>).counterfactual;
  if (!cf || typeof cf !== 'object') return null;
  const rec = cf as Record<string, unknown>;
  if (rec.suppressed === true) return null;
  const saved = rec.strokes_saved_per_round;
  return typeof saved === 'number' && Number.isFinite(saved) && saved > 0 ? saved : null;
}

export function teamStrokesAvailable(
  rows: readonly EngineLeakRow[],
  engineCategory: string,
  countedPlayerIds: ReadonlySet<string>,
): IntelStrokesAvailable | null {
  if (countedPlayerIds.size === 0) return null;
  const best = new Map<string, number>();
  for (const r of rows) {
    if (r.category !== engineCategory || !r.player_id || !countedPlayerIds.has(r.player_id)) continue;
    const saved = liveCounterfactual(r.evidence);
    if (saved == null) continue;
    best.set(r.player_id, Math.max(best.get(r.player_id) ?? 0, saved));
  }
  if (best.size === 0) return null;
  const sum = [...best.values()].reduce((a, b) => a + b, 0);
  return {
    perRound: Math.round((sum / countedPlayerIds.size) * 100) / 100,
    playersWithLeak: best.size,
    playersCounted: countedPlayerIds.size,
  };
}
