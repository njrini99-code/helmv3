import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The continue page's loader (the field screen's server read, shared by both UIs), under the owner's rules of 2026-10-01: a read that
 * failed is an error with the route boundary's retry, never "not found", and never a round opened on yardages that were not read (a
 * hole with no yardage is a 1-yard tee shot to the state machine). The page itself is otherwise unchanged; the cases that open
 * normally are here to say so.
 */

const mocks = vi.hoisted(() => ({
  session: { current: null as unknown },
  tables: { current: {} as import('./supabase-fake').ChFakeTables },
  logServerError: vi.fn(async () => {}),
}));

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: () => Promise.resolve(mocks.session.current) }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(mocks.tables));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: mocks.logServerError }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFor: () => Promise.resolve(true) }));
vi.mock('@/clubhouse/routes/round-continue', () => ({ ClubhouseContinueRoundRoute: function ClubhouseContinueRoundRoute() { return null; } }));
vi.mock('@/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client', () => ({ default: function ContinueRoundClient() { return null; } }));
vi.mock('@/components/fairway/pages/rounds/RoundTypeEditor', () => ({ RoundTypeEditor: function RoundTypeEditor() { return null; } }));
vi.mock('@/components/golf/layout/AnimatedPage', () => ({ AnimatedPage: function AnimatedPage() { return null; } }));

import ContinueRoundPage from '@/app/golf/(dashboard)/dashboard/rounds/continue/[id]/page';
import { ClubhouseContinueRoundRoute } from '@/clubhouse/routes/round-continue';

const ID = 'a0000000-0000-4000-8000-000000000001';
const COURSE = 'b0000000-0000-4000-8000-000000000001';

const roundRow = (over: Record<string, unknown> = {}) => ({
  id: ID,
  player_id: 'p1',
  status: 'in_progress',
  course_name: 'Finley GC',
  course_id: COURSE,
  tee_id: null,
  holes_played: 9,
  current_hole: 4,
  round_type: 'practice',
  round_date: '2026-10-14',
  updated_at: '2026-10-14T12:00:00.000Z',
  qualifier_id: null,
  qualifier_round_number: null,
  back_nine: null,
  draft_data: null,
  notes: null,
  ...over,
});
const scored = [1, 2, 3].map((n) => ({ hole_number: n, par: 4, score: 4, putts: 2, fairway_hit: true, gir: true, penalty_strokes: 0, yardage: 380, up_and_down: null, sand_save: null }));
const draftHoles = (yardage: number) => ({ holes: Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, yardage })) });

function tables(over: Record<string, unknown> = {}, round: Record<string, unknown> = {}) {
  mocks.tables.current = {
    golf_rounds: { data: roundRow(round) },
    golf_holes: { data: scored },
    golf_shots: { data: [] },
    golf_course_holes: { data: Array.from({ length: 9 }, (_, i) => ({ hole_number: i + 1, yardage: 400 + i })) },
    ...over,
  } as import('./supabase-fake').ChFakeTables;
}
const load = () => ContinueRoundPage({ params: Promise.resolve({ id: ID }) });
const props = (el: unknown) => (el as ReactElement<Record<string, unknown>>).props;
const yardages = (el: unknown) => (props(el).holes as Array<{ yardage: number }>).map((h) => h.yardage);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.current = { userId: 'u1', role: 'player', player: { id: 'p1' }, coach: null };
});
afterEach(() => {
  mocks.tables.current = {};
});

describe('Continue page loader: a failed read is an error, not "not found"', () => {
  it('a round read that fails throws for the route boundary’s retry, and is logged; it is never NEXT_NOT_FOUND', async () => {
    tables({ golf_rounds: { error: { message: 'down', code: '57014' } } });
    await expect(load()).rejects.toThrow(/Couldn't load this round\. Nothing was changed; please try again\./);
    expect(mocks.logServerError).toHaveBeenCalledWith(expect.stringContaining('Continue round load failed'), expect.anything(), 'critical');
  });

  it('a round that is not there (the read worked, no row, or someone else’s) is still "not found"', async () => {
    tables({ golf_rounds: { data: null } });
    await expect(load()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('a round that is not in progress still goes to its page', async () => {
    tables({}, { status: 'completed' });
    await expect(load()).rejects.toThrow(`NEXT_REDIRECT /golf/dashboard/rounds/${ID}`);
  });

  it('a holes or shots read that fails still throws (unchanged: an unread scorecard is never an empty one)', async () => {
    tables({ golf_holes: { error: { message: 'down' } } });
    await expect(load()).rejects.toThrow(/saved scorecard/);
    tables({ golf_shots: { error: { message: 'down' } } });
    await expect(load()).rejects.toThrow(/saved scorecard/);
  });
});

describe('Continue page loader: a course-hole read that failed never starts tracking on zero yardage', () => {
  it('a failed course-hole read with no yardage from the draft throws instead of opening every hole at 0 yards', async () => {
    tables({ golf_course_holes: { error: { message: 'down' } } });
    await expect(load()).rejects.toThrow(/Couldn't load this course's hole yardages\. Nothing was changed; please try again\./);
    expect(mocks.logServerError).toHaveBeenCalledWith(expect.stringContaining('course-hole load failed'), expect.anything(), 'warning');
  });

  it('the same failure with a draft that carries every yardage opens the round on them, as it would with the read (the draft wins)', async () => {
    tables({ golf_course_holes: { error: { message: 'down' } } }, { draft_data: draftHoles(355) });
    const el = await load();
    expect(el.type).toBe(ClubhouseContinueRoundRoute);
    expect(yardages(el)).toEqual(Array(9).fill(355));
  });

  it('a draft that covers only some holes does not cover the rest: it throws', async () => {
    tables({ golf_course_holes: { error: { message: 'down' } } }, { draft_data: { holes: [{ number: 1, par: 4, yardage: 355 }] } });
    await expect(load()).rejects.toThrow(/hole yardages/);
  });

  it('a course-hole read that works opens the round on the course yardages, as before', async () => {
    tables();
    const el = await load();
    expect(el.type).toBe(ClubhouseContinueRoundRoute);
    expect(yardages(el)).toEqual([400, 401, 402, 403, 404, 405, 406, 407, 408]);
  });

  it('a round with no course (nothing is read) opens as before, with the yardages it has', async () => {
    tables({ golf_course_holes: { error: { message: 'must not matter' } } }, { course_id: null, draft_data: draftHoles(360) });
    const el = await load();
    expect(el.type).toBe(ClubhouseContinueRoundRoute);
    expect(yardages(el)).toEqual(Array(9).fill(360));
  });
});
