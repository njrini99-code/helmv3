/**
 * MOT-10 (production audit, 15 Nov 2026): on a phone the full plan was a fixed layer at z 90 with a hard cut, no scroll lock
 * and a hand-written focus trap. It is now a native <dialog> through the shared lifetime: the top layer keeps Tab inside, the
 * page behind is locked, its title takes focus, Esc (the dialog's cancel) closes it, and the plan's blocks open from a real
 * title button rather than a pressable row that hid its source keys (SWP-09).
 */
import '../../../../__tests__/dialog-polyfill';
import { LazyMotion, domAnimation } from 'motion/react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/golf/actions/coachhelm-practice-plans', () => ({
  savePracticePlanDraft: vi.fn(),
  undoPracticePlanDraft: vi.fn(),
  listPlanFolders: async () => ({ folders: [] }),
}));
vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/coachhelm' }));
vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => true, CH_PHONE_QUERY: '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' }));

import { PP_PLAN_PART } from '../../../../preview/fixtures-practice-plan';
import { PlanCard, type PlanPartData } from '../PlanCard';

const part = { ...PP_PLAN_PART, saveOn: true } as unknown as PlanPartData;

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const show = () =>
  render(
    <LazyMotion features={domAnimation}>
      <div className="ch-root" data-ui="clubhouse">
        <PlanCard plan={part} onSend={vi.fn()} />
      </div>
    </LazyMotion>,
  );

describe('the full plan on a phone (MOT-10)', () => {
  it('opens as a native dialog in the top layer, titled and focused on its title, and Esc closes it', async () => {
    show();
    const open = screen.getByRole('button', { name: 'Open' });
    open.focus();
    fireEvent.click(open);
    const dialog = document.querySelector('dialog.ch-cpv-full') as HTMLDialogElement;
    expect(dialog).not.toBeNull();
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.getAttribute('aria-label')).toBe(part.title);
    // No hand-written dialog layer beside it.
    expect(document.querySelector('div.ch-cpv-full')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(dialog.querySelector('.fbar > b')));
    act(() => {
      fireEvent(dialog, new Event('cancel', { cancelable: true }));
    });
    await waitFor(() => expect(document.querySelector('dialog.ch-cpv-full')).toBeNull());
    expect(document.activeElement).toBe(open);
  });

  it('each block opens from its title button, and its source keys are that button’s siblings, not its children (SWP-09)', () => {
    const { container } = show();
    const blocks = [...container.querySelectorAll('.ch-cpv .blk:not(.wh):not(.skel)')];
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      expect(b.getAttribute('role')).toBeNull();
      expect(b.hasAttribute('tabindex')).toBe(false);
      const title = b.querySelector('button.btt');
      expect(title).not.toBeNull();
      expect(title!.querySelector('button')).toBeNull();
    }
  });
});
