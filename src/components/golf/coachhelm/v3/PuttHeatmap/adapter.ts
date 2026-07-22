/**
 * PuttHeatmap — real-data adapter.
 *
 * Pure `golf_shots` row -> `PuttRecord` mapping. No Supabase, no React — the
 * fetch itself lives in `./useRoundPutts`, which selects `shot_type =
 * 'putting'` rows for one round and hands them here.
 *
 * Field mapping mirrors the existing `PuttBiasGenerator` shot-level read
 * (`src/lib/coachhelm/v3/generators/putt-bias.ts`) so the two surfaces agree
 * on what counts as a usable putt row:
 *   - `putt_made` null/undefined  -> outcome unknown, row dropped (a putt we
 *     can't say made-or-missed can't be plotted honestly).
 *   - `distance_to_hole_before` null/undefined/non-finite -> no distance to
 *     plot from, row dropped.
 *   - `distance_unit_before === 'yards'` -> convert to feet (x3); every other
 *     value (including null, which the app treats as the feet default for
 *     putts) is read as feet already.
 */

import type { PuttRecord } from './types';

/** The subset of `golf_shots` columns the heatmap needs. Matches the select
 *  list in `useRoundPutts` — kept as its own row shape (not the generated
 *  `Database['public']['Tables']['golf_shots']['Row']`) so this file has no
 *  Supabase/Database import and stays trivially unit-testable. */
export interface PuttShotRow {
  putt_made: boolean | null;
  distance_to_hole_before: number | null;
  distance_unit_before?: string | null;
  miss_direction?: string | null;
  hole_number?: number | null;
  round_id?: string | null;
}

/** `golf_shots` putting rows -> `PuttRecord[]`, honest-dropping rows with no
 *  usable outcome or distance rather than guessing. Order is preserved from
 *  the input (the caller sorts by hole/shot number; `geometry.ts`'s jitter is
 *  seeded off array index, so a stable input order keeps the plotted dots
 *  reproducible for a given round). */
export function buildPuttRecordsFromShotRows(rows: readonly PuttShotRow[]): PuttRecord[] {
  const out: PuttRecord[] = [];
  for (const r of rows) {
    if (r.putt_made === null || r.putt_made === undefined) continue;
    const rawDistance = r.distance_to_hole_before;
    if (rawDistance === null || rawDistance === undefined || !Number.isFinite(rawDistance)) continue;
    const distance_feet = r.distance_unit_before === 'yards' ? rawDistance * 3 : rawDistance;
    out.push({
      distance_feet,
      made: r.putt_made === true,
      miss_direction: r.miss_direction ?? null,
      hole_number: r.hole_number ?? null,
      round_id: r.round_id ?? null,
    });
  }
  return out;
}
