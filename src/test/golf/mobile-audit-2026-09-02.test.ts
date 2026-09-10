/**
 * Mobile viewport audit, 2026-09-02 (docs/ui-audits/MASTER_BUG_REPORT_2026-09-02.md,
 * Part 2). One contract per fix so a refactor cannot quietly undo it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('mobile audit 2026-09-02', () => {
  it('UI-1: the round pulse chart scales to its column instead of clipping at 520px', () => {
    const src = read('src/components/fairway/pages/rounds/FairwayRoundDetail.tsx');
    // This assertion used to pin `width="100%" height="auto"
    // preserveAspectRatio="xMidYMid meet"` — markup that LOOKS responsive, and
    // was not: an inline `style={{ width }}` on the wrapping span beat the
    // `w-full max-w-[520px]` classes in the cascade, so the chart rendered at a
    // literal 520px on every viewport and clipped to ~40% of the round in a
    // ~208px phone column. The test passed the whole time. It was checking the
    // SVG's own attributes while the element above it did the pinning.
    //
    // So it now asserts the two things that actually make it responsive: no
    // inline width survives on the span, and the viewBox is stretched to
    // whatever width the column resolves to.
    expect(src).toContain("style={{ height }}");
    expect(src).not.toMatch(/style=\{\{\s*width\s*,\s*height\s*\}\}/);
    expect(src).toContain('preserveAspectRatio="none"');
    // ...and that the trace keeps a constant on-screen thickness despite X and
    // Y no longer sharing a scale factor.
    expect(src).toContain('vectorEffect="non-scaling-stroke"');
  });

  it('UI-2/3: the agenda does not scroll the page when today already heads the visible list', () => {
    const src = read('src/components/fairway/pages/calendar/FairwayAgendaView.tsx');
    expect(src).toContain("if (visibleBuckets[0]?.key === anchorBucket.key) return;");
  });

  // UI-4: viewport geometry is exercised in e2e/golf-critical-paths.spec.ts.

  it('UI-5: the event editor scrolls its own error banner into view', () => {
    const src = read('src/components/fairway/pages/calendar/FairwayEventEditor.tsx');
    expect(src).toMatch(/if \(error\) errorRef\.current\?\.scrollIntoView\(\{ block: 'nearest' \}\);/);
    expect(src).toContain('ref={errorRef} role="alert"');
  });

  it('UI-6: toasts clear the bottom nav on phones via sonner\'s mobileOffset', () => {
    const src = read('src/components/fairway/feedback/ToastStack.tsx');
    expect(src).toContain("mobileOffset={{ bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}");
  });

  it('UI-7: a two-line metric label can break a single long word', () => {
    const src = read('src/components/fairway/cards-insight/MetricCard.tsx');
    expect(src).toContain("'line-clamp-2 min-h-8 break-words [overflow-wrap:anywhere]'");
  });

  it('UI-10: Prev/Next move to a hole under the pill rule, or are disabled with the reason', () => {
    const src = read('src/components/fairway/pages/rounds-tracking/FairwayScorecardHeader.tsx');
    expect(src).toContain('const canGoNext = Boolean(onNavigateToHole) && nextIndex < holes.length && holes[nextIndex]?.score != null;');
    expect(src).toContain('disabled={!canGoNext}');
    expect(src).toContain("'Finish this hole to move on'");
    expect(src).toContain('disabled={!canGoPrev}');
  });

  it('UI-11: the save-failed chip always says so in words', () => {
    const src = read('src/components/fairway/pages/rounds-tracking/FairwayScorecardHeader.tsx');
    expect(src).not.toContain("{!compact && 'Save failed'}");
    expect(src).toMatch(/status === 'error' && \([\s\S]*?Save failed[\s\S]*?\)/);
  });

  it('copy: no desktop-only "Hover" verb in the round-review hole affordance', () => {
    // The v3 field sheet retired the filmstrip and its hint line with it: a
    // hole is now a real press target in the instrument AND a pressable row in
    // the hole table, so the affordance is the control itself rather than a
    // sentence telling a phone to hover. Assert that, not the retired copy.
    const shape = read('src/components/golf/coachhelm/round-review/RoundShape.tsx');
    expect(shape).not.toContain('Hover or tap a hole');
    expect(shape).toContain('<PressTarget');
    const parts = read('src/components/golf/coachhelm/round-review/round-review-parts.tsx');
    expect(parts).toContain('<PressTarget');
  });
});
