import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * GAP-M-01 (copy half): the home page's product previews use the names a coach sees in Clubhouse, invented but
 * real-looking people, and no calendar date that goes stale. The Clubhouse look of the previews is still open.
 */
const dir = join(process.cwd(), 'src/components/landing/mockups');
const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'));
const all = files.map((f) => [f, readFileSync(join(dir, f), 'utf8')] as const);

describe('landing product previews', () => {
  it('finds the previews', () => {
    expect(files).toEqual(expect.arrayContaining(['DashboardMock.tsx', 'StatsMock.tsx', 'TeamMock.tsx']));
  });

  it.each([
    ['a placeholder person', /Test Player|Demo Coach|Demo University|Good afternoon, Demo/],
    ['a retired Fairway section name', /'(?:Dashboard|CoachHelm AI|Development)'|>Team Management<|>Development plans</],
    ['a weekday with a month and day', /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (?:January|February|March|April|May|June|July|August|September|October|November|December) \d/],
  ])('no preview shows %s', (_, pattern) => {
    expect(all.filter(([, src]) => pattern.test(src)).map(([f]) => f)).toEqual([]);
  });
});
