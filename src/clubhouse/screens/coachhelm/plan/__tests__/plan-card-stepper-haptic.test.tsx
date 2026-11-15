import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/coachhelm-practice-plans', () => ({
  savePracticePlanDraft: vi.fn(),
  undoPracticePlanDraft: vi.fn(),
  listPlanFolders: async () => ({ folders: [] }),
}));
vi.mock('../../../../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/coachhelm' }));
vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => true, CH_PHONE_QUERY: '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' }));

import { PP_PLAN_PART } from '../../../../preview/fixtures-practice-plan';
import { PlanCard, type PlanPartData } from '../PlanCard';

/** MOTION-AND-VISUAL 3.10: a stepper's change is a selection tick (D-70), through lib/haptics.ts. */
describe("the length stepper on the plan block sheet", () => {
  beforeEach(() => {
    hapticSpy.mockClear();
    // jsdom has no modal dialog.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('ticks the selection haptic once for each step, Shorter and Longer', () => {
    render(
      <LazyMotion features={domAnimation}>
        <div className="ch-root" data-ui="clubhouse">
          <PlanCard plan={PP_PLAN_PART as unknown as PlanPartData} onSend={vi.fn()} />
        </div>
      </LazyMotion>,
    );
    const warmUp = [...document.querySelectorAll<HTMLElement>('.blk')].find((b) => b.textContent?.includes('Warm-up'))!;
    fireEvent.click(warmUp);
    hapticSpy.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Longer', hidden: true }));
    expect(screen.getAllByText('35 min').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Shorter', hidden: true }));
    expect(hapticSpy.mock.calls).toEqual([['select'], ['select']]);
  });
});
