import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The coach's action row on one read (`FocusActions` over `useFocusActions`, parts.tsx): Assign as focus, Dismiss and Undo, as
 * the Team page's read sheet, the read's own page and the player file draw it. These are the numbered write contracts in
 * docs/clubhouse/pages/P013-coachhelm/CONTRACT.md; each test names its Bridge ID. They ran on the coach's old signal-list board
 * until it was retired (owner, 2026-11-11), and run on the row itself now, since every surviving page shares it.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/coachhelm' }));
vi.mock('@/app/golf/actions/development', () => ({ acceptFocusArea: vi.fn(), createFocusAreaFromInsightV2: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-corrections', () => ({ recordCoachHelmCorrection: vi.fn() }));
vi.mock('@/app/golf/actions/insights-coachhelm', () => ({ refreshTeamAnalysisAsCoach: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-course-plan', () => ({ getMyCoursePlan: vi.fn(), listMyCoursePlanCourses: vi.fn() }));

import { ACTIVE_FOCUS_DUPLICATE_ERROR } from '@/lib/coachhelm/focus-areas/duplicate-guard';
import type { ChInsight } from '../../../data/coachhelm-shape';
import { PREVIEW_HELM_COACH } from '../../../preview/fixtures-coachhelm';
import { ToastProvider } from '../../../ui/Toast';
import { FocusActions, useFocusActions } from '../parts';
import type { ChCoachHelmWrites } from '../writes';

const jonah = PREVIEW_HELM_COACH.players.list.find((p) => p.name === 'Jonah Okafor')!;
const READ: ChInsight = { ...jonah.top, assigned: null, declined: false, stale: false };
const OTHER: ChInsight = { ...READ, id: `${READ.id}-other`, title: 'Another read' };

const okWrites = (over: Partial<ChCoachHelmWrites> = {}): ChCoachHelmWrites => ({
  assign: vi.fn(() => Promise.resolve({ success: true })),
  dismiss: vi.fn(() => Promise.resolve({ success: true })),
  undo: vi.fn(() => Promise.resolve({ success: true })),
  ...over,
});

function Row({ writes, ins }: { writes: ChCoachHelmWrites; ins: ChInsight }) {
  const fa = useFocusActions(writes);
  return <FocusActions fa={fa} target={{ playerId: jonah.id, first: 'Jonah', ins }} where="board" />;
}

/** Two reads under one page's write state, one open at a time, as a page that opens a read and then another keeps it. */
function TwoReads({ writes }: { writes: ChCoachHelmWrites }) {
  const fa = useFocusActions(writes);
  const [open, setOpen] = useState<'a' | 'b'>('a');
  const ins = open === 'a' ? READ : OTHER;
  return (
    <>
      <button type="button" onClick={() => setOpen(open === 'a' ? 'b' : 'a')}>
        Open the other read
      </button>
      <FocusActions fa={fa} target={{ playerId: jonah.id, first: 'Jonah', ins }} where="board" />
    </>
  );
}

function show(writes: ChCoachHelmWrites = okWrites(), ins: ChInsight = READ) {
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Row writes={writes} ins={ins} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
  return writes;
}

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
/** Browser says offline (or back online), for the length of one test. */
function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

beforeEach(() => {
  hapticSpy.mockClear();
  setOnline(true);
});
afterEach(() => {
  cleanup();
  setOnline(true);
});

describe('130702 writes refuse offline, before anything is sent', () => {
  it('130702 Assign as focus: the toast names what did not happen, the error haptic fires, nothing is sent, and Retry sends it once the browser is back', async () => {
    const u = userEvent.setup();
    const w = show();
    setOnline(false);
    await u.click(screen.getByRole('button', { name: 'Assign as focus' }));
    await expectCode('CH-1903', /Couldn’t assign the focus to Jonah: you’re offline/);
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(w.assign).not.toHaveBeenCalled();
    expect(code('CH-13601')).toBeNull();
    setOnline(true);
    await u.click(within(code('CH-1903') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await expectCode('CH-13601', /Assigned as Jonah’s focus/);
    expect(w.assign).toHaveBeenCalledTimes(1);
  });

  it('130702 Dismiss: the warning haptic has already fired when the refusal comes, then the error; nothing is sent and the read stays', async () => {
    const u = userEvent.setup();
    const w = show();
    setOnline(false);
    await u.click(screen.getByRole('button', { name: 'Dismiss' }));
    await expectCode('CH-1903', /Couldn’t dismiss the insight: you’re offline/);
    expect(hapticSpy.mock.calls.map((c) => c[0]).filter((k) => k === 'warning' || k === 'error')).toEqual(['warning', 'error']);
    expect(w.dismiss).not.toHaveBeenCalled();
    expect(code('CH-13901')).toBeNull();
    expect(screen.getByRole('button', { name: 'Assign as focus' })).toBeTruthy();
  });

  it('130702 Undo: refused offline with the dismissed notice kept, and Retry brings the read back once online', async () => {
    const u = userEvent.setup();
    const w = show();
    await u.click(screen.getByRole('button', { name: 'Dismiss' }));
    const undo = await screen.findByRole('button', { name: 'Undo' });
    setOnline(false);
    await u.click(undo);
    await expectCode('CH-1903', /Couldn’t undo the dismissal: you’re offline/);
    expect(w.undo).not.toHaveBeenCalled();
    expect(code('CH-13901')).not.toBeNull();
    setOnline(true);
    await u.click(within(code('CH-1903') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(code('CH-13901')).toBeNull());
    expect(w.undo).toHaveBeenCalledTimes(1);
  });
});

describe('Assign as focus, Dismiss and Undo on a read', () => {
  it('130806 Assign is offered for a read no focus was made from, a strength included; one already made opens as the Assigned chip (CH-13601)', () => {
    show();
    expect(screen.getByRole('button', { name: 'Assign as focus' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    cleanup();
    show(okWrites(), { ...READ, kind: 'strength' });
    expect(screen.getByRole('button', { name: 'Assign as focus' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    cleanup();
    show(okWrites(), { ...READ, assigned: 'proposed' });
    expect(code('CH-13601')!.textContent).toMatch(/Assigned as Jonah’s focus/);
    expect(screen.queryByRole('button', { name: 'Assign as focus' })).toBeNull();
  });

  it('130902 130901 Assign sends the read’s own title, first sentence, area, metric and the value now; it lands as the chip with the success haptic and no toast, and offers no Accept or Decline', async () => {
    const u = userEvent.setup();
    const w = show();
    await u.click(screen.getByRole('button', { name: 'Assign as focus' }));
    await expectCode('CH-13601', /Assigned as Jonah’s focus/);
    expect(w.assign).toHaveBeenCalledWith({ playerId: jonah.id, insightId: READ.id, title: READ.assignAs.title, description: READ.assignAs.description, areaType: READ.areaType, targetMetric: READ.metric, currentValue: READ.current });
    // A proposal the player accepts, not an active focus: the line under the chip says so, and the answer is the player's.
    expect(screen.getByText('Jonah sees it as a proposal and accepts it to start.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /accept|decline/i })).toBeNull();
    expect(hapticSpy).toHaveBeenCalledWith('success');
    expect(code('CH-1903')).toBeNull();
    expect(code('CH-13001')).toBeNull();
  });

  it('130901 Dismiss lands as the dismissed notice (CH-13901), the warning haptic first, and Undo brings the row back', async () => {
    const u = userEvent.setup();
    const w = show();
    await u.click(screen.getByRole('button', { name: 'Dismiss' }));
    await expectCode('CH-13901', /Insight dismissed/);
    expect(hapticSpy.mock.calls[0]![0]).toBe('warning');
    expect(w.dismiss).toHaveBeenCalledWith(READ.id);
    await u.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(code('CH-13901')).toBeNull());
    expect(screen.getByRole('button', { name: 'Assign as focus' })).toBeTruthy();
    expect(code('CH-1903')).toBeNull();
  });

  it('130903 a player who already has an active focus on the metric is the outcome wanted: the chip, a toast that says so, no failure and no proposal line', async () => {
    const u = userEvent.setup();
    show(okWrites({ assign: vi.fn(() => Promise.resolve({ success: false, error: ACTIVE_FOCUS_DUPLICATE_ERROR })) }));
    await u.click(screen.getByRole('button', { name: 'Assign as focus' }));
    await expectCode('CH-13601', /Assigned as Jonah’s focus/);
    expect(await screen.findByText('Jonah already has a focus on this')).toBeTruthy();
    expect(screen.queryByText('Couldn’t assign the focus to Jonah')).toBeNull();
    expect(screen.queryByText('Jonah sees it as a proposal and accepts it to start.')).toBeNull();
    expect(hapticSpy).not.toHaveBeenCalledWith('error');
  });

  it('131401 CH-13001 a failed Assign says so and keeps the button; the toast’s Retry runs the same write again and finishes the job, chip included', async () => {
    const u = userEvent.setup();
    const assign = vi.fn().mockResolvedValueOnce({ success: false, error: 'nope' }).mockResolvedValue({ success: true });
    show(okWrites({ assign }));
    await u.click(screen.getByRole('button', { name: 'Assign as focus' }));
    await expectCode('CH-13001', /Couldn’t assign the focus to Jonah/);
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(code('CH-13601')).toBeNull();
    expect(screen.getByRole('button', { name: 'Assign as focus' })).toBeTruthy();
    await u.click(within(code('CH-13001') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await expectCode('CH-13601', /Assigned as Jonah’s focus/);
    expect(assign).toHaveBeenCalledTimes(2);
    expect(assign.mock.calls[1]).toEqual(assign.mock.calls[0]);
  });

  it('131201 this visit’s changes stay while the page is open: the Assigned chip and the dismissed notice are still there after opening another read and coming back', async () => {
    const u = userEvent.setup();
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <div className="ch-root" data-ui="clubhouse">
            <TwoReads writes={okWrites()} />
          </div>
        </ToastProvider>
      </LazyMotion>,
    );
    const other = screen.getByRole('button', { name: 'Open the other read' });
    await u.click(screen.getByRole('button', { name: 'Assign as focus' }));
    await expectCode('CH-13601', /Assigned as Jonah’s focus/);
    await u.click(other);
    // The other read is its own: nothing was assigned or dismissed on it.
    expect(code('CH-13601')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Dismiss' }));
    await expectCode('CH-13901', /Insight dismissed/);
    await u.click(other);
    expect(code('CH-13601')!.textContent).toMatch(/Assigned as Jonah’s focus/);
    expect(code('CH-13901')).toBeNull();
    await u.click(other);
    expect(code('CH-13901')).not.toBeNull();
  });

  it('131403 Undo restores the state the read had: a matured one comes back matured', async () => {
    const u = userEvent.setup();
    const w = show(okWrites(), { ...READ, lifecycle: 'matured' });
    await u.click(screen.getByRole('button', { name: 'Dismiss' }));
    await u.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(code('CH-13901')).toBeNull());
    expect(w.undo).toHaveBeenCalledWith(READ.id, 'matured');
  });
});
