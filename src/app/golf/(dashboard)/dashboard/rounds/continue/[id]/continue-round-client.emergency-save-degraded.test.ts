/**
 * C5: see the sibling `new-round-client.emergency-save-degraded.test.ts` for
 * the full mechanism. Continue Round needs the same listener.
 *
 * Source-inspection, matching the sibling wiring-contract tests for this
 * file.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./continue-round-client.tsx', import.meta.url),
  'utf8',
);

describe('Continue Round — surfaces the emergency-save degraded notice (C5)', () => {
  it('imports the degraded-event name from emergency-save.ts', () => {
    expect(source).toMatch(/import\s*\{[^}]*EMERGENCY_SAVE_DEGRADED_EVENT[^}]*\}\s*from\s*'@\/lib\/utils\/emergency-save'/);
  });

  it('listens for the event and shows a toast', () => {
    const listenIndex = source.indexOf("addEventListener(EMERGENCY_SAVE_DEGRADED_EVENT");
    expect(listenIndex, 'addEventListener(EMERGENCY_SAVE_DEGRADED_EVENT not found').toBeGreaterThanOrEqual(0);
    const nearby = source.slice(listenIndex - 400, listenIndex + 400);
    expect(nearby).toContain('showToast(');
    expect(nearby).toContain('removeEventListener(EMERGENCY_SAVE_DEGRADED_EVENT');
  });
});
