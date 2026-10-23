import { cleanup, render, renderHook, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import type { DataGapAsk } from '@/lib/coachhelm/data-gap/asks';
import { RoundTracking, type RoundTrackingProps } from '../RoundTracking';
import { RoundCompleteSheet } from '../round-sheets';
import { CourseNudge, linkableCourseId, useChCourseNudge, type ChCourseNudgeView } from '../../entry/CourseNudge';
import type { ChSetupCourse, ChSetupPorts } from '../../setup/shape';
import { ToastProvider } from '../../../../ui/Toast';
import '../../../../__tests__/dialog-polyfill';

/**
 * CoachHelm's one-tap data prompts in Clubhouse round entry (chs-22, chs-23): the putt-miss ask (CH-11960), the recovery tap
 * (CH-11961) and the course nudge (CH-11962). Nothing is drawn without the asks or the flag; a tap goes through the shared
 * engine's save path onto the recorded shot. Synthetic rounds only.
 */

Element.prototype.scrollIntoView ??= function () {};
vi.mock('@/app/golf/actions/shot-actions', () => ({ deleteShot: vi.fn(), updateShot: vi.fn() }));
const haptic = vi.fn();
vi.mock('../../../../lib/haptics', () => ({ haptic: (...a: unknown[]) => haptic(...a) }));

const HOLES: RoundHole[] = [
  { number: 1, par: 4, yardage: 380, score: null },
  { number: 2, par: 4, yardage: 400, score: null },
];
const ROUND = { course: 'Finley GC', teeLabel: 'Blue', teeColor: 'blue' as const, type: 'practice' as const };
const shot = (s: Partial<ShotRecord> & Pick<ShotRecord, 'shotNumber' | 'shotType' | 'result'>): ShotRecord => ({
  clubType: 'non_driver',
  lieBefore: 'fairway',
  distanceToHoleBefore: 0,
  distanceUnitBefore: 'yards',
  distanceToHoleAfter: 0,
  distanceUnitAfter: 'yards',
  shotDistance: 0,
  isPenalty: false,
  ...s,
});
const TEE = shot({ shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee', distanceToHoleBefore: 380, result: 'fairway', distanceToHoleAfter: 140, shotDistance: 240 });
const TEE_ROUGH = shot({ ...TEE, result: 'rough', missDirection: 'right' });
const TEE_OTHER = shot({ ...TEE, result: 'other', missDirection: 'left' });
const APPROACH = (feet: number) => shot({ shotNumber: 2, shotType: 'approach', distanceToHoleBefore: 140, result: 'green', distanceToHoleAfter: feet, distanceUnitAfter: 'feet', shotDistance: 137 });
const PUTT_MISS = (feet: number) =>
  shot({ shotNumber: 3, shotType: 'putting', lieBefore: 'green', distanceToHoleBefore: feet, distanceUnitBefore: 'feet', result: 'green', distanceToHoleAfter: 2, distanceUnitAfter: 'feet', puttDistanceFeet: feet });

const ASK: DataGapAsk = {
  readId: 'read-1',
  readTitle: 'Putts from 5–10 ft',
  field: 'miss_direction',
  filter: { shot_type: 'putting', first_putt: true, distance_feet: [5, 10], holed: false },
  targetCount: 6,
  haveCount: 2,
  taggedSince: 3,
  untaggedSince: 0,
  bandLabel: '5–10 ft',
  windowEnd: '2026-10-01',
};

function setup(over: Partial<RoundTrackingProps> = {}) {
  const onAutoSave = vi.fn(async () => undefined);
  const props: RoundTrackingProps = { round: ROUND, holes: HOLES, currentHoleIndex: 0, onHoleComplete: vi.fn(async () => true), onNavigateToHole: vi.fn(), onAutoSave, ...over };
  render(
    <ToastProvider>
      <RoundTracking {...props} />
    </ToastProvider>,
  );
  return { onAutoSave, user: userEvent.setup() };
}
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);

afterEach(() => {
  cleanup();
  haptic.mockReset();
  localStorage.removeItem('golf_distance_unit_pref');
});

describe('CH-11960 the putt-miss ask (chs-22, coachhelm_data_gap_prompt_v1)', () => {
  it('draws nothing without asks (the flag off), even after a missed first putt in the band', () => {
    setup({ initialShots: [TEE, APPROACH(8), PUTT_MISS(8)], initialShotNumber: 4 });
    expect(code('CH-11960')).toBeNull();
  });

  it('asks after a missed first putt in the band, with the counter, and does not stand in for Next shot', () => {
    setup({ initialShots: [TEE, APPROACH(8), PUTT_MISS(8)], initialShotNumber: 4, dataGapAsks: [ASK] });
    const row = code('CH-11960')!;
    expect(row).not.toBeNull();
    expect(screen.getByText('Which side did it miss?')).toBeTruthy();
    expect(row.textContent).toContain('First putt, 8 ft · 3 of 6 for your 5–10 ft putt read');
    expect(screen.getByRole('group', { name: /Which side the first putt missed, for your read “Putts from 5–10 ft”/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Record next shot/ })).toBeTruthy();
  });

  it('puts the tag on the recorded putt through the hole save, keeps the row as the receipt and moves the counter', async () => {
    const { onAutoSave, user } = setup({ initialShots: [TEE, APPROACH(8), PUTT_MISS(8)], initialShotNumber: 4, dataGapAsks: [ASK] });
    await user.click(screen.getByRole('button', { name: 'Short' }));
    expect(haptic).toHaveBeenCalledWith('select');
    expect(screen.getByRole('button', { name: 'Short' }).getAttribute('aria-pressed')).toBe('true');
    expect(code('CH-11960')!.textContent).toContain('Tagged short · 4 of 6 for your 5–10 ft putt read');
    expect(screen.queryByRole('button', { name: 'Skip tagging this putt' })).toBeNull();
    const saved = (onAutoSave.mock.calls.at(-1) as unknown[])[0] as ShotRecord[];
    expect(saved.find((s) => s.shotNumber === 3)).toMatchObject({ puttMissTags: ['short'], missDirection: 'short' });
  });

  it('Skip hides the row for that putt and writes nothing', async () => {
    const { onAutoSave, user } = setup({ initialShots: [TEE, APPROACH(8), PUTT_MISS(8)], initialShotNumber: 4, dataGapAsks: [ASK] });
    await user.click(screen.getByRole('button', { name: 'Skip tagging this putt' }));
    expect(code('CH-11960')).toBeNull();
    expect(onAutoSave).not.toHaveBeenCalled();
  });

  it('does not ask about a putt outside the band, or one that already carries a miss', () => {
    setup({ initialShots: [TEE, APPROACH(14), PUTT_MISS(14)], initialShotNumber: 4, dataGapAsks: [ASK] });
    expect(code('CH-11960')).toBeNull();
    cleanup();
    setup({ initialShots: [TEE, APPROACH(8), { ...PUTT_MISS(8), puttMissTags: ['long'], missDirection: 'long' }], initialShotNumber: 4, dataGapAsks: [ASK] });
    expect(code('CH-11960')).toBeNull();
  });

  it('says the first putt in meters for a player who reads meters', () => {
    localStorage.setItem('golf_distance_unit_pref', 'meters');
    setup({ initialShots: [TEE, APPROACH(8), PUTT_MISS(8)], initialShotNumber: 4, dataGapAsks: [ASK] });
    expect(code('CH-11960')!.textContent).toMatch(/First putt, 2(\.\d)? m · 3 of 6/);
  });
});

describe('CH-11961 the recovery tap (chs-23, coachhelm_data_prompts_v2)', () => {
  it('draws nothing with the flag off', () => {
    setup({ initialShots: [TEE_ROUGH], initialShotNumber: 2 });
    expect(code('CH-11961')).toBeNull();
  });

  it('asks after a tee shot into the rough, not after one on the fairway', () => {
    setup({ initialShots: [TEE_ROUGH], initialShotNumber: 2, recoveryPrompt: true });
    expect(code('CH-11961')!.textContent).toContain('Tee shot, rough');
    expect(screen.getByText('Next shot from there?')).toBeTruthy();
    cleanup();
    setup({ initialShots: [TEE], initialShotNumber: 2, recoveryPrompt: true });
    expect(code('CH-11961')).toBeNull();
  });

  it('stores the answer on the tee shot through the hole save, and keeps the receipt', async () => {
    const { onAutoSave, user } = setup({ initialShots: [TEE_OTHER], initialShotNumber: 2, recoveryPrompt: true });
    expect(code('CH-11961')!.textContent).toContain('Tee shot, other lie');
    await user.click(screen.getByRole('button', { name: 'Blocked or punch out' }));
    expect(haptic).toHaveBeenCalledWith('select');
    expect(code('CH-11961')!.textContent).toContain('Saved: a recovery shot');
    const saved = (onAutoSave.mock.calls.at(-1) as unknown[])[0] as ShotRecord[];
    expect(saved[0]).toMatchObject({ shotNumber: 1, lieAfterRecovery: true });
  });

  it('does not ask again about a tee shot answered before (a resumed round), and Skip hides it', async () => {
    setup({ initialShots: [{ ...TEE_ROUGH, lieAfterRecovery: false }], initialShotNumber: 2, recoveryPrompt: true });
    expect(code('CH-11961')).toBeNull();
    cleanup();
    const { user } = setup({ initialShots: [TEE_ROUGH], initialShotNumber: 2, recoveryPrompt: true });
    await user.click(screen.getByRole('button', { name: 'Skip the recovery question' }));
    expect(code('CH-11961')).toBeNull();
  });
});

const COURSES: ChSetupCourse[] = [
  { id: 'c-pine', name: 'Pine Hollow', place: null, par: 72, teeCount: 1, group: 'library', lastPlayed: null },
  { id: 'saved:row-1', name: 'Saved and linked', place: null, par: 72, teeCount: 1, group: 'saved', lastPlayed: null, saved: { id: 'row-1', courseId: 'c-linked' } },
  { id: 'saved:row-2', name: 'Saved by hand', place: null, par: 72, teeCount: 1, group: 'saved', lastPlayed: null, saved: { id: 'row-2', courseId: null } },
];
const PORTS: Pick<ChSetupPorts, 'listCourses' | 'listTees'> = {
  listCourses: async () => ({ ok: true, data: COURSES }),
  listTees: async () => ({ ok: true, data: [{ id: 't-blue', name: 'Blue', color: 'blue', category: null, yards: 6400, par: 72, rating: 71.2, slope: 128, holesCount: 18, draft: false }] }),
};
const view = (over: Partial<ChCourseNudgeView> = {}): ChCourseNudgeView => ({ courseName: 'Pine Hollow muni', linkedName: null, onLink: vi.fn(), onSkip: vi.fn(), ...over });

describe('CH-11962 the course nudge (chs-23, coachhelm_data_prompts_v2)', () => {
  it('shows only at the round start: the first hole, before its first shot', () => {
    setup({ startPrompt: <p data-ch-code="CH-11962">nudge</p> });
    expect(code('CH-11962')).not.toBeNull();
    cleanup();
    setup({ initialShots: [TEE], initialShotNumber: 2, startPrompt: <p data-ch-code="CH-11962">nudge</p> });
    expect(code('CH-11962')).toBeNull();
    cleanup();
    setup({ currentHoleIndex: 1, startPrompt: <p data-ch-code="CH-11962">nudge</p> });
    expect(code('CH-11962')).toBeNull();
  });

  it('is null with the flag off or a round that already has a course; Skip hides it; a link keeps the receipt', () => {
    expect(renderHook(() => useChCourseNudge({ enabled: false, hasCourse: false, courseName: 'X', onLink: vi.fn() })).result.current).toBeNull();
    expect(renderHook(() => useChCourseNudge({ enabled: true, hasCourse: true, courseName: 'X', onLink: vi.fn() })).result.current).toBeNull();
    const onLink = vi.fn();
    const { result, rerender } = renderHook(({ hasCourse }) => useChCourseNudge({ enabled: true, hasCourse, courseName: 'X', onLink }), { initialProps: { hasCourse: false } });
    act(() => result.current!.onLink({ courseId: 'c-pine', courseName: 'Pine Hollow' }));
    rerender({ hasCourse: true });
    expect(onLink).toHaveBeenCalledWith('c-pine');
    expect(result.current?.linkedName).toBe('Pine Hollow');
    act(() => result.current!.onSkip());
    expect(result.current).toBeNull();
  });

  it('links a library course or a saved course with a library course behind it, and never offers one without', async () => {
    expect(COURSES.map(linkableCourseId)).toEqual(['c-pine', 'c-linked', null]);
    const nudge = view();
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <CourseNudge nudge={nudge} ports={PORTS} />
      </ToastProvider>,
    );
    expect(code('CH-11962')!.textContent).toContain('“Pine Hollow muni” isn’t linked to the course library. Linked rounds build your hole history and course plans.');
    await user.click(screen.getByRole('button', { name: 'Pick the course' }));
    expect(await screen.findByRole('button', { name: /Saved and linked/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Saved by hand/ })).toBeNull();
    // Linking a library course only: no Add a course in the picker's head.
    expect(screen.queryByRole('button', { name: 'Add a course' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Pine Hollow/ }));
    await user.click(await screen.findByRole('button', { name: /Play the Blue tees/ }));
    expect(nudge.onLink).toHaveBeenCalledWith({ courseId: 'c-pine', courseName: 'Pine Hollow' });
  });

  it('says where a link saves, on the shot screen and in the Round complete sheet', () => {
    render(<CourseNudge nudge={view({ linkedName: 'Pine Hollow' })} ports={PORTS} />);
    expect(code('CH-11962')!.textContent).toContain('Linked to Pine Hollow');
    expect(code('CH-11962')!.textContent).toContain('It saves with your next shot.');
    expect(screen.queryByRole('button', { name: 'Skip linking a course' })).toBeNull();
    cleanup();
    render(<RoundCompleteSheet open heading="Pine Hollow muni · Oct 14" holes={[{ number: 1, par: 4, score: 4, putts: 2, fairwayHit: true, gir: true }]} onBack={vi.fn()} onSubmit={vi.fn()} notice={<CourseNudge nudge={view({ linkedName: 'Pine Hollow' })} ports={PORTS} sheet />} />);
    expect(code('CH-11962')!.textContent).toContain('It saves when you post the round.');
  });
});
