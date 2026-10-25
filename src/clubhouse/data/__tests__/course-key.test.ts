import { describe, expect, it } from 'vitest';
import { courseHref, courseKeyString, groupCourseRounds, parseCourseKey, resolveCourseKey } from '../course-key';

const ID = '3f8e2a4c-1b7d-4c1e-9a5b-6d2f7e8a9b01';
const ID2 = '9c1d5e7a-2b3f-4a6c-8d0e-1f2a3b4c5d6e';
const r = (id: string, course_id: string | null, course_name: string | null) => ({ id, course_id, course_name });

describe('course keys (P-7)', () => {
  it('round-trips an id and a name key', () => {
    expect(parseCourseKey(courseKeyString({ kind: 'id', id: ID }))).toEqual({ kind: 'id', id: ID });
    const name = courseKeyString({ kind: 'name', normalized: 'pinehurst 2' });
    expect(name).toBe('n-pinehurst%202');
    expect(parseCourseKey(name)).toEqual({ kind: 'name', normalized: 'pinehurst 2' });
  });

  it('refuses anything that is not a uuid or a normalized name', () => {
    for (const raw of ['', 'finley', 'n-', 'n-Finley GC', 'n-%E0%A4%A', `n-${'a'.repeat(121)}`]) expect(parseCourseKey(raw)).toBeNull();
  });
});

describe('groupCourseRounds', () => {
  it('groups by id, and a name-only round joins the one id its name maps to', () => {
    const g = groupCourseRounds([r('1', ID, 'Finley GC'), r('2', null, 'finley gc'), r('3', null, 'Marsh Creek')]);
    expect([...g.keys()]).toEqual([ID, 'n-marsh%20creek']);
    expect(g.get(ID)!.rounds.map((x) => x.id)).toEqual(['1', '2']);
    expect(g.get(ID)!.name).toBe('Finley GC');
  });

  it('keeps a name group when the name maps to two ids, and drops rounds with no course', () => {
    const g = groupCourseRounds([r('1', ID, 'Oak Hill'), r('2', ID2, 'Oak Hill'), r('3', null, 'Oak Hill'), r('4', null, '  '), r('5', null, null)]);
    expect(g.get(ID)!.rounds.map((x) => x.id)).toEqual(['1']);
    expect(g.get(ID2)!.rounds.map((x) => x.id)).toEqual(['2']);
    expect(g.get('n-oak%20hill')!.rounds.map((x) => x.id)).toEqual(['3']);
    expect(g.size).toBe(3);
  });
});

describe('resolveCourseKey', () => {
  const groups = groupCourseRounds([r('1', ID, 'Finley GC'), r('2', null, 'Marsh Creek')]);
  it('finds a group, or redirects a stale key', () => {
    expect(resolveCourseKey({ kind: 'id', id: ID }, groups)).toEqual({ group: ID, redirectTo: null });
    // The name now belongs to a library course.
    expect(resolveCourseKey({ kind: 'name', normalized: 'finley gc' }, groups)).toEqual({ group: null, redirectTo: ID });
    // An id no round carries, whose library name matches name-only rounds.
    expect(resolveCourseKey({ kind: 'id', id: ID2 }, groups, 'Marsh Creek')).toEqual({ group: null, redirectTo: 'n-marsh%20creek' });
    expect(resolveCourseKey({ kind: 'name', normalized: 'nowhere' }, groups)).toEqual({ group: null, redirectTo: null });
  });
});

describe('courseHref', () => {
  it('builds the page address with the coach, hole and window', () => {
    expect(courseHref({ kind: 'id', id: ID })).toBe(`/golf/dashboard/rounds/course/${ID}`);
    expect(courseHref('n-marsh%20creek', { player: 'p1', hole: 14, window: 'season' })).toBe('/golf/dashboard/rounds/course/n-marsh%20creek?player=p1&hole=14&w=season');
    expect(courseHref(ID, { hole: 19 })).toBe(`/golf/dashboard/rounds/course/${ID}`);
  });
});
