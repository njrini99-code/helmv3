import { describe, expect, it } from 'vitest';
import { hits, ROOT, walk } from './_scan';

/**
 * CONS-25: the haptic grammar holds. `commit` is the heavy one, kept for a sheet settling, a shot logged and
 * pull-to-refresh; a retry is a press and finishing a step is a success (lib/haptics.ts).
 */
const ALLOWED = new Set(['shell/Bell.tsx', 'shell/PullToRefresh.tsx', 'lib/sheet-drag.ts', 'screens/rounds/track/ShotEntry.tsx']);

describe('haptic grammar (CONS-25)', () => {
  it("haptic('commit') only for a settle, a shot logged and pull-to-refresh", () => {
    const files = walk(ROOT, /\.tsx?$/).filter((f) => !f.includes('__tests__'));
    expect(hits(/haptic\(['"]commit['"]\)|feel=["']commit["']/, files).filter((h) => !ALLOWED.has(h.file))).toEqual([]);
  });
});
