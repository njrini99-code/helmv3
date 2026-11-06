/** Stress fixtures for the presentation gate: the same fixture with real-world lengths and counts. Nothing reaches a server. */
type Rewrite = (key: string, value: unknown) => unknown;

/** Deep-copies `value`, passing every key through `rewrite`; what it returns replaces the value, and undefined keeps walking. */
export function rewriteDeep<T>(value: T, rewrite: Rewrite): T {
  if (Array.isArray(value)) return value.map((v) => rewriteDeep(v, rewrite)) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => {
        const next = rewrite(k, v);
        return [k, next === undefined ? rewriteDeep(v, rewrite) : next];
      }),
    ) as T;
  }
  return value;
}

export const STRESS_TEAM = 'Demo University Golf';
export const STRESS_EVENT = 'Saturday Spring Preview Tournament';
export const STRESS_DRILL = 'Wedge Distance Control (80-120 yards)';

/** Event and team names at the length a real program types them. */
export const longNames: Rewrite = (key, value) => {
  if (typeof value !== 'string') return undefined;
  if (key === 'title') return STRESS_EVENT;
  if (key === 'team' || key === 'teamName') return STRESS_TEAM;
  return undefined;
};

/** Practice drills at their longest: a named drill with its distance range. */
export const longDrills: Rewrite = (key, value) => (key === 'name' && typeof value === 'string' && /drill|ladder|from|tees/i.test(value) ? STRESS_DRILL : undefined);

/** A cause read over a full season's holes (RC-5 draws one dot for each). */
export const manyHoles: Rewrite = (key, value) => (key === 'arms' && Array.isArray(value) ? value.map((a: { label: string }) => ({ ...a, failures: 171, n: 300 })) : undefined);
