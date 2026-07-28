import { describe, it, expect } from 'vitest';
import {
  GOAL_WINDOW_MAX_DAYS,
  GOAL_WINDOW_MIN_DAYS,
  resolveGoalWindow,
} from '@/lib/coachhelm/v3/goals/types';

/**
 * `golf_goals.window_days` is
 *   GENERATED ALWAYS AS (EXTRACT(day FROM (ends_at - started_at))::int) STORED
 * with CHECK (window_days BETWEEN 7 AND 365).
 *
 * Two production failure modes came out of that pair (see the prod repro in
 * the commit message): writing the generated column at all, and letting
 * EXTRACT truncate a nearly-7-day span down to 6. These tests pin the span
 * arithmetic that keeps both from recurring.
 */
describe('resolveGoalWindow', () => {
  const now = new Date('2026-03-01T12:00:00.000Z');

  const spanDays = (startedAt: string, endsAt: string) =>
    (new Date(endsAt).getTime() - new Date(startedAt).getTime()) / 86_400_000;

  it.each([7, 14, 30, 60, 90])(
    'produces an exact %i-day span for the windows the UI offers',
    (days) => {
      const requested = new Date(now.getTime() + days * 86_400_000).toISOString();
      const res = resolveGoalWindow(requested, now);

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.window.window_days).toBe(days);
      // Postgres EXTRACT(day FROM interval) truncates, so the span must be a
      // whole number of days — not merely close to one.
      expect(spanDays(res.window.started_at, res.window.ends_at)).toBe(days);
    },
  );

  it('absorbs latency instead of truncating a 7-day goal down to 6', () => {
    // The client computed ends_at from ITS clock; by the time the action runs,
    // the span is a few hundred ms short of 7 days. Left alone, Postgres would
    // generate window_days = 6 and the CHECK would reject the insert.
    const requested = new Date(now.getTime() + 7 * 86_400_000 - 300).toISOString();
    const res = resolveGoalWindow(requested, now);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.window.window_days).toBe(GOAL_WINDOW_MIN_DAYS);
    expect(spanDays(res.window.started_at, res.window.ends_at)).toBe(7);
  });

  it('pins started_at to the resolved instant so the span cannot drift', () => {
    const requested = new Date(now.getTime() + 30 * 86_400_000).toISOString();
    const res = resolveGoalWindow(requested, now);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // started_at must be written explicitly — relying on the column's now()
    // default reintroduces the truncation window this function exists to close.
    expect(res.window.started_at).toBe(now.toISOString());
  });

  it('rejects a window below the CHECK floor with a readable message', () => {
    const requested = new Date(now.getTime() + 3 * 86_400_000).toISOString();
    const res = resolveGoalWindow(requested, now);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain(String(GOAL_WINDOW_MIN_DAYS));
    expect(res.error).toContain(String(GOAL_WINDOW_MAX_DAYS));
  });

  it('rejects a window above the CHECK ceiling', () => {
    const requested = new Date(now.getTime() + 400 * 86_400_000).toISOString();
    expect(resolveGoalWindow(requested, now).ok).toBe(false);
  });

  it('rejects an unparseable end date rather than emitting NaN', () => {
    const res = resolveGoalWindow('not-a-date', now);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/valid date/i);
  });

  it('accepts the exact CHECK boundaries', () => {
    for (const days of [GOAL_WINDOW_MIN_DAYS, GOAL_WINDOW_MAX_DAYS]) {
      const requested = new Date(now.getTime() + days * 86_400_000).toISOString();
      const res = resolveGoalWindow(requested, now);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      expect(res.window.window_days).toBe(days);
    }
  });
});
