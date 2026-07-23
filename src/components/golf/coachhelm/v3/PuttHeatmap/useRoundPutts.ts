'use client';

/**
 * useRoundPutts — client fetch + adapt for one round's putting rows.
 *
 * Deliberately an INDEPENDENT query from `FilmstripReview`'s existing
 * `golf_shots` fetch (which feeds `ShotInput[]` to `HoleShotPath` via
 * `ReviewHero`): that select lives in a file owned by another wave agent and
 * carries a different, growing column list (tooltip enrichment). Selecting a
 * disjoint, putting-only column set here avoids two agents editing the same
 * select string. See PuttHeatmap/index.tsx + ReviewBreakdown.tsx for the
 * rest of the wiring.
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { buildPuttRecordsFromShotRows, type PuttShotRow } from './adapter';
import type { PuttRecord } from './types';

export interface UseRoundPuttsResult {
  /** `null` while the fetch is in flight; an array (possibly empty) once
   *  resolved — including on error, so callers never have to juggle a third
   *  state to keep rendering. */
  putts: PuttRecord[] | null;
  error: string | null;
}

export function useRoundPutts(roundId: string | null | undefined): UseRoundPuttsResult {
  const [putts, setPutts] = useState<PuttRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roundId) {
      setPutts([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setPutts(null);
    setError(null);
    const supabase = createClient();
    (async () => {
      const { data, error: qErr } = await supabase
        .from('golf_shots')
        .select('putt_made, distance_to_hole_before, distance_unit_before, miss_direction, hole_number, round_id')
        .eq('round_id', roundId)
        .eq('shot_type', 'putting')
        .order('hole_number', { ascending: true })
        .order('shot_number', { ascending: true });
      if (cancelled) return;
      if (qErr) {
        setError(qErr.message);
        setPutts([]);
        return;
      }
      setPutts(buildPuttRecordsFromShotRows((data ?? []) as PuttShotRow[]));
    })();
    return () => {
      cancelled = true;
    };
  }, [roundId]);

  return { putts, error };
}
