import { LazyMotion, domAnimation } from 'framer-motion';
import { act, cleanup, render, screen, within } from '@testing-library/react';
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

import type { ChCoachHelmData, ChPlayerHelm } from '../data/coachhelm-shape';
import { CoachBoard } from '../screens/coachhelm/CoachBoard';
import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import type { ChCoachHelmWrites } from '../screens/coachhelm/writes';
import { PREVIEW_HELM_COACH, PREVIEW_HELM_PLAYER } from '../preview/fixtures-coachhelm';
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
const pickPlayer = (u: ReturnType<typeof userEvent.setup>, name: string) => u.click(screen.getByRole('button', { name: new RegExp(name) }));
const writesOf = (): ChCoachHelmWrites => ({
  assign: vi.fn(() => Promise.resolve({ success: true })),
  dismiss: vi.fn(() => Promise.resolve({ success: true })),
  undo: vi.fn(() => Promise.resolve({ success: true })),
});
const without = (data: ChCoachHelmData, name: string): ChCoachHelmData => ({ ...data, players: { ...data.players, list: data.players.list.filter((p) => p.name !== name) } });

beforeEach(() => {
  router.refresh.mockClear();
});
afterEach(cleanup);

describe('a write in flight on the coach’s board', () => {
  it('CH-13403 Assign for one player does not read "Assigning" on another player’s card, whose controls wait without a label', async () => {
    const u = userEvent.setup();
    let done!: (v: { success: boolean }) => void;
    const w = writesOf();
    vi.mocked(w.assign).mockReturnValueOnce(new Promise((r) => (done = r)));
    render(wrap(<CoachBoard data={PREVIEW_HELM_COACH} writes={w} />));
    await pickPlayer(u, 'Jonah Okafor');
    await u.click(screen.getByRole('button', { name: 'Assign as focus' }));
    expect(await screen.findByRole('button', { name: 'Assigning' })).toBeDisabled();

    // Another player's card, while Jonah's write runs: its button says what it is, and waits.
    await pickPlayer(u, 'Eli Brandt');
    expect(screen.queryByRole('button', { name: 'Assigning' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Assign as focus' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled();

    // Back on Jonah's: it is still his that is working.
    await pickPlayer(u, 'Jonah Okafor');
    expect(screen.getByRole('button', { name: 'Assigning' })).toBeDisabled();

    await act(async () => done({ success: true }));
    expect(code('CH-13601')?.textContent).toMatch(/Assigned as Jonah’s focus/);
    await pickPlayer(u, 'Eli Brandt');
    expect(screen.getByRole('button', { name: 'Assign as focus' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeEnabled();
  });

  it('CH-13403 Dismiss and Undo are the same: the label is on the card the write is for', async () => {
    const u = userEvent.setup();
    let done!: (v: { success: boolean }) => void;
    const w = writesOf();
    vi.mocked(w.dismiss).mockReturnValueOnce(new Promise((r) => (done = r)));
    render(wrap(<CoachBoard data={PREVIEW_HELM_COACH} writes={w} />));
    await pickPlayer(u, 'Jonah Okafor');
    await u.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByRole('button', { name: 'Dismissing' })).toBeDisabled();
    await pickPlayer(u, 'Priya Natarajan');
    expect(screen.queryByRole('button', { name: 'Dismissing' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled();
    await act(async () => done({ success: true }));
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeEnabled();

    let undone!: (v: { success: boolean }) => void;
    vi.mocked(w.undo).mockReturnValueOnce(new Promise((r) => (undone = r)));
    await pickPlayer(u, 'Jonah Okafor');
    await u.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: 'Undoing' })).toBeDisabled();
    await pickPlayer(u, 'Priya Natarajan');
    expect(screen.queryByRole('button', { name: 'Undoing' })).toBeNull();
    await act(async () => undone({ success: true }));
  });

  it('a write that fails frees every card (nothing stays labelled or stuck)', async () => {
    const u = userEvent.setup();
    const w = writesOf();
    vi.mocked(w.assign).mockResolvedValueOnce({ success: false, error: 'refused' });
    render(wrap(<CoachBoard data={PREVIEW_HELM_COACH} writes={w} />));
    await pickPlayer(u, 'Jonah Okafor');
    await u.click(screen.getByRole('button', { name: 'Assign as focus' }));
    await screen.findByText(/Couldn’t assign the focus to Jonah/);
    expect(screen.getByRole('button', { name: 'Assign as focus' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Assigning' })).toBeNull();
  });
});

describe('the coach’s picked player, after the data changes under it', () => {
  const show = (data: ChCoachHelmData) => {
    const view = render(wrap(<CoachBoard data={data} writes={writesOf()} />));
    return { rerender: (d: ChCoachHelmData) => view.rerender(wrap(<CoachBoard data={d} writes={writesOf()} />)) };
  };

  it('a refresh that keeps the picked player keeps them, whatever else moved: the same name over the same card', async () => {
    const u = userEvent.setup();
    const view = show(PREVIEW_HELM_COACH);
    await pickPlayer(u, 'Priya Natarajan');
    const before = focusHeading();
    // A new object with the list reordered and one player gone: Priya is still on it.
    view.rerender({ ...without(PREVIEW_HELM_COACH, 'Eli Brandt'), players: { ...PREVIEW_HELM_COACH.players, list: [...PREVIEW_HELM_COACH.players.list.filter((p) => p.name !== 'Eli Brandt')].reverse() } });
    expect(screen.getByRole('button', { name: /Priya Natarajan/ })).toHaveAttribute('aria-pressed', 'true');
    expect(focusHeading()).toBe(before);
    expect(code('CH-13908')).toBeNull();
  });

  it('CH-13908 a refresh that takes the picked player off the board says so: it never answers with another player’s card under their name', async () => {
    const u = userEvent.setup();
    const view = show(PREVIEW_HELM_COACH);
    await pickPlayer(u, 'Priya Natarajan');
    view.rerender(without(PREVIEW_HELM_COACH, 'Priya Natarajan'));
    expect(code('CH-13908')?.textContent).toMatch(/Priya is no longer on the board, so this is \w+’s card/);
    expect(code('CH-13908')?.getAttribute('role')).toBe('status');
    // The card is the player the note names, by their own object: name and card come from one player.
    const now = screen.getAllByRole('button', { pressed: true })[0]!;
    expect(code('CH-13908')?.textContent).toContain(now.querySelector('b')!.textContent!.split(' ')[0]!);
  });

  it('CH-13908 the note goes when the coach picks a player, and is not said on a board that never had the pick', async () => {
    const u = userEvent.setup();
    const view = show(PREVIEW_HELM_COACH);
    await pickPlayer(u, 'Priya Natarajan');
    view.rerender(without(PREVIEW_HELM_COACH, 'Priya Natarajan'));
    expect(code('CH-13908')).not.toBeNull();
    await pickPlayer(u, 'Jonah Okafor');
    expect(code('CH-13908')).toBeNull();
    cleanup();
    render(wrap(<CoachBoard data={without(PREVIEW_HELM_COACH, 'Priya Natarajan')} writes={writesOf()} initialPlayer="pl-not-on-the-board" />));
    expect(code('CH-13908')).toBeNull();
  });
});

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
