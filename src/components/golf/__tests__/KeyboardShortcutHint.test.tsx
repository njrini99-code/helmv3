/**
 * KeyboardShortcutHint — pointer/viewport gating + positioning (audit W1,
 * #27/#107/#115/#190/#121).
 *
 * ⌘K is meaningless on touch. The pill must render `hidden` (no display, no
 * overlap over real content, no stray focus stop) everywhere except when the
 * pointer is fine AND the viewport is `md`+ (768px — the SAME breakpoint
 * `FairwayBottomNav`'s `md:hidden` and the sonner Toaster's mobile/desktop
 * position flip both use, so the pill never renders in the same viewport
 * band as the mobile bottom tab bar or a bottom-center mobile-styled toast),
 * gated via a single combined arbitrary media variant rather than an
 * unconditional `flex`. It must also anchor top-right (never fixed-bottom,
 * which lands on top of real page content) and dismiss for the SESSION
 * (sessionStorage, not a permanent localStorage opt-out).
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { KeyboardShortcutHint } from '../KeyboardShortcutHint';

// ---------------------------------------------------------------------------
// In-memory sessionStorage polyfill — the jsdom-provided globalThis.sessionStorage
// in this repo's setup doesn't expose a callable `clear()` (same fix as
// HubInsightSignalCard.test.tsx), so install a minimal callable stub first.
// ---------------------------------------------------------------------------
beforeAll(() => {
  const store = new Map<string, string>();
  const stub: Storage = {
    get length() {
      return store.size;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
  };
  Object.defineProperty(window, 'sessionStorage', { value: stub, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: stub, configurable: true });
});

describe('KeyboardShortcutHint — pointer/viewport gating', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays `hidden` by default and only opts into display via a combined pointer:fine + md+ media variant', () => {
    const { container } = render(<KeyboardShortcutHint />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const pill = container.firstElementChild;
    expect(pill).not.toBeNull();
    expect(pill?.className).toContain('hidden');
    expect(pill?.className).toContain('[@media(pointer:fine)_and_(min-width:768px)]:flex');
  });

  it('never carries an unconditional `flex` (that would win the display cascade on touch/mobile too)', () => {
    const { container } = render(<KeyboardShortcutHint />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const pill = container.firstElementChild;
    // Matches the bare utility class only — not the media-scoped variant,
    // which legitimately contains "]:flex" as a substring.
    expect(pill?.className.split(/\s+/)).not.toContain('flex');
  });

  it('anchors top-right, never fixed-bottom (bottom-fixed lands on top of real page content on long-scroll pages)', () => {
    const { container } = render(<KeyboardShortcutHint />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const pill = container.firstElementChild;
    const classes = pill?.className.split(/\s+/) ?? [];
    expect(classes).toContain('top-20');
    expect(classes).toContain('right-6');
    expect(classes).not.toContain('bottom-6');
    expect(classes.some((c) => c.startsWith('bottom-['))).toBe(false);
  });

  it('dismiss persists for the session (sessionStorage), not permanently (localStorage)', () => {
    const { container, unmount } = render(<KeyboardShortcutHint />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const dismissButton = container.querySelector('button[aria-label="Dismiss hint"]');
    expect(dismissButton).not.toBeNull();
    act(() => {
      dismissButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(sessionStorage.getItem('helm-shortcut-hint-dismissed')).toBe('true');
    unmount();

    // Re-mounting within the same session must stay dismissed.
    const { container: container2 } = render(<KeyboardShortcutHint />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container2.firstElementChild).toBeNull();
  });
});
