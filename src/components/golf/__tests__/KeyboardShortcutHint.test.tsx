/**
 * KeyboardShortcutHint — RETIRED (audit round 2, mustFix #1/#2).
 *
 * Round 1 fixed the pill's breakpoint/positioning/dismiss bugs (#27/#107/
 * #115/#190/#121), but the re-review correctly flagged it as permanently
 * duplicate UI: `FairwayTopBar` already renders a persistent, wired "⌘K"
 * search button at the SAME `md`+ breakpoint, and `CommandPalette.tsx`
 * installs a global `keydown` listener for `⌘K`/`Ctrl+K` independent of any
 * pill or button. Shipping both was "a duplicate/contradictory UI, not a
 * fix" — so the component is now retired to an unconditional no-op rather
 * than repositioned. These tests pin that retirement: it must render
 * nothing, on every call, with no DOM footprint, no timers, no
 * sessionStorage access — nothing left over from the old floating pill for
 * a future edit to accidentally resurrect.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { KeyboardShortcutHint } from '../KeyboardShortcutHint';

describe('KeyboardShortcutHint — retired to a no-op (round 2)', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing', () => {
    const { container } = render(<KeyboardShortcutHint />);
    expect(container.firstElementChild).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('never touches sessionStorage — no dismiss state, no first-run nudge, nothing to persist', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    render(<KeyboardShortcutHint />);

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });

  it('stays empty even after advancing timers — no delayed show/auto-hide behavior survives the retirement', () => {
    vi.useFakeTimers();
    const { container } = render(<KeyboardShortcutHint />);
    vi.advanceTimersByTime(20000);
    expect(container.firstElementChild).toBeNull();
    vi.useRealTimers();
  });
});
