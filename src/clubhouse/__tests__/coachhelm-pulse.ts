import type { ChCoachHelmData, ChPulse } from '../data/coachhelm-shape';

/**
 * The coach loader hands the program pulse over still on its way (a read that never rejects, drawn in the board's own Suspense), so a
 * test that wants the pulse the board ends up drawing waits for it here. A pulse that failed is the pulse not loading, as the board
 * draws it. A value (a preview's) is returned as it is.
 */
export async function pulseLanded(d: Pick<ChCoachHelmData, 'pulse'>): Promise<ChPulse> {
  const p = await d.pulse;
  if (!('status' in p)) return p;
  return p.status === 'ok' ? p.pulse : { rows: [], error: true };
}

/** A pulse read that has already landed, as the thenable React reads without suspending (a client component `use()`s the promise it is given). */
export function landedRead<T>(value: T): Promise<T> {
  return Object.assign(Promise.resolve(value), { status: 'fulfilled', value }) as Promise<T>;
}
