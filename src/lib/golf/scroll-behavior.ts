// =============================================================================
// src/lib/golf/scroll-behavior.ts
//
// #947 (golf dashboard shell) — pure decision helpers for two of the three
// shell scroll defects:
//   (2) route changes preserve the previous page's scroll offset instead of
//       resetting to the top (Dashboard → Brief lands mid-page).
//   (3) the content region ignores Home/End keyboard scrolling.
//
// The dashboard is a plain DOCUMENT-scrolling shell by design (see
// globals.css's `overflow-x: clip` comment — no inner `overflow-y-auto`
// wrapper; `position: sticky` chrome relies on the window being the scroll
// container), so both fixes act on `window`/`document`, not a nested div.
//
// Kept side-effect-free and framework-agnostic on purpose: the actual wiring
// (a `usePathname()` effect in FairwayDashboardShell.tsx, a `keydown` handler
// in AppShell.tsx) is a thin call site around these predicates, so the
// DECISION logic — the part worth pinning down — is unit-testable without
// mounting the full shell (Supabase client, framer-motion, a dozen contexts).
// =============================================================================

/** Inputs for the route-change scroll-reset decision. Deliberately plain
 *  data (no DOM types) so tests don't need jsdom for THIS function. */
export interface ScrollResetDecisionInput {
  /** The pathname before this render (`null` on first mount — never resets). */
  previousPathname: string | null;
  /** The pathname now. */
  nextPathname: string;
  /** True when this navigation was a browser back/forward (`popstate`). */
  isPopState: boolean;
  /** `window.location.hash` at the time of the check (e.g. `"#section"`, or
   *  `""` when absent). */
  hash: string;
}

/**
 * True when a route change should reset the document scroll position to the
 * top. Deliberately excludes:
 *   - no-op "changes" where the pathname didn't actually change (re-renders,
 *     first mount)
 *   - browser back/forward navigation — the browser's own native scroll
 *     restoration already puts the user back where they were; forcing a
 *     reset here would fight it and break the back button
 *   - a hash present on the destination URL (`/route#section`) — an anchor
 *     link should still land on its target, not get overridden to the top
 */
export function shouldResetScrollOnNavigate(input: ScrollResetDecisionInput): boolean {
  const { previousPathname, nextPathname, isPopState, hash } = input;
  if (previousPathname === null) return false; // first mount — nothing to leave behind
  if (previousPathname === nextPathname) return false;
  if (isPopState) return false;
  if (hash) return false;
  return true;
}

/** Tag names whose native Home/End behavior (move the text cursor) must
 *  never be overridden by a page-scroll. */
const EDITABLE_TAG_NAMES = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Composite widgets that legitimately own Home/End for their own
 *  first-item/last-item roving-focus navigation (WAI-ARIA APG pattern for
 *  listbox/tablist/menu/grid/tree) — Home/End reaching one of these should
 *  move focus WITHIN the widget, never scroll the page out from under it. */
const OWNS_HOME_END_SELECTOR =
  '[role="listbox"], [role="tablist"], [role="menu"], [role="menubar"], [role="grid"], [role="treegrid"], [role="tree"], [role="slider"]';

/**
 * True when a Home/End keydown that bubbled up to the dashboard content
 * region should be treated as a "scroll the page" request. `target` is
 * whatever `event.target` was (the actually-focused element, however deep in
 * the tree) — checked directly, plus its ancestors for the composite-widget
 * exclusion.
 */
export function isPageScrollHomeEndTarget(target: Element | null): boolean {
  if (!target) return true;
  if (EDITABLE_TAG_NAMES.has(target.tagName)) return false;
  if (isContentEditableElement(target)) return false;
  if (target.closest(OWNS_HOME_END_SELECTOR)) return false;
  return true;
}

/** True for a `contenteditable` element. Checks the live `.isContentEditable`
 *  getter first (the correct, spec-accurate signal in a real browser — it
 *  accounts for inheritance from an ancestor), then falls back to reading the
 *  attribute directly — jsdom (this repo's unit-test DOM) never implements
 *  `HTMLElement.isContentEditable` (it reads back `undefined`), so relying on
 *  the getter alone would make this silently untestable rather than actually
 *  wrong in production. */
function isContentEditableElement(target: Element): boolean {
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  const attr = target.getAttribute('contenteditable');
  return attr === 'true' || attr === '' || attr === 'plaintext-only';
}
