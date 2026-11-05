import { act, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/golf/actions/development', () => ({ acceptFocusArea: vi.fn(), createFocusAreaFromInsightV2: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-corrections', () => ({ recordCoachHelmCorrection: vi.fn() }));
vi.mock('@/app/golf/actions/insights-coachhelm', () => ({ refreshTeamAnalysisAsCoach: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-course-plan', () => ({ getCoursePlan: vi.fn(), getMyCoursePlan: vi.fn(), listCoursePlanCourses: vi.fn(), listMyCoursePlanCourses: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));

import { ACTIVE_FOCUS_DUPLICATE_ERROR } from '@/lib/coachhelm/focus-areas/duplicate-guard';
import { ToastProvider } from '../../../ui/Toast';
import { useFocusActions, type ChFocusTarget } from '../parts';
import type { ChCoachHelmWrites } from '../writes';

/** W-READ-7, W-READ-8, W-READ-9, W-LNS-6, W-LNS-7, W-TEAM-7, W-TEAM-8: the one write hook the board, the Read, the file and the Team sheet share. */

const target: ChFocusTarget = {
  playerId: 'p1',
  first: 'Eli',
  ins: {
    id: 'i1',
    lifecycle: 'surfaced',
    metric: 'sg_approach',
    current: -0.9,
    areaType: 'approach',
    title: 'Coach words',
    assignAs: { title: 'Player title', description: 'Player words' },
  } as unknown as ChFocusTarget['ins'],
};

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;

function setup(over: Partial<ChCoachHelmWrites> = {}) {
  const writes: ChCoachHelmWrites = {
    assign: vi.fn(async () => ({ success: true })),
    dismiss: vi.fn(async () => ({ success: true })),
    undo: vi.fn(async () => ({ success: true })),
    ...over,
  };
  return { writes, ...renderHook(() => useFocusActions(writes), { wrapper }) };
}

afterEach(() => vi.clearAllMocks());

describe('Assign', () => {
  it('sends the insight own wording and metric, not the coach rewrite', async () => {
    const { result, writes } = setup();
    await act(async () => void (await result.current.assign.run(target)));
    expect(writes.assign).toHaveBeenCalledWith({ playerId: 'p1', insightId: 'i1', title: 'Player title', description: 'Player words', areaType: 'approach', targetMetric: 'sg_approach', currentValue: -0.9 });
  });

  it('two quick taps send one request, and Assigned shows only after the answer', async () => {
    let answer: (r: { success: boolean }) => void = () => {};
    const assign = vi.fn(() => new Promise<{ success: boolean }>((res) => (answer = res)));
    const { result } = setup({ assign });
    let first: Promise<unknown> = Promise.resolve();
    let second: { success: boolean; error?: string } | undefined;
    await act(async () => {
      first = result.current.assign.run(target);
      second = await result.current.assign.run(target);
    });
    expect(assign).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ success: false, error: 'busy' });
    expect(result.current.assigned).toEqual({});
    expect(result.current.here('assign', 'i1')).toBe(true);
    expect(result.current.here('assign', 'other')).toBe(false);
    await act(async () => {
      answer({ success: true });
      await first;
    });
    expect(result.current.assigned).toEqual({ i1: 'proposed' });
    expect(result.current.here('assign', 'i1')).toBe(false);
  });

  it('a refusal leaves the row as it was and shows the failure', async () => {
    const { result } = setup({ assign: vi.fn(async () => ({ success: false, error: 'nope' })) });
    await act(async () => void (await result.current.assign.run(target)));
    expect(result.current.assigned).toEqual({});
    expect(await screen.findByText('Couldn’t assign the focus to Eli')).toBeTruthy();
  });

  it('a throw is a failure too, with no Assigned', async () => {
    const { result } = setup({ assign: vi.fn(async () => Promise.reject(new Error('down'))) });
    let out: { success: boolean } | undefined;
    await act(async () => {
      out = await result.current.assign.run(target);
    });
    expect(out?.success).toBe(false);
    expect(result.current.assigned).toEqual({});
  });

  it('a duplicate reads as Assigned, says so, and is no failure', async () => {
    const assign = vi.fn(async () => ({ success: false, error: ACTIVE_FOCUS_DUPLICATE_ERROR }));
    const { result } = setup({ assign });
    let out: { success: boolean } | undefined;
    await act(async () => {
      out = await result.current.assign.run(target);
    });
    expect(out?.success).toBe(true);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(result.current.assigned).toEqual({ i1: 'active' });
    expect(await screen.findByText('Eli already has a focus on this')).toBeTruthy();
    expect(screen.queryByText('Couldn’t assign the focus to Eli')).toBeNull();
  });
});

describe('Dismiss and Undo', () => {
  it('a failed Dismiss leaves the read on the board', async () => {
    const { result } = setup({ dismiss: vi.fn(async () => ({ success: false })) });
    await act(async () => void (await result.current.dismiss.run(target)));
    expect(result.current.dismissed).toEqual({});
    expect(await screen.findByText('Couldn’t dismiss the insight')).toBeTruthy();
  });

  it('Undo sends the read back with its own lifecycle and clears the mark', async () => {
    const { result, writes } = setup();
    await act(async () => void (await result.current.dismiss.run(target)));
    expect(result.current.dismissed).toEqual({ i1: true });
    await act(async () => void (await result.current.undo.run(target)));
    expect(writes.undo).toHaveBeenCalledWith('i1', 'surfaced');
    expect(result.current.dismissed).toEqual({});
  });

  it('a failed Undo stays dismissed', async () => {
    const { result } = setup({ undo: vi.fn(async () => ({ success: false })) });
    await act(async () => void (await result.current.dismiss.run(target)));
    await act(async () => void (await result.current.undo.run(target)));
    expect(result.current.dismissed).toEqual({ i1: true });
    expect(await screen.findByText('Couldn’t undo the dismissal')).toBeTruthy();
  });
});
