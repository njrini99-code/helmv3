'use client';

/**
 * KeyboardShortcutHint — RETIRED (audit round 2, mustFix #1/#2).
 *
 * This used to render a "Press ⌘K for quick actions" pill, gated to
 * desktop (`pointer:fine` + `md`+). Round-1 fixed its breakpoint/overlap/
 * dismiss bugs, but the adversarial re-review correctly called out that it
 * was ALWAYS duplicate UI: `FairwayTopBar` already renders a persistent,
 * fully-wired "⌘K" search button at the exact same `md`+ breakpoint
 * (`src/components/fairway/app-shell/FairwayTopBar.tsx`'s `onSearchOpen`
 * button, wired to `CommandPalette` via `FairwayDashboardShell`), and
 * `CommandPalette.tsx` itself installs a GLOBAL `keydown` listener for
 * `⌘K`/`Ctrl+K` that works regardless of any pill or button being on
 * screen. Shipping this floating pill alongside that button was two
 * competing surfaces advertising the same shortcut — "a duplicate/
 * contradictory UI, not a fix" per the review — and no amount of
 * repositioning it removes the duplication.
 *
 * Root-cause fix: retire the pill outright rather than reconciling two
 * affordances into one. The component is kept (not deleted) as a
 * guaranteed-inert no-op so its existing import in
 * `FairwayDashboardShell.tsx` (out of this ticket's file scope) keeps
 * compiling without a second, unrelated edit — it simply renders nothing,
 * every render, unconditionally. If a future ticket wants a fresh
 * first-run nudge for ⌘K, it should extend `FairwayTopBar`'s own button
 * (e.g. a one-time pulse/tooltip anchored to it) rather than reintroduce a
 * second floating surface.
 */
export function KeyboardShortcutHint() {
  return null;
}
