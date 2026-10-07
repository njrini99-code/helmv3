/**
 * RE-F3: the shot entry's distance box opens a numeric pad, and the iOS shell
 * hides the accessory bar, so the pad had no way to close. The entry mounts
 * the shared KeyboardDoneBar (behaviour pinned in its own test).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('FairwayShotEntry keyboard Done key', () => {
  it('mounts KeyboardDoneBar beside the numeric distance input', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/fairway/pages/rounds-tracking/FairwayShotEntry.tsx'),
      'utf8',
    );
    expect(src).toContain("from '@/components/fairway/primitives/KeyboardDoneBar'");
    expect(src).toMatch(/<KeyboardDoneBar\s*\/>/);
    expect(src).toContain('inputMode="numeric"');
  });
});
