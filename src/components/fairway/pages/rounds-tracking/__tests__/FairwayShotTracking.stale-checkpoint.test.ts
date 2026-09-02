/**
 * B8: a completed-hole checkpoint belongs to ONE hole, but the local
 * "saving"/"failed" UI status was updated purely from the resolved promise,
 * with no check that the player is still ON that hole.
 *
 * `handleNextShot`'s `completeHole(...)` call is awaited; if the player
 * navigates to a different hole (the hole-nav pills allow this mid-save)
 * before it resolves, the per-hole reset effect (`useEffect` keyed on
 * `currentHoleIndex`) has ALREADY set `'idle'` for whichever hole is now on
 * screen. The stale checkpoint's eventual resolution — success OR failure —
 * must not override that with a result belonging to a hole no longer
 * showing; a stale failure in particular would paint a "this hole didn't
 * save, retry?" banner on a hole the player never even tried to save.
 *
 * Fix: capture the hole index the checkpoint started on, and only apply its
 * resolved status if `currentHoleIndexRef.current` (the LIVE value, read at
 * resolution time) still matches it.
 *
 * Source-inspection: `FairwayShotTracking.tsx` has many sub-hooks (penalty,
 * edit, undo, autosave) that would need extensive mocking to exercise this
 * exact async race through a real render; the guard's presence and its
 * placement around both the success and failure status updates is what
 * this pins.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../FairwayShotTracking.tsx', import.meta.url), 'utf8');

function slice(fromMarker: string, toMarker: string): string {
  const from = source.indexOf(fromMarker);
  const to = source.indexOf(toMarker, from + 1);
  expect(from, `marker not found: ${fromMarker}`).toBeGreaterThanOrEqual(0);
  expect(to, `marker not found after ${fromMarker}: ${toMarker}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('FairwayShotTracking — a stale checkpoint cannot set status for the wrong hole (B8)', () => {
  it('tracks the live currentHoleIndex in a ref so a resolved-later checkpoint can compare against it', () => {
    expect(source).toContain('const currentHoleIndexRef = useRef(currentHoleIndex)');
    expect(source).toContain('currentHoleIndexRef.current = currentHoleIndex');
  });

  it('handleNextShot only applies the checkpoint result if still on the hole it started on', () => {
    const handler = slice('const handleNextShot = async () => {', 'const handleRetryHoleCheckpoint');

    expect(handler).toContain('completeHole(updatedHistory)');
    const checkpointCallIdx = handler.indexOf('completeHole(updatedHistory)');
    const guardIdx = handler.indexOf('currentHoleIndexRef.current', checkpointCallIdx);
    expect(guardIdx, 'expected a currentHoleIndexRef comparison guarding the status update').toBeGreaterThan(checkpointCallIdx);

    // Both the success path AND the catch-block failure path must respect
    // the guard — a stale failure is just as wrong as a stale success.
    const statusCalls = [...handler.matchAll(/setHoleCheckpointStatus\(/g)];
    expect(statusCalls.length).toBeGreaterThanOrEqual(3); // 'saving', guarded success/failure, catch-block failure
  });
});
