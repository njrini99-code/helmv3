/**
 * ============================================================================
 * ModalShell — `presentation="workspace"` (new geometry mode, no prior
 * coverage). Its only caller today is CalendarSchedulingDialog.
 * ----------------------------------------------------------------------------
 * ModalShell's default `presentation="dialog"` is depended on by ~79 call
 * sites across the app — the PR that introduced `workspace` claims the
 * default path is byte-for-byte unchanged. The most valuable test here is
 * therefore the one that PINS that default geometry contract, so any future
 * refactor of the presentation branch that leaks into the default path is
 * caught immediately.
 *
 * `workspace`'s own phone-vs-stage split is driven by
 * `useMediaQuery('(max-width: 639.98px)')` (src/hooks/use-media-query.ts),
 * which reads `window.matchMedia(...).matches` through
 * `useSyncExternalStore`. The global test-setup mock (src/test/setup.tsx)
 * stubs `window.matchMedia` to always report `matches: false`, which is
 * sufficient for the default-dialog and workspace-stage cases but not for
 * the workspace-phone case — that one needs a local override, following the
 * same per-file `Object.defineProperty(window, 'matchMedia', …)` pattern
 * ModalShell.coarse-pointer-focus.test.tsx already uses for a different
 * query.
 *
 * Geometry is asserted via the panel's inline `style` — real DOM properties
 * jsdom exposes faithfully — not via Tailwind class names or `data-slot`
 * values, which jsdom does not lay out and which are also implementation
 * detail, not user-visible behavior.
 * ============================================================================
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModalShell } from './ModalShell';

const PHONE_QUERY = '(max-width: 639.98px)';
const realMatchMedia = window.matchMedia;

/** Only `PHONE_QUERY` is meaningful here; every other query (e.g. ModalShell's
 * own `useReducedMotion` check) reports `false`, matching the global default. */
function mockViewport(isPhone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === PHONE_QUERY ? isPhone : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: realMatchMedia,
  });
});

describe('ModalShell — default `dialog` presentation geometry contract', () => {
  it('pins the safe-area-derived position/bottom/maxHeight the whole app depends on', () => {
    mockViewport(false);
    render(
      <ModalShell open onOpenChange={() => {}} title="Reschedule round">
        <ModalShell.Body>content</ModalShell.Body>
      </ModalShell>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Reschedule round' });

    // `top` is asserted via `workspace-phone` below instead of here: jsdom's
    // CSSOM (cssstyle@6.2.0) silently drops this branch's `top` value —
    // `max(1rem, env(safe-area-inset-top))` — reading it back as `''`
    // regardless of what ModalShell actually rendered (confirmed directly
    // against jsdom — a real browser stores it fine). This is a VALUE-SHAPE
    // quirk, not a `top`-PROPERTY one: the same bare, comma-joined
    // `max(<length>, env(...))` string is dropped when assigned to ANY
    // property (verified by assigning it to `bottom` too), while the
    // 3-argument `max(<length>, env(...), calc(var(...) + <length>))` shape
    // used below for `bottom`/`maxHeight` round-trips fine on any property —
    // `top` included. So `bottom` isn't "safe" as a property, only its
    // current value's shape is; a future edit that gave `bottom` this same
    // bare 2-argument shape would silently lose it here too (verified).
    // `top` is untestable in THIS branch only because it happens to be the
    // one place the failing shape is used today.
    expect(dialog.style.position).toBe('fixed');
    expect(dialog.style.bottom).toBe(
      'max(1rem, env(safe-area-inset-bottom), calc(var(--keyboard-height, 0px) + 1rem))',
    );
    expect(dialog.style.maxHeight).toBe(
      'calc(100dvh - max(1rem, env(safe-area-inset-top)) - max(1rem, env(safe-area-inset-bottom), calc(var(--keyboard-height, 0px) + 1rem)))',
    );
  });
});

describe('ModalShell — `presentation="workspace"` on a phone-width viewport', () => {
  it('renders an accessible, closable dialog pinned edge-to-edge from the top, keyboard-aware at the bottom', async () => {
    mockViewport(true);
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ModalShell
        open
        onOpenChange={onOpenChange}
        title="Find a time"
        presentation="workspace"
      >
        <ModalShell.Body>content</ModalShell.Body>
      </ModalShell>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Find a time' });

    // The phone-workspace frame: full height from the very top of the safe
    // box (no 1rem gutter, unlike the default dialog above), with the
    // bottom edge following the soft-keyboard custom property instead of a
    // fixed safe-area inset, and no clipped max-height cap.
    expect(dialog.style.position).toBe('fixed');
    expect(dialog.style.top).toBe('0px');
    expect(dialog.style.bottom).toBe('var(--keyboard-height, 0px)');
    expect(dialog.style.maxHeight).toBe('none');

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});

describe('ModalShell — `presentation="workspace"` off the phone breakpoint', () => {
  it('keeps the default dialog geometry contract (the "stage" frame is a class-level change, not a geometry one)', () => {
    mockViewport(false);
    render(
      <ModalShell open onOpenChange={() => {}} title="Find a time" presentation="workspace">
        <ModalShell.Body>content</ModalShell.Body>
      </ModalShell>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Find a time' });

    // Same safe-area-derived box as the default dialog (see the `top` /
    // jsdom-CSSOM note on that test — not asserted here for the same
    // reason): the phone/stage split only takes the OTHER branch (asserted
    // above) once the media query actually reports a phone-width viewport.
    expect(dialog.style.position).toBe('fixed');
    expect(dialog.style.bottom).toBe(
      'max(1rem, env(safe-area-inset-bottom), calc(var(--keyboard-height, 0px) + 1rem))',
    );
    expect(dialog.style.maxHeight).toBe(
      'calc(100dvh - max(1rem, env(safe-area-inset-top)) - max(1rem, env(safe-area-inset-bottom), calc(var(--keyboard-height, 0px) + 1rem)))',
    );
  });
});
