/**
 * R8 (2026-09-22) — the Rounds dashboard's player branch flags an
 * `in_progress` round as "ready to submit" when every hole already carries
 * a durable `golf_holes` score. This exercises the ACTUAL page.tsx query
 * logic (not a canned-per-table mock) via the real filtering `fake-supabase`
 * fixture, so `.eq('status', 'completed')` vs `.eq('status', 'in_progress')`
 * and the `golf_holes` join genuinely narrow to the right rows — a
 * hand-rolled per-table mock (see rounds-team-membership-empty-vs-error.test.ts)
 * would return the SAME rows for both `golf_rounds` queries regardless of
 * the status filter, which is exactly wrong for this computation.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => { throw new Error('REDIRECT'); }),
  notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

const PLAYER_ID = 'player-1';

vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: async () => ({
    role: 'player',
    coach: null,
    player: { id: PLAYER_ID },
  }),
}));

function baseTables() {
  return {
    golf_rounds: [] as Array<Record<string, unknown>>,
    golf_holes: [] as Array<Record<string, unknown>>,
  };
}

async function renderRoundsPage() {
  const mod = await import('@/app/golf/(dashboard)/dashboard/rounds/page');
  const element = await (mod.default as (args: unknown) => Promise<React.ReactElement>)({
    searchParams: Promise.resolve({}),
  });
  return render(element);
}

// The page module and its Fairway component tree take seconds to compile; pay
// that once here rather than charging it to whichever test runs first.
beforeAll(async () => {
  await import('@/app/golf/(dashboard)/dashboard/rounds/page');
}, 60_000);

describe('rounds list (player) — R8 "ready to submit" affordance', () => {
  it('flags an in_progress round whose every hole already has a durable score', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: 'round-stuck', player_id: PLAYER_ID, course_name: 'Pebble Beach',
      course_city: 'Pebble Beach', course_state: 'CA', round_date: '2026-09-20',
      round_type: 'practice', status: 'in_progress', holes_played: 2,
      current_hole: 2, updated_at: '2026-09-20T18:00:00Z', created_at: '2026-09-20T14:00:00Z',
      total_score: null, score_to_par: null,
    });
    tables.golf_holes.push({ id: 'h1', round_id: 'round-stuck', hole_number: 1, score: 4 });
    tables.golf_holes.push({ id: 'h2', round_id: 'round-stuck', hole_number: 2, score: 5 });
    fake = createFakeSupabase({ user: { id: 'u-p1' }, tables });

    await renderRoundsPage();

    expect(screen.getByText('Ready to submit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Finish submitting/ })).toBeInTheDocument();
  });

  it('does NOT flag an in_progress round that still has an unscored hole', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: 'round-mid', player_id: PLAYER_ID, course_name: 'Pebble Beach',
      course_city: 'Pebble Beach', course_state: 'CA', round_date: '2026-09-20',
      round_type: 'practice', status: 'in_progress', holes_played: 2,
      current_hole: 1, updated_at: '2026-09-20T18:00:00Z', created_at: '2026-09-20T14:00:00Z',
      total_score: null, score_to_par: null,
    });
    tables.golf_holes.push({ id: 'h1', round_id: 'round-mid', hole_number: 1, score: 4 });
    fake = createFakeSupabase({ user: { id: 'u-p1' }, tables });

    await renderRoundsPage();

    expect(screen.queryByText('Ready to submit')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Continue$/ })).toBeInTheDocument();
  });

  it('does NOT flag a COMPLETED round for the same course/date (only in_progress rows are candidates)', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: 'round-done', player_id: PLAYER_ID, course_name: 'Pebble Beach',
      course_city: 'Pebble Beach', course_state: 'CA', round_date: '2026-09-20',
      round_type: 'practice', status: 'completed', holes_played: 2,
      total_score: 9, score_to_par: 1,
    });
    tables.golf_holes.push({ id: 'h1', round_id: 'round-done', hole_number: 1, score: 4 });
    tables.golf_holes.push({ id: 'h2', round_id: 'round-done', hole_number: 2, score: 5 });
    fake = createFakeSupabase({ user: { id: 'u-p1' }, tables });

    await renderRoundsPage();

    expect(screen.queryByText('Ready to submit')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'In progress' })).not.toBeInTheDocument();
  });
});
