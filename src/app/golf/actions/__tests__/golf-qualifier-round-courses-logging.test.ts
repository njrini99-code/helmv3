/**
 * Re-verification of the audited swallow in getQualifierRoundCoursesImpl
 * (golf.ts) — Helm Bridge observability refit.
 *
 * The function's return type is `QualifierRoundCourse[]`, an array — so even
 * though it is `withAdminObserved`-wrapped, that wrapper's soft-failure
 * detection (`extractActionSoftFailure`) short-circuits to null for any
 * array result, and the function's own internal try/catch never lets an
 * exception reach the wrapper either. A real read failure or thrown
 * exception was therefore silently indistinguishable from "no courses
 * assigned yet". These tests prove the observability fix without changing
 * the fallback: both cases still return `[]`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';
import { failSelect } from '@/test/fixtures/fake-supabase-fail-select';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

import { getQualifierRoundCourses } from '../golf';
import { logServerError } from '@/lib/server-error-logger';

const QUALIFIER_ID = 'qualifier-1';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getQualifierRoundCourses — silent swallow now observed', () => {
  it('logs a warning (and still returns []) when the read fails', async () => {
    fake = createFakeSupabase({
      user: { id: 'u-1' },
      tables: { golf_qualifier_round_courses: [] },
    });
    failSelect(fake, 'golf_qualifier_round_courses', 'connection reset');

    const result = await getQualifierRoundCourses(QUALIFIER_ID);

    expect(result).toEqual([]);
    expect(logServerError).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [message, context, severity] = (logServerError as any).mock.calls[0];
    expect(message).toContain('connection reset');
    expect(context).toMatchObject({
      action: 'getQualifierRoundCourses',
      featureArea: 'qualifiers',
    });
    expect(severity).toBe('warning');
  });

  it('logs nothing for a genuinely empty result — an empty table is not an error', async () => {
    fake = createFakeSupabase({
      user: { id: 'u-1' },
      tables: { golf_qualifier_round_courses: [] },
    });

    const result = await getQualifierRoundCourses(QUALIFIER_ID);

    expect(result).toEqual([]);
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('still returns the real rows on a healthy read', async () => {
    fake = createFakeSupabase({
      user: { id: 'u-1' },
      tables: {
        golf_qualifier_round_courses: [
          { qualifier_id: QUALIFIER_ID, round_number: 1, course_id: 'course-1', course_name: 'Pebble', tee_id: null },
        ],
      },
    });

    const result = await getQualifierRoundCourses(QUALIFIER_ID);

    expect(result).toEqual([
      { roundNumber: 1, courseId: 'course-1', courseName: 'Pebble', teeId: null },
    ]);
    expect(logServerError).not.toHaveBeenCalled();
  });
});
