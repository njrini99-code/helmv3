import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/coachhelm/v3/insight-visibility', () => ({ applyInsightVisibility: <T>(q: T) => q }));

import type { CoachChatContext } from '../context';
import { getCourse } from '../engine-reads';
import { pgrst } from './pgrst-double';

/**
 * get_course reads up to 200 team rounds' holes in one go: 18 a round is up to 3,600 rows, and PostgREST hands back
 * at most 1,000 a request. The double caps the same way, so a read that does not page loses holes without a word.
 */
const coach: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 'team-1', team_name: 'Rini University', timezone: 'America/New_York', roster: [] };
const COURSE = 'course-1';
const ROUNDS = 60; // 60 × 18 = 1,080 hole rows: past the cap
const pad = (n: number) => String(n).padStart(4, '0');

function course(extra: { holesError?: boolean } = {}) {
  const rounds = Array.from({ length: ROUNDS }, (_, r) => ({ id: `r${pad(r)}`, team_id: 'team-1', course_id: COURSE, status: 'completed', is_test: false }));
  // Every hole is played one over par, so the team's to-par is +1 on all 18 whichever rows come back.
  const holes = rounds.flatMap((r) => Array.from({ length: 18 }, (_, h) => ({ id: `${r.id}-h${pad(h)}`, round_id: r.id, hole_number: h + 1, par: 4, score: 5 })));
  return pgrst({
    golf_course_tees: { rows: [{ id: 'tee-1', course_id: COURSE }] },
    golf_course_tee_holes: { rows: Array.from({ length: 18 }, (_, h) => ({ tee_id: 'tee-1', hole_number: h + 1, par: 4, yardage: 400, handicap_index: h + 1 })) },
    golf_rounds: { rows: rounds },
    golf_holes: extra.holesError ? { error: { message: 'boom' } } : { rows: holes },
  });
}

describe('get_course: the team scoring by hole counts every round, past the 1,000-row cap', () => {
  it('reads all 1,080 hole rows, so each hole stands on all 60 rounds', async () => {
    const { sb, of } = course();
    const out = await getCourse(sb, coach, { course_id: COURSE });
    const holes = (out.detail as { holes: Array<{ hole_number: number; team: { to_par: number | null; rounds: number } }> }).holes;
    expect(holes).toHaveLength(18);
    for (const h of holes) expect(h.team).toMatchObject({ to_par: 1, rounds: ROUNDS });
    // Paged on a stable order, a page at a time.
    expect(of('golf_holes').some((c) => c.method === 'order' && c.args[0] === 'id')).toBe(true);
    expect(of('golf_holes').filter((c) => c.method === 'range').length).toBeGreaterThan(1);
  });

  it('says the course could not be read when the holes read fails, rather than showing no team scoring', async () => {
    const { sb } = course({ holesError: true });
    const out = await getCourse(sb, coach, { course_id: COURSE });
    expect(out.coverage).not.toBe('complete');
    expect(out.summary).toMatch(/Could not read that course/);
  });
});
