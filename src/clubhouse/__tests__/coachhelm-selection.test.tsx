import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CoachHelm (P013), the owner's rules 2 and 4 (2026-10-01) on the boards' pickers: a write in flight is for one player's card and
 * says so there only; a name never sits over another player's card, and a refresh that takes the picked player (or read) off the
 * board says so instead of answering with another's in silence. CH-13403, CH-13908, CH-13909.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm' }));

import type { ChPlayerHelm } from '../data/coachhelm-shape';
import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import { PREVIEW_HELM_PLAYER } from '../preview/fixtures-coachhelm';
import { ToastProvider } from '../ui/Toast';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);
const focusHeading = () => within(document.querySelector('.ch-hl-focus') as HTMLElement).getByRole('heading', { level: 2 }).textContent;

beforeEach(() => {
  router.refresh.mockClear();
});
afterEach(cleanup);

describe('the player’s picked read, after the data changes under it', () => {
  const list = PREVIEW_HELM_PLAYER.insights.list;
  const show = (data: ChPlayerHelm) => {
    const view = render(wrap(<PlayerBoard data={data} />));
    return { rerender: (d: ChPlayerHelm) => view.rerender(wrap(<PlayerBoard data={d} />)) };
  };
  const rowTitled = (title: string) => screen.getByRole('button', { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });

  it('a read the player picked stays the focus across a refresh that still has it', async () => {
    const u = userEvent.setup();
    const view = show(PREVIEW_HELM_PLAYER);
    const picked = list[1]!;
    await u.click(rowTitled(picked.title));
    expect(focusHeading()).toBe(picked.title);
    view.rerender({ ...PREVIEW_HELM_PLAYER, insights: { list: [...list].reverse(), error: false } });
    expect(focusHeading()).toBe(picked.title);
    expect(code('CH-13909')).toBeNull();
  });

  it('CH-13909 a refresh that takes the picked read off the board falls back to the current focus and says so, naming the read', async () => {
    const u = userEvent.setup();
    const view = show(PREVIEW_HELM_PLAYER);
    const picked = list[1]!;
    await u.click(rowTitled(picked.title));
    view.rerender({ ...PREVIEW_HELM_PLAYER, insights: { list: list.filter((i) => i.id !== picked.id), error: false } });
    expect(code('CH-13909')?.textContent).toBe(`“${picked.title}” is no longer on your board, so this is your current focus.`);
    expect(focusHeading()).not.toBe(picked.title);
    // Picking another read clears it.
    await u.click(rowTitled(list[2]!.title));
    expect(code('CH-13909')).toBeNull();
  });
});
