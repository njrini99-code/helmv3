import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundHole } from '@/lib/types/golf';

/** P011 110115: a shotgun start. The round starts on any hole; only the play order changes. */

Element.prototype.scrollIntoView ??= function () {};
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/app/golf/actions/shot-actions', () => ({ deleteShot: vi.fn(), updateShot: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { loadRoundsLibrary } from '../data/rounds';
import { PREVIEW_SETUP_COURSES, PREVIEW_SETUP_QUALIFIERS, PREVIEW_SETUP_TEES, PREVIEW_SETUP_TODAY, previewTeeHoles } from '../preview/fixtures-setup';
import { toStartForm } from '../screens/rounds/entry/setup-reads';
import { RoundSetup } from '../screens/rounds/setup/RoundSetup';
import { startPosition, type ChSetupForm, type ChSetupPorts } from '../screens/rounds/setup/shape';
import { RoundCompleteSheet } from '../screens/rounds/track/round-sheets';
import { RoundTracking } from '../screens/rounds/track/RoundTracking';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

afterEach(() => {
  tables.current = {};
});

const ok = <T,>(data: T) => Promise.resolve({ ok: true as const, data });
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`) as HTMLElement | null;

describe('110115 setup: the starting hole', () => {
  const holes = previewTeeHoles('finley-blue');
  const form: ChSetupForm = {
    pick: { courseId: 'finley', courseName: 'Finley GC', place: null, teeId: 'finley-blue', teeName: 'Blue', teeColor: 'blue', rating: null, slope: null, yards: null },
    type: 'practice',
    date: PREVIEW_SETUP_TODAY,
    count: 18,
    nine: 'front',
    holes,
    baseline: holes,
    qualifierId: null,
    qualifierRound: null,
    saveCourse: false,
  };

  it('hands the engine the start as a position in the holes played, hole 1 by default', () => {
    expect(startPosition(form)).toBe(1);
    expect(toStartForm(form).setup.startHole).toBe(1);
    expect(toStartForm({ ...form, start: 6 }).setup.startHole).toBe(6);
    // A back nine is numbered 1..9 by the engine: hole 15 is its sixth.
    expect(toStartForm({ ...form, count: 9, nine: 'back', start: 15 }).setup.startHole).toBe(6);
    // A start outside the holes played is the first hole.
    expect(toStartForm({ ...form, count: 9, nine: 'front', start: 15 }).setup.startHole).toBe(1);
    // The holes keep their order and numbers: only where the round starts changes.
    expect(toStartForm({ ...form, start: 6 }).holes.map((h) => h.holeNumber)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });

  it('offers every hole of the round as the starting hole, and the dock says where it starts', async () => {
    const start = vi.fn((f: ChSetupForm) => ok({ roundId: `r-${f.start}` }));
    const ports: ChSetupPorts = {
      listCourses: vi.fn(() => ok(PREVIEW_SETUP_COURSES)),
      listTees: vi.fn((id: string) => ok(PREVIEW_SETUP_TEES[id] ?? [])),
      teeHoles: vi.fn((id: string) => ok(previewTeeHoles(id))),
      start,
    };
    render(
      <ToastProvider>
        <RoundSetup ports={ports} qualifiers={PREVIEW_SETUP_QUALIFIERS} today={PREVIEW_SETUP_TODAY} backHref="/golf/dashboard/rounds" onStarted={vi.fn()} />
      </ToastProvider>,
    );
    const user = userEvent.setup();
    expect(screen.queryByLabelText('Starting hole')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Browse courses/ }));
    await user.click(await within(code('CH-11510')!).findByRole('button', { name: /^Finley GC/ }));
    await user.click(await screen.findByRole('button', { name: /Play the Blue tees/ }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Scorecard' })).toBeInTheDocument());

    const select = screen.getByLabelText('Starting hole') as HTMLSelectElement;
    expect(select.value).toBe('1');
    expect(within(select).getAllByRole('option')).toHaveLength(18);
    const dock = document.getElementById('ch-rsu-dock-s')!;
    expect(dock).not.toHaveTextContent('Starts on');

    await user.selectOptions(select, '6');
    expect(dock).toHaveTextContent('18 holes · Par 72 · Starts on hole 6');
    await user.click(screen.getByRole('button', { name: /Start round/ }));
    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(toStartForm(start.mock.calls[0]![0]).setup.startHole).toBe(6);
  });
});

describe('110115 tracking: the order the holes are played in', () => {
  const holes18 = (scored: number[]): RoundHole[] =>
    Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, yardage: 380, score: scored.includes(i + 1) ? 4 : null }));
  const ROUND = { course: 'Finley GC', teeLabel: 'Blue', teeColor: 'blue' as const, type: 'practice' as const };
  const track = (holes: RoundHole[], currentHoleIndex: number, startHole?: number) => {
    const onNavigateToHole = vi.fn();
    render(
      <ToastProvider>
        <RoundTracking round={ROUND} holes={holes} currentHoleIndex={currentHoleIndex} startHole={startHole} onHoleComplete={vi.fn(async () => true)} onNavigateToHole={onNavigateToHole} />
      </ToastProvider>,
    );
    return onNavigateToHole;
  };

  it('a round started on 6 can go back to 6 and 7, but not ahead to 1 to 5 before it gets there', async () => {
    const go = track(holes18([6, 7]), 7, 6);
    expect(screen.getByRole('button', { name: 'Hole 6, 4, even' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Hole 8, current' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Hole 1' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Hole 5' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Hole 7, 4, even' }));
    expect(go).toHaveBeenCalledWith(6);
  });

  it('from hole 1 (round started on 6, 6 to 18 in), hole 18 is behind and hole 2 is ahead', () => {
    track(holes18([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]), 0, 6);
    expect(screen.getByRole('button', { name: 'Hole 18, 4, even' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Hole 1, current' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Hole 2' })).toBeInTheDocument();
  });

  it('without a start hole the strip is as before: earlier holes by number are buttons', () => {
    track(holes18([1, 2]), 3);
    expect(screen.getByRole('button', { name: 'Hole 3' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Hole 5' })).toBeInTheDocument();
  });

  it('Round complete returns to the hole the round ended on', () => {
    const holes = Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, score: 4, putts: 2, fairwayHit: true, gir: true }));
    render(<RoundCompleteSheet open heading="Finley GC · Blue · Oct 14" holes={holes} backHole={5} onBack={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Back to hole 5' })).toBeInTheDocument();
    // Front and back stay by hole number.
    expect(within(code('CH-11508')!).getByText('Front · Back').nextSibling).toHaveTextContent('36 · 36');
  });
});

describe('110115 the unfinished card continues where the round is', () => {
  const inProgress = { id: 'u1', course_name: 'Hope Valley CC', tees_played: 'Blue', round_date: '2026-10-14', round_type: 'practice', holes_played: 18, current_hole: 1, updated_at: '2026-10-14T12:00:00Z' };
  const holes = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => ({ round_id: 'u1', hole_number: from + k, par: 4, score: 4 }));
  const status = (f: Array<[string, unknown[]]>) => f.find(([k, a]) => k === 'eq' && a[0] === 'status')?.[1][1];

  it('a round started on 6 with 6 to 18 in continues at hole 1', async () => {
    tables.current = {
      golf_rounds: (f) => (status(f) === 'completed' ? { data: [] } : { data: [{ ...inProgress, start_hole: 6 }] }),
      golf_holes: { data: holes(6, 18) },
    };
    const d = await loadRoundsLibrary({ playerId: 'p1', teamId: null });
    expect(d.unfinished.list[0]).toMatchObject({ nextHole: 1, readyToSubmit: false });
  });

  it('a round started on 6 with only 6 and 7 in continues at hole 8, not hole 1', async () => {
    tables.current = {
      golf_rounds: (f) => (status(f) === 'completed' ? { data: [] } : { data: [{ ...inProgress, start_hole: 6 }] }),
      golf_holes: { data: holes(6, 7) },
    };
    expect((await loadRoundsLibrary({ playerId: 'p1', teamId: null })).unfinished.list[0]).toMatchObject({ nextHole: 8 });
  });

  it('without a start hole it is the first unscored hole by number, as before', async () => {
    tables.current = {
      golf_rounds: (f) => (status(f) === 'completed' ? { data: [] } : { data: [inProgress] }),
      golf_holes: { data: holes(1, 3) },
    };
    expect((await loadRoundsLibrary({ playerId: 'p1', teamId: null })).unfinished.list[0]).toMatchObject({ nextHole: 4 });
  });
});
