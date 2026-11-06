import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const inspector = readFileSync('src/clubhouse/screens/calendar/inspector.tsx', 'utf8');
const data = readFileSync('src/clubhouse/data/calendar.ts', 'utf8');
const views = readFileSync('src/clubhouse/screens/calendar/views.tsx', 'utf8');

describe('the Plan row on a practice (N-00 4.17)', () => {
  it('reads plans only with Practice on, and a missing table leaves the row out', () => {
    expect(data).toContain('isPracticeTabEnabled() ? await readEventPlans(');
    expect(data).toContain('.catch(() => null)');
  });
  it('offers a coach the builder on the practice itself', () => {
    expect(inspector).toContain('/golf/dashboard/practice?new=1&event=${e.id}');
  });
  it('shows a player no row until a plan is published', () => {
    expect(inspector).toContain("(coach || e.plan.state !== 'none')");
    expect(data).toContain("from('golf_practice_plan_versions')");
  });
  it('marks a practice with a live plan on the calendar', () => {
    expect(views).toContain("e.plan?.state === 'published' || e.plan?.state === 'edited'");
  });
});
