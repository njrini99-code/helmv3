/**
 * D-PICKER (owner decision 2026-09-23): the course picker is a full-screen
 * navigation push, not a sheet. These pin the stack behaviour the audit rows
 * asked for:
 *   RE-P5 — Escape pops ONE level (tees → courses), and only the courses
 *           screen closes the picker.
 *   RE-P3 — a library failure is an inline "Couldn't load · Retry" notice,
 *           even when the recent/team feeds loaded; never "No courses yet".
 *   RE-P7 — the library is a vertical A–Z list with a section index, not a
 *           horizontal carousel.
 *   RE-P8 — the nav-bar search field has enterKeyHint=search and no autocorrect.
 *   RE-P6 — a tee list prefetched on pointer-down renders with no skeleton.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'framer-motion';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/coachhelm/v3/motion', () => ({ useReducedMotionGuard: () => false }));
vi.mock('@/components/fairway/pages/rounds-new/FairwayTeeCard', () => ({
  FairwayTeeCard: ({ tee, onClick, disabled }: { tee: { id: string; name: string }; onClick: () => void; disabled?: boolean }) => (
    // eslint-disable-next-line helm/no-raw-button -- test stub
    <button type="button" disabled={disabled} onClick={onClick}>{`Tee ${tee.name}`}</button>
  ),
}));

const course = (id: string, name: string) => ({ id, name, city: 'Town', state: 'NC', image_url: null, normalized_name: name.toLowerCase() });

vi.mock('@/app/golf/actions/course-library', () => ({
  listCourses: vi.fn(async () => [course('1', 'Pebble Beach'), course('2', 'Augusta National')]),
  getRecentlyPlayedCourses: vi.fn(async () => []),
  getTeamSavedCourses: vi.fn(async () => []),
  getCourseDetail: vi.fn(async () => ({ tees: [{ id: 'tee-blue', name: 'Blue', total_yards: 6800 }, { id: 'tee-white', name: 'White', total_yards: 6300 }] })),
  getTeeRoundDefaults: vi.fn(async () => null),
}));

import { FairwayCoursePicker } from '@/components/fairway/pages/rounds-new/FairwayCoursePicker';
import * as lib from '@/app/golf/actions/course-library';

type Fn = ReturnType<typeof vi.fn>;

function ui(onOpenChange: (o: boolean) => void = () => {}) {
  return (
    <LazyMotion features={domAnimation}>
      <FairwayCoursePicker open onOpenChange={onOpenChange} onPick={() => {}} />
    </LazyMotion>
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('FairwayCoursePicker push stack', () => {
  it('Escape on the tee screen pops back to the courses screen without closing', async () => {
    const onOpenChange = vi.fn();
    render(ui(onOpenChange));

    fireEvent.click(await screen.findByText('Pebble Beach'));
    expect(await screen.findByText('Tee Blue')).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(await screen.findByRole('heading', { level: 1, name: 'Choose a course' })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    // Escape again, now on the root screen, closes the picker.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('the nav-bar back item pops to the course list', async () => {
    render(ui());
    fireEvent.click(await screen.findByText('Pebble Beach'));
    await screen.findByText('Tee Blue');
    fireEvent.click(screen.getByRole('button', { name: 'Back to courses' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Choose a course' })).toBeInTheDocument();
  });

  it('shows an inline retry when only the library feed fails, keeping the other feeds', async () => {
    (lib.listCourses as unknown as Fn).mockRejectedValueOnce(new Error('network'));
    (lib.getRecentlyPlayedCourses as unknown as Fn).mockResolvedValueOnce([course('r1', 'Riverbend')]);
    render(ui());

    expect(await screen.findByText("Couldn't load the course library")).toBeInTheDocument();
    expect(screen.getByText('Riverbend')).toBeInTheDocument();
    expect(screen.queryByText(/No courses yet/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Pebble Beach')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Couldn't load the course library")).not.toBeInTheDocument());
    expect(lib.listCourses).toHaveBeenCalledTimes(2);
  });

  it('never shows "No courses yet" when every feed is empty because the library failed', async () => {
    (lib.listCourses as unknown as Fn).mockRejectedValueOnce(new Error('network'));
    render(ui());
    expect(await screen.findByText("Couldn't load the course library")).toBeInTheDocument();
    expect(screen.queryByText(/No courses yet/i)).not.toBeInTheDocument();
  });

  it('lists the library vertically A–Z with a section index once it is long', async () => {
    const names = ['Zephyr Hills', 'Augusta National', 'Baltusrol', 'Bethpage Black', 'Cypress Point', 'Dunes Club',
      'Erin Hills', 'Firestone', 'Garden City', 'Harbour Town', 'Inverness', 'Jupiter Hills', 'Kiawah Island'];
    (lib.listCourses as unknown as Fn).mockResolvedValueOnce(names.map((n, i) => course(String(i), n)));
    render(ui());

    await screen.findByText('Zephyr Hills');
    expect(screen.queryByRole('region', { name: /carousel/i })).not.toBeInTheDocument();
    const rail = screen.getByRole('navigation', { name: 'Jump to letter' });
    expect(rail).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jump to B' })).toBeInTheDocument();

    // Rows come out alphabetically: Augusta before Zephyr.
    const rows = screen.getAllByRole('button', { name: /, Town, NC$/ });
    expect(rows[0]).toHaveAccessibleName('Augusta National, Town, NC');
    expect(rows[rows.length - 1]).toHaveAccessibleName('Zephyr Hills, Town, NC');
  });

  it('search field carries the search return key and no autocorrect', async () => {
    render(ui());
    const input = await screen.findByRole('searchbox', { name: 'Search courses' });
    expect(input).toHaveAttribute('enterkeyhint', 'search');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('autocapitalize', 'none');
    expect(input).toHaveAttribute('spellcheck', 'false');
  });

  it('a course prefetched on pointer-down opens straight onto its tees', async () => {
    render(ui());
    const row = (await screen.findByText('Pebble Beach')).closest('button')!;
    await act(async () => {
      fireEvent.pointerDown(row);
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(row);
    // No skeleton frame: the tee card is there synchronously after the tap.
    expect(screen.getByText('Tee Blue')).toBeInTheDocument();
    expect(lib.getCourseDetail).toHaveBeenCalledTimes(1);
  });

  it('a course with a single tee skips the tee screen and picks it (RE-P6)', async () => {
    vi.mocked(lib.getCourseDetail).mockResolvedValueOnce({
      tees: [{ id: 'tee-only', name: 'Only', total_yards: 6100 }],
    } as unknown as Awaited<ReturnType<typeof lib.getCourseDetail>>);
    const onOpenChange = vi.fn();
    render(ui(onOpenChange));
    fireEvent.click(await screen.findByText('Pebble Beach'));
    await waitFor(() => expect(lib.getTeeRoundDefaults).toHaveBeenCalledWith('tee-only'));
  });
});
