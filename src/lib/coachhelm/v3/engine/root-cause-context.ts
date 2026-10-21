/**
 * DB side of the root-cause diagnosis (`root-cause.ts` is the pure core),
 * ported from PR #2073 (CoachHelm supercharge Slice 2).
 *
 * Loads a player's A1 context (`loadPlayerContext` — completed rounds only,
 * chunked + paginated, errors thrown) for the window the insight's own
 * evidence describes (`scopeForEvidence`), so the diagnosis never reads a
 * different window than the metric it explains. A row that stamps no window
 * gets `null` (the caller says "not traced: no stamped window"); PR #2073's
 * rolling-12-month fallback is gone.
 *
 * Memoized per (player, window) for a few minutes: one orchestrator pass
 * runs ~20 generators for the same player, and every leak row whose metric
 * maps to a sequence family would otherwise re-read the same shots. Only
 * the in-flight/settled PROMISE is cached, and a rejected load is evicted
 * so the next generator retries instead of inheriting a transient error.
 */
import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { loadPlayerContext } from '../context/load-player-context';
import { scopeForEvidence, type RootCauseContext } from './root-cause';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

const MEMO_TTL_MS = 5 * 60_000;
const memo = new Map<string, { at: number; value: Promise<RootCauseContext> }>();

/**
 * Load (memoized) the shot context for one insight; null when the row stamps
 * no window. Throws on a read error — the caller (`generator-base.ts`) turns
 * that into the honest "shot records could not be read" cause, never a
 * failed run.
 */
export async function loadRootCauseContext(
  playerId: string,
  evidence: Pick<InsightEvidence, 'window_start' | 'window_end' | 'window_days'>,
): Promise<RootCauseContext | null> {
  const scoped = scopeForEvidence(playerId, evidence);
  if (!scoped) return null;
  const { scope, label } = scoped;
  const key = `${playerId}|${scope.window_start}|${scope.window_end}`;
  const now = Date.now();
  const hit = memo.get(key);
  if (hit && now - hit.at < MEMO_TTL_MS) return hit.value;
  // Bound the cache in a long-lived process: drop expired entries first.
  for (const [k, v] of memo) if (now - v.at >= MEMO_TTL_MS) memo.delete(k);

  const value = (async (): Promise<RootCauseContext> => {
    const { shots, holes } = await loadPlayerContext(scope, { supabase: createAdminClient() });
    // `loadPlayerContext` already bounded rounds by round_date. The pure
    // core re-scopes facts by their own observed_at (shot created_at), which
    // can post-date `window_end` when a round is logged late — compute with
    // an open window (rounds are already bounded) so a late-entered
    // in-window round is not dropped.
    return {
      facts: shots,
      holes,
      scope: { ...scope, window_start: null, window_end: null },
      windowLabel: label,
    };
  })();
  memo.set(key, { at: now, value });
  value.catch(() => memo.delete(key));
  return value;
}

/** Test seam. */
export function clearRootCauseContextMemo(): void {
  memo.clear();
}
