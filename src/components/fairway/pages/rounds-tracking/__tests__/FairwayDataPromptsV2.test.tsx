/**
 * CoachHelm Slice 8b on the real Fairway shot screen: the recovery tap after
 * a rough/'other' tee shot (one tap writes the answer through the screen's
 * save path, Skip writes nothing) and the course nudge at the round's start.
 * With both off (the flag off) the screen renders exactly what it rendered
 * before.
 */
import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FairwayShotTracking from '@/components/fairway/pages/rounds-tracking/FairwayShotTracking';
import type { ShotTrackingProps } from '@/hooks/golf/use-shot-tracking';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import { useCourseNudge, type CourseNudgeView } from '@/components/fairway/pages/rounds-tracking/useCourseNudge';

vi.mock('@/app/golf/actions/shot-actions', () => ({
  deleteShot: vi.fn(async () => ({ success: true })),
  updateShot: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn() }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn() }));
// The picker is loaded on the first tap; the nudge tests never open it.
vi.mock('next/dynamic', () => ({ default: () => () => null }));

Element.prototype.scrollIntoView ??= function () {};

afterEach(cleanup);

const HOLES: RoundHole[] = [
  { number: 1, par: 4, yardage: 390, score: null },
  { number: 2, par: 4, yardage: 360, score: null },
] as RoundHole[];

const TEE_INTO_TREES: ShotRecord = {
  shotNumber: 1,
  shotType: 'tee',
  clubType: 'driver',
  lieBefore: 'tee',
  distanceToHoleBefore: 390,
  distanceUnitBefore: 'yards',
  result: 'other',
  distanceToHoleAfter: 150,
  distanceUnitAfter: 'yards',
  shotDistance: 240,
  isPenalty: false,
};

function mount(opts: {
  shots?: ShotRecord[];
  recoveryPrompt?: boolean;
  courseNudge?: CourseNudgeView | null;
  holes?: RoundHole[];
} = {}) {
  const autosaves: ShotRecord[][] = [];
  const shots = opts.shots ?? [TEE_INTO_TREES];
  const props: ShotTrackingProps = {
    holes: opts.holes ?? HOLES,
    currentHoleIndex: 0,
    initialShots: shots,
    initialShotNumber: shots.length + 1,
    onHoleComplete: async () => true,
    onSaveShot: () => true,
    onAutoSave: async (s) => {
      autosaves.push(s);
    },
    onNavigateToHole: vi.fn(),
  };
  const extra: { recoveryPrompt?: boolean; courseNudge?: CourseNudgeView | null } = {};
  if (opts.recoveryPrompt !== undefined) extra.recoveryPrompt = opts.recoveryPrompt;
  if (opts.courseNudge !== undefined) extra.courseNudge = opts.courseNudge;
  const view = render(<FairwayShotTracking {...props} {...extra} />);
  return { autosaves, view };
}

const recoveryRow = () => screen.queryByRole('region', { name: 'Was the next shot a recovery' });
const nudgeRow = () => screen.queryByRole('region', { name: 'Link this round to a course' });

function nudge(over: Partial<CourseNudgeView> = {}): CourseNudgeView {
  return { courseName: 'Oak Hollow', linkedName: null, onLink: vi.fn(), onSkip: vi.fn(), ...over };
}

describe('recovery tap', () => {
  it('shows after a tee shot into an other lie, never as the primary action', () => {
    mount({ recoveryPrompt: true });
    const row = recoveryRow()!;
    expect(row).not.toBeNull();
    expect(within(row).getByText('Tee shot, other lie')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Clear shot' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Blocked / punch out' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(row).queryAllByRole('button').every((b) => b.getAttribute('data-variant') !== 'primary')).toBe(true);
  });

  it('one tap writes the answer on the tee shot through the save path', async () => {
    const user = userEvent.setup();
    const { autosaves } = mount({ recoveryPrompt: true });
    await user.click(within(recoveryRow()!).getByRole('button', { name: 'Blocked / punch out' }));
    const last = autosaves[autosaves.length - 1]!;
    expect(last).toEqual([{ ...TEE_INTO_TREES, lieAfterRecovery: true }]);
    const row = recoveryRow()!;
    expect(within(row).getByRole('status').textContent).toBe('Saved: a recovery shot');
    expect(within(row).getByRole('button', { name: 'Blocked / punch out' }).getAttribute('aria-pressed')).toBe('true');
    // Corrects on a second tap.
    await user.click(within(recoveryRow()!).getByRole('button', { name: 'Clear shot' }));
    expect(autosaves[autosaves.length - 1]![0]!.lieAfterRecovery).toBe(false);
  });

  it('Skip hides it without writing', async () => {
    const user = userEvent.setup();
    const { autosaves } = mount({ recoveryPrompt: true });
    const before = autosaves.length;
    await user.click(within(recoveryRow()!).getByRole('button', { name: 'Skip the recovery question' }));
    expect(recoveryRow()).toBeNull();
    expect(autosaves.length).toBe(before);
  });

  it('does not ask after a fairway or sand tee shot, a penalty, an answered shot, or once the next shot is in', () => {
    for (const shots of [
      [{ ...TEE_INTO_TREES, result: 'fairway' as const }],
      [{ ...TEE_INTO_TREES, result: 'sand' as const }],
      [{ ...TEE_INTO_TREES, lieAfterRecovery: false }],
      [TEE_INTO_TREES, { ...TEE_INTO_TREES, shotNumber: 2, shotType: 'approach' as const, lieBefore: 'other' as const, result: 'rough' as const }],
    ]) {
      mount({ recoveryPrompt: true, shots });
      expect(recoveryRow()).toBeNull();
      cleanup();
    }
  });
});

describe('course nudge', () => {
  it('shows at the round start (first hole, no shot) and not after the first shot', () => {
    mount({ courseNudge: nudge(), shots: [] });
    const row = nudgeRow()!;
    expect(row).not.toBeNull();
    expect(within(row).getByText(/Oak Hollow/)).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Pick the course' })).toBeTruthy();
    cleanup();
    mount({ courseNudge: nudge() });
    expect(nudgeRow()).toBeNull();
    cleanup();
    mount({ courseNudge: nudge(), shots: [], holes: [{ ...HOLES[0]!, score: 4 }, HOLES[1]!] as RoundHole[] });
    expect(nudgeRow()).toBeNull();
  });

  it('Skip calls the nudge skip', async () => {
    const user = userEvent.setup();
    const view = nudge();
    mount({ courseNudge: view, shots: [] });
    await user.click(within(nudgeRow()!).getByRole('button', { name: 'Skip linking a course' }));
    expect(view.onSkip).toHaveBeenCalledOnce();
  });

  it('the hook: off, or a round with a course, is null; a link keeps the receipt and hands the id over', () => {
    const onLink = vi.fn();
    expect(renderHook(() => useCourseNudge({ enabled: false, hasCourse: false, courseName: 'X', onLink })).result.current).toBeNull();
    expect(renderHook(() => useCourseNudge({ enabled: true, hasCourse: true, courseName: 'X', onLink })).result.current).toBeNull();
    const { result, rerender } = renderHook(
      ({ has }: { has: boolean }) => useCourseNudge({ enabled: true, hasCourse: has, courseName: 'X', onLink }),
      { initialProps: { has: false } },
    );
    act(() => result.current!.onLink({ courseId: 'c-1', courseName: 'Oak Hollow GC' }));
    expect(onLink).toHaveBeenCalledWith('c-1');
    rerender({ has: true });
    expect(result.current?.linkedName).toBe('Oak Hollow GC');
    act(() => result.current!.onSkip());
    expect(result.current).toBeNull();
  });
});

describe('flag off', () => {
  it('draws nothing and leaves the screen byte-identical', () => {
    const off = mount({});
    expect(recoveryRow()).toBeNull();
    const offHtml = off.view.container.innerHTML;
    cleanup();
    const explicitOff = mount({ recoveryPrompt: false, courseNudge: null });
    expect(explicitOff.view.container.innerHTML).toBe(offHtml);
    cleanup();
    const startOff = mount({ shots: [] });
    const startHtml = startOff.view.container.innerHTML;
    cleanup();
    expect(mount({ shots: [], courseNudge: null }).view.container.innerHTML).toBe(startHtml);
  });
});
