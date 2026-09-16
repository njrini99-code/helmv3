/** Meridian §69: runtime residency. At most `max` decoded terrain meshes stay
 * resident — the current hole, the next hole, then the most recently viewed
 * holes; everything else is evicted least-recently-used. Filmstrip previews
 * never force eighteen meshes resident. */
export const TERRAIN_RESIDENCY_MAX = 3;

export function rememberViewedHole(recent: readonly string[], key: string, max = TERRAIN_RESIDENCY_MAX): string[] {
  return [key, ...recent.filter(item => item !== key)].slice(0, Math.max(1, max));
}

export function residentTerrainKeys(input: { current: string; next?: string | null; recent?: readonly string[]; max?: number }): string[] {
  const max = Math.max(1, input.max ?? TERRAIN_RESIDENCY_MAX);
  const keys: string[] = [input.current];
  if (input.next && input.next !== input.current) keys.push(input.next);
  for (const key of input.recent ?? []) {
    if (keys.length >= max) break;
    if (!keys.includes(key)) keys.push(key);
  }
  return keys.slice(0, max);
}

/** Drops every loaded mesh that is no longer resident. Returns the same
 * object when nothing changes so React state stays referentially stable. */
export function evictTerrain<T>(loaded: Readonly<Record<string, T>>, resident: readonly string[]): Readonly<Record<string, T>> {
  const keep = new Set(resident);
  const entries = Object.entries(loaded).filter(([key]) => keep.has(key));
  return entries.length === Object.keys(loaded).length ? loaded : Object.fromEntries(entries);
}
