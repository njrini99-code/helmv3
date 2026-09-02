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
    expect(src).toMatch(/width="100%"\s+height="auto"\s+viewBox=\{`0 0 \$\{width\} \$\{height\}`\}\s+preserveAspectRatio="xMidYMid meet"/);
  });

  it('UI-2/3: the agenda does not scroll the page when today already heads the visible list', () => {
    const src = read('src/components/fairway/pages/calendar/FairwayAgendaView.tsx');
    expect(src).toContain("if (visibleBuckets[0]?.key === anchorBucket.key) return;");
  });

  it('UI-4: the inbox masthead hides on a phone while a thread is open', () => {
    const src = read('src/components/fairway/pages/messages/FairwayMessages.tsx');
    expect(src).toContain("<div className={mobileShowChat ? 'hidden md:block' : undefined}>");
    expect(src).toContain("${mobileShowChat ? 'mt-0 md:mt-6' : 'mt-6'}");
  });

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

  it('copy: no desktop-only "Hover" verb in the round-review hint', () => {
    const src = read('src/components/golf/coachhelm/round-review/ReviewHero.tsx');
    expect(src).not.toContain('Hover or tap a hole');
    expect(src).toContain('Tap or hover over a hole to see what happened.');
  });
});
