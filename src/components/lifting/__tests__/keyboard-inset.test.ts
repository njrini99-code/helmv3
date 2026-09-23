/**
 * The soft keyboard on iOS. The Capacitor WebView is configured
 * `resize: 'ionic'` and there is no <ion-app>, so it never resizes for the
 * keyboard; Mobile Safari does not resize its layout viewport either. A sheet
 * pinned to `bottom-0` therefore sits under the keys the moment a field
 * inside it is tapped — same contract as
 * src/components/fairway/overlays/keyboard-inset.test.ts and
 * src/components/fairway/app-shell/__tests__/keyboard-inset.test.ts, applied
 * here to the two lifting-lab sheets with text inputs: the soreness note
 * sheet and the weight-entry modal.
 *
 * Contract: each bottom-anchored sheet lifts by the `--keyboard-height`
 * CapacitorProvider publishes, and marks itself `data-fw-keyboard-aware` so
 * the provider's global scroll-into-view leaves the page behind it alone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('SorenessRegionBottomSheet', () => {
  const src = read('src/components/lifting/soreness/SorenessRegionBottomSheet.tsx');

  it('lifts the sheet by the keyboard height instead of pinning to bottom-0', () => {
    expect(src).toContain("bottom-[var(--keyboard-height,0px)]");
    expect(src).not.toMatch(/fixed bottom-0 left-0 right-0/);
  });

  it('tells the provider it handles its own keyboard clearance', () => {
    expect(src).toMatch(/<motion\.div[\s\S]*?data-fw-keyboard-aware/);
  });
});

describe('WeightEntryModal', () => {
  const src = read('src/components/lifting/weight/WeightEntryModal.tsx');

  it('lifts the sheet by the keyboard height instead of pinning to bottom-0', () => {
    expect(src).toContain("bottom-[var(--keyboard-height,0px)]");
    expect(src).not.toMatch(/'fixed inset-x-0 bottom-0 z-50/);
  });

  it('tells the provider it handles its own keyboard clearance', () => {
    expect(src).toMatch(/<motion\.div[\s\S]*?data-fw-keyboard-aware/);
  });
});
