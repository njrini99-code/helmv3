/**
 * C5: `emergencySave` fires `EMERGENCY_SAVE_DEGRADED_EVENT` (at most once per
 * session) when a device's localStorage backup has failed even after
 * compacting old saves. Nothing listened for it — the player got no signal
 * that their fast local safety net was down, only the slower IndexedDB
 * mirror. New Round listens and surfaces a one-time toast.
 *
 * Source-inspection, matching the sibling wiring-contract tests for this
 * file.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./new-round-client.tsx', import.meta.url),
  'utf8',
);

describe('New Round — surfaces the emergency-save degraded notice (C5)', () => {
  it('imports the degraded-event name from emergency-save.ts', () => {
    expect(source).toMatch(/import\s*\{[^}]*EMERGENCY_SAVE_DEGRADED_EVENT[^}]*\}\s*from\s*'@\/lib\/utils\/emergency-save'/);
  });

  it('listens for the event and shows a toast', () => {
    const listenIndex = source.indexOf("addEventListener(EMERGENCY_SAVE_DEGRADED_EVENT");
    expect(listenIndex, 'addEventListener(EMERGENCY_SAVE_DEGRADED_EVENT not found').toBeGreaterThanOrEqual(0);
    const nearby = source.slice(listenIndex - 400, listenIndex + 400);
    expect(nearby).toContain('showToast(');
    // Cleaned up on unmount — this fires from a `useEffect`.
    expect(nearby).toContain('removeEventListener(EMERGENCY_SAVE_DEGRADED_EVENT');
  });
});
