/**
 * A course's name is not a club word (admin incident 4fb650c5, 2026-11-15).
 *
 * CourseMgmtGenerator names the player's worst holes with their course
 * ("hole 7 at Oak Hollow Country Club"). The coach-copy gate tested the whole
 * text against CLUB_WORDS, so "Club" or "Woods" in a course name refused the
 * coach copy: production logged "CourseMgmtGenerator: coach copy not stored
 * (content: club word)" for both variants, and 21 of 79 production courses
 * carry "Club" in their name. The coach then read the player's second-person
 * text. The gate must still refuse a club the copy itself names.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const logServerEvent = vi.fn();
vi.mock('@/lib/server-error-logger', () => ({
  logServerEvent: (...args: unknown[]) => logServerEvent(...args),
  logServerError: vi.fn(),
}));

import { CourseMgmtGenerator } from '@/lib/coachhelm/v3/generators/course-mgmt';
import type { ComposedContent } from '@/lib/coachhelm/v3/engine/types';
import { coachCopyIssues } from '../coach-voice';

const P = '00000000-0000-4000-8000-000000000001';

function aggregate(variant: 'penalty' | 'big_number') {
  return {
    sampleN: 22,
    playerValue: variant === 'penalty' ? 0.8 : 9.4,
    metric_value: variant === 'penalty' ? 0.8 : 9.4,
    variant,
    rounds_played: 22,
    anchor_value: variant === 'penalty' ? 0.3 : 6.1,
    anchor_label: 'PGA Tour',
    cause_penalty_pct: 40,
    cause_missed_gir_pct: 35,
    cause_three_putt_pct: 25,
    spanDays: 54,
    first_round_date: '2026-04-01',
    last_round_date: '2026-05-25',
    worst_holes: [
      { course_id: 'c1', course_name: 'Oak Hollow Country Club', hole_number: 7, avg_to_par: 1.4, n: 5 },
      { course_id: 'c2', course_name: 'Pine Woods', hole_number: 12, avg_to_par: 1.1, n: 4 },
    ],
    worst_holes_excluded_rounds: 0,
  };
}

interface CoachCopyGate {
  checkedCoachCopy(composed: ComposedContent): Promise<{ coach_copy?: { title: string; content: string } }>;
}

describe('coach copy that names a course', () => {
  beforeEach(() => logServerEvent.mockClear());

  it.each(['penalty', 'big_number'] as const)('%s: the base stores the coach copy', async (variant) => {
    const gen = new CourseMgmtGenerator(P, variant);
    const composed = gen.composeContent(aggregate(variant) as never);
    expect(composed.coach?.content).toContain('Oak Hollow Country Club');
    expect(composed.coach?.content).toContain('Pine Woods');

    const stored = await (gen as unknown as CoachCopyGate).checkedCoachCopy(composed);

    expect(logServerEvent).not.toHaveBeenCalled();
    expect(stored.coach_copy).toEqual(composed.coach);
  });

  it('still refuses a club the copy itself names', () => {
    const player = { title: 'Penalty strokes', content: 'You hit irons at Pine Woods.' };
    const coach = { title: 'Penalty strokes', content: 'The player hits irons at Pine Woods.' };
    expect(coachCopyIssues(player, coach, ['Pine Woods'])).toEqual(['content: club word']);
  });

  it('still refuses second person outside the name', () => {
    const player = { title: 'Penalty strokes', content: 'Your worst hole is at Pine Woods.' };
    const coach = { title: 'Penalty strokes', content: 'Your worst hole is at Pine Woods.' };
    expect(coachCopyIssues(player, coach, ['Pine Woods'])).toEqual(['content: second person']);
  });
});
