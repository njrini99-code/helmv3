/**
 * Mobile viewport audit, 2026-09-02 (docs/ui-audits/MASTER_BUG_REPORT_2026-09-02.md,
 * Part 2). One contract per fix so a refactor cannot quietly undo it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('mobile audit 2026-09-02', () => {
  // UI-4: viewport geometry is exercised in e2e/golf-critical-paths.spec.ts.

  it('UI-6: toasts clear the bottom nav on phones via sonner\'s mobileOffset', () => {
    const src = read('src/components/fairway/feedback/ToastStack.tsx');
    expect(src).toContain("mobileOffset={{ bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}");
  });

  it('UI-7: a two-line metric label can break a single long word', () => {
    const src = read('src/components/fairway/cards-insight/MetricCard.tsx');
    expect(src).toContain("'line-clamp-2 min-h-8 break-words [overflow-wrap:anywhere]'");
  });

});
