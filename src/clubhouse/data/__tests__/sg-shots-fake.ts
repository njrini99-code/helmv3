import type { ChFakeAnswer } from '../../__tests__/supabase-fake';

/**
 * A `golf_shots` answer for the table fake (supabase-fake.ts), for a loader that also asks which rounds were shot-tracked
 * (`loadMeasuredRounds`, stats-common.ts). That read is the one that selects `distance_to_hole_after`: it gets one usable shot for
 * each round in `measured`, so those rounds read as shot-tracked and any other round with strokes gained as estimated from the
 * scorecard. Every other read of the table (the putt bands, the longest putt) gets `other`, as before.
 */
export function shotsAnswer(measured: readonly string[], other: ChFakeAnswer = { data: [] }) {
  return (filters: Array<[string, unknown[]]>): ChFakeAnswer =>
    filters.some(([op, args]) => op === 'select' && String(args[0]).includes('distance_to_hole_after'))
      ? { data: measured.map((id) => ({ round_id: id, distance_to_hole_after: 100, putt_made: null, result: null })) }
      : other;
}
