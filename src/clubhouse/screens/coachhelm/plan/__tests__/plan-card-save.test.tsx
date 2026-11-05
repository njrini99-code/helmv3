import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const save = vi.fn();
const undo = vi.fn();
vi.mock('@/app/golf/actions/coachhelm-practice-plans', () => ({
  savePracticePlanDraft: (...a: unknown[]) => save(...a),
  undoPracticePlanDraft: (...a: unknown[]) => undo(...a),
  listPlanFolders: async () => ({ folders: [] }),
}));
vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/coachhelm' }));
vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => true, CH_PHONE_QUERY: '(max-width: 820px)' }));

import { PP_PLAN_PART } from '../../../../preview/fixtures-practice-plan';
import { PlanCard, type PlanPartData } from '../PlanCard';
import { forgetSavedPlan } from '../saved-plans';

const EVENT = '11111111-1111-4111-8111-111111111111';
const PLAN = '22222222-2222-4222-8222-222222222222';
const part = { ...PP_PLAN_PART, eventId: EVENT, saveOn: true, version: 7, draft: { ...PP_PLAN_PART.draft, version: 7 } } as unknown as PlanPartData;
const ok = (version: number, created: boolean) => ({ success: true, planId: PLAN, version, documentId: 'd', folder: 'Practice plans', created, savedAt: new Date().toISOString() });
const show = (onSend = vi.fn()) => {
  render(
    <LazyMotion features={domAnimation}>
      <div className="ch-root" data-ui="clubhouse">
        <PlanCard plan={part} onSend={onSend} />
      </div>
    </LazyMotion>,
  );
  return onSend;
};

beforeEach(() => {
  save.mockReset();
  undo.mockReset();
  forgetSavedPlan(EVENT);
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('saving and publishing from the card', () => {
  it('a first save sends a null version, never 0 and never the card’s edit counter', async () => {
    save.mockResolvedValue(ok(1, true));
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![0]).toMatchObject({ eventId: EVENT, planId: null, version: null });
    await screen.findByText(/Plan saved/);
  });

  it('the next card for the same plan saves over it, with the stored version', async () => {
    save.mockResolvedValueOnce(ok(1, true)).mockResolvedValueOnce(ok(2, false));
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Plan saved/);
    cleanup();
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0]).toMatchObject({ planId: PLAN, version: 1 });
  });

  it('Publish on a saved plan names the plan and its stored version', async () => {
    save.mockResolvedValue(ok(3, true));
    const onSend = show();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Plan saved/);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    expect(onSend).toHaveBeenCalledWith(expect.stringContaining(`plan_id ${PLAN}, version 3`));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('Publish on an unsaved draft saves it first', async () => {
    save.mockResolvedValue(ok(1, true));
    const onSend = show();
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith(expect.stringContaining(`plan_id ${PLAN}, version 1`)));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('a failed save sends nothing to the thread and keeps the draft', async () => {
    save.mockResolvedValue({ success: false, error: 'Add a practice to the calendar first.', needsEvent: true });
    const onSend = show();
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    await screen.findByText('Add a practice to the calendar first.');
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0]).toMatchObject({ planId: null, version: null });
  });

  it('after Undo, the next save is a first save again', async () => {
    save.mockResolvedValueOnce(ok(1, true)).mockResolvedValueOnce(ok(1, true));
    undo.mockResolvedValue({ success: true });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Plan saved/);
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await screen.findByText(/Nothing was saved/);
    cleanup();
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0]).toMatchObject({ planId: null, version: null });
  });
});
