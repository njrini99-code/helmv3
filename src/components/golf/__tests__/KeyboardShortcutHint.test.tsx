/**
 * KeyboardShortcutHint — pointer/viewport gating (audit W1).
 *
 * ⌘K is meaningless on touch. The pill must render `hidden` (no display, no
 * overlap over real content, no stray focus stop) everywhere except when the
 * pointer is fine AND the viewport is `sm`+, gated via a single combined
 * arbitrary media variant rather than an unconditional `flex`.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { KeyboardShortcutHint } from '../KeyboardShortcutHint';

// ---------------------------------------------------------------------------
// In-memory localStorage polyfill — the jsdom-provided globalThis.localStorage
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
  Object.defineProperty(window, 'localStorage', { value: stub, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true });
});

describe('KeyboardShortcutHint — pointer/viewport gating', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays `hidden` by default and only opts into display via a combined pointer:fine + sm+ media variant', () => {
    const { container } = render(<KeyboardShortcutHint />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const pill = container.firstElementChild;
    expect(pill).not.toBeNull();
    expect(pill?.className).toContain('hidden');
    expect(pill?.className).toContain('[@media(pointer:fine)_and_(min-width:640px)]:flex');
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
});
