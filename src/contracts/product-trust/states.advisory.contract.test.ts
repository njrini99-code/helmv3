import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = process.cwd();
const read = (path: string) => readFileSync(join(repo, path), 'utf8');

describe('Product trust source-shape advisory contracts', () => {
  it('TRUST-001 and TRUST-004 keep failed stat loads separate from healthy empty states', () => {
    const source = read('src/app/golf/(dashboard)/dashboard/stats/stats-client.tsx');
    const errorState = source.indexOf('statsError ?');
    const emptyState = source.indexOf('Empty state when no stats available');

    expect(source).toContain("setStatsError('Failed to load stats. Please try again.')");
    expect(source).toContain('Something Went Wrong');
    expect(source).toContain('Try Again');
    expect(errorState).toBeGreaterThan(-1);
    expect(emptyState).toBeGreaterThan(-1);
    expect(errorState).toBeLessThan(emptyState);
  });

  it('CH-AI-008 keeps CoachHelm coach-feed load failures distinguishable from empty insight feeds', () => {
    const source = read('src/app/golf/actions/insight-delivery.ts');

    expect(source).toContain('export type CoachInsightsResult');
    expect(source).toContain('| { ok: false; error: string }');
    expect(source).toContain('Could not load signals. Try refreshing.');
    expect(source).toContain('empty array here would render "all clear" over a real query failure');
  });

  it('TRUST-005 keeps CoachHelm route failures in explicit error boundaries', () => {
    const coachhelmError = read('src/app/golf/(dashboard)/dashboard/coachhelm/error.tsx');
    const analyticsError = read('src/app/golf/(dashboard)/dashboard/analytics/coachhelm/error.tsx');

    expect(coachhelmError).toContain('Failed to load CoachHelm');
    expect(coachhelmError).toContain('Please try again');
    expect(analyticsError).toContain('Failed to load');
    expect(analyticsError).toContain('Please try again');
  });
});
