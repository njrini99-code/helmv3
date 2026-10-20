/**
 * Rank mined patterns by the SIZE of their stroke impact.
 *
 * `golf_patterns_v2.stroke_impact` is signed: a leak is negative, a strength
 * positive. `ORDER BY stroke_impact DESC LIMIT 10` therefore returned the ten
 * largest POSITIVE rows and dropped the biggest leaks (48 of 68 production
 * players were affected). PostgREST cannot order by abs(), so callers read the
 * player's (bounded) active rows and rank them here.
 *
 * Pure: no Supabase, no React. Kept out of the `'use server'` action file, which
 * may only export async functions.
 */

export interface ImpactRankable {
  id?: string | null;
  stroke_impact?: number | null;
}

function usableImpact(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The top `limit` rows by |stroke_impact|, largest first. Deterministic: ties on
 * size put the positive impact first, then order by id. A row with no usable
 * impact (null / NaN) ranks last, never first. Does not mutate its input.
 */
export function rankByAbsoluteStrokeImpact<T extends ImpactRankable>(
  rows: readonly T[],
  limit: number,
): T[] {
  return [...rows]
    .sort((a, b) => {
      const av = usableImpact(a.stroke_impact);
      const bv = usableImpact(b.stroke_impact);
      if (av === null || bv === null) {
        if (av !== null) return -1;
        if (bv !== null) return 1;
      } else {
        const bySize = Math.abs(bv) - Math.abs(av);
        if (bySize !== 0) return bySize;
        if (bv !== av) return bv - av;
      }
      const ai = String(a.id ?? '');
      const bi = String(b.id ?? '');
      return ai < bi ? -1 : ai > bi ? 1 : 0;
    })
    .slice(0, Math.max(0, limit));
}
