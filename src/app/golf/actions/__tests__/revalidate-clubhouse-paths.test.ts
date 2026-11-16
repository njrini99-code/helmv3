import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * GAP-R-14: a write revalidates the Clubhouse screens that show it. Revalidating a retired Fairway address (a config
 * redirect or an alias layout) refreshes nothing, so a coach could see stale numbers until the next navigation.
 * These four files are the ones the gap pass named; other action files still carry retired targets (see the report).
 */
const RETIRED = [
  '/golf/dashboard/development',
  '/golf/dashboard/my-development',
  '/golf/dashboard/insights',
  '/golf/dashboard/alerts',
  '/golf/dashboard/intelligence',
  '/golf/dashboard/analytics/coachhelm',
  '/golf/dashboard/tasks',
  '/golf/dashboard/tasks/templates',
  '/golf/dashboard/notifications',
  '/golf/dashboard/stats/team',
];
const dir = join(process.cwd(), 'src/app/golf/actions');
const targets = (file: string) => [...readFileSync(join(dir, file), 'utf8').matchAll(/revalidatePath\('([^']+)'\)/g)].map((m) => m[1]!);

describe('revalidatePath targets are Clubhouse screens', () => {
  it.each(['development.ts', 'intelligence-dashboard.ts', 'tasks.ts', 'calendar-events.ts', 'team-sg-baseline.ts'])('%s revalidates no retired address', (file) => {
    const t = targets(file);
    expect(t.length).toBeGreaterThan(0);
    expect(t.filter((p) => RETIRED.includes(p))).toEqual([]);
  });

  it('focus-area writes refresh Stats (the Development tab) and CoachHelm; task writes refresh Team Hub', () => {
    expect(targets('development.ts')).toEqual(expect.arrayContaining(['/golf/dashboard/stats', '/golf/dashboard/coachhelm']));
    expect(targets('tasks.ts')).toContain('/golf/dashboard/team-hub');
  });
});
