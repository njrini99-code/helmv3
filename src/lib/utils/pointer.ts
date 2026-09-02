/**
 * Coarse-pointer check for event-time / effect-time focus decisions.
 *
 * The mobile focus rule (owner TestFlight report, 2026-08-26): on a touch
 * device the software keyboard appears only from an intentional tap into a
 * field — an overlay must never autofocus a text input on open, because iOS
 * answers that focus with a keyboard that buries the form the user just
 * opened. Desktop keeps first-field autofocus.
 *
 * This is the non-hook variant for code that decides at event/effect time
 * (ModalShell's onOpenAutoFocus, use-focus-trap's mount focus, imperative
 * `.focus()` effects). Render-time decisions (an `autoFocus` prop) should use
 * `useMediaQuery('(pointer: fine)')` instead so they re-render on change and
 * stay SSR-safe.
 *
 * Returns false on the server and in jsdom (the test-setup matchMedia mock
 * reports `matches: false` for everything), so tests exercise the unchanged
 * desktop path.
 */
export function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}
