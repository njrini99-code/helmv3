/**
 * ============================================================================
 * FairwayMessages.tsx — the thread panel is capped and centered on wide
 * desktops, without disturbing the tablet-width grid split
 * ----------------------------------------------------------------------------
 * GAPS_AUDIT_TABLET_LANDSCAPE_2026-09-02.md #6 reported the two-pane inbox as
 * narrow at 810px with raw blank cream beside the thread column. That
 * screenshot was captured BEFORE AppShell's isCompactWidth fix for the SAME
 * audit's #4 (the 260px labeled rail not collapsing below 1024px, see
 * AppShell.tsx) landed. Re-derived against the CURRENT, collapsed 76px rail:
 *
 *   810px viewport → 76px rail → ~686px content row
 *     grid 5/12 + 7/12 (gap-6) → rail ≈272px, thread ≈390px, sum = 686px
 *   844px viewport → 76px rail → ~720px content row
 *     grid 5/12 + 7/12 (gap-6) → rail ≈286px, thread ≈410px, sum = 720px
 *
 * A CSS Grid with only fractional (`1fr`) tracks fills its container by
 * construction — there is no way for `grid-cols-12` with col-span-5 +
 * col-span-7 (or col-span-4 + col-span-8 at lg) to leave dead space in the
 * row. So the grid mechanics are UNCHANGED here; this locks that they stay
 * unchanged, alongside the one genuine improvement the audit surfaced: the
 * thread PANEL (not the grid cell) can get uncomfortably wide on a large
 * desktop monitor (the grid cell only exceeds ~720px above a ~1400px-wide
 * window), so it's capped and centered with an inner wrapper that is a
 * no-op at every width this audit actually screenshotted.
 *
 * Source-string matching (not a render test): jsdom does not compute real
 * grid/flex layout, and mounting FairwayMessages needs a large hook/context
 * mock surface for no additional signal (see MessageConversationRail.test.tsx
 * and src/test/golf/mobile-audit-2026-09-02.test.ts for the same tradeoff
 * made elsewhere in this file). One assertion per moving part so a future
 * refactor can't silently drop one of them.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(
  join(process.cwd(), 'src/components/fairway/pages/messages/FairwayMessages.tsx'),
  'utf8',
);

describe('FairwayMessages — two-pane grid width contract', () => {
  it('the two-pane row is still the proportional 12-col grid (fills its row by construction — do not "fix" this to flexbox without re-deriving the width math)', () => {
    // The CONTRACT is "a proportional 12-column grid at md", not one exact
    // class string. Pinning the whole string made the test fail when the panes
    // gained a shared surface and a divider (gap-6 -> gap-0 + md:border-y) —
    // additive styling that leaves the width math untouched. These three
    // tokens are what a flexbox "fix" would actually remove.
    expect(src).toMatch(/grid-cols-12[^`'"]*md:grid/);
    expect(src).toContain('items-stretch');
  });

  it('the rail keeps its proportional grid span (5/12 at md, 4/12 at lg)', () => {
    expect(src).toContain("hidden md:col-span-5 md:flex md:flex-col lg:col-span-4");
    // Tolerates styling added BETWEEN the span utilities (a divider border was),
    // and still fails if either span changes.
    expect(src).toMatch(/col-span-12 flex w-full flex-col md:w-auto md:col-span-5[^'"]*lg:col-span-4/);
  });

  it('the thread wrapper keeps its proportional grid span (7/12 at md, 8/12 at lg)', () => {
    expect(src).toMatch(/md:col-span-7[^'"]*lg:col-span-8/);
    expect(src).toMatch(/hidden min-h-0 flex-col md:col-span-7[^'"]*lg:col-span-8/);
  });

  it('the thread panel (not the grid cell) is capped at a readable max width and centered for wide desktops', () => {
    expect(src).toContain('mx-auto flex w-full min-h-0 max-w-[720px] flex-1 flex-col');
  });

  it('does not regress the phone masthead-hides-on-open-thread fix (PR #1768 / UI-4)', () => {
    // #1768 hid the editorial masthead below `md` WHILE A THREAD WAS OPEN,
    // because it plus the thread header left ~100px of an 844px screen for
    // messages. That guard was written as
    // `mobileShowChat ? 'hidden md:block' : undefined`.
    //
    // The masthead is now hidden below `md` in EVERY state, not only with a
    // thread open: on the list view it printed the destination name a third
    // time (the top bar and the eyebrow already say it) above a stacked action
    // row. So this asserts the PROPERTY #1768 was protecting — the masthead
    // never occupies phone height — rather than the specific conditional it
    // originally used, which is strictly weaker than what ships now.
    // The masthead is now ABSENT on every viewport rather than hidden below
    // `md` — ViewHeader was removed outright and what remains of the desktop
    // band is `md:`-gated. That satisfies the property this test protects
    // (the masthead never occupies phone height) strictly more strongly than
    // the wrapper it used to assert, so the assertion moved to the property:
    // no ViewHeader at all, and nothing masthead-shaped ungated.
    expect(src).not.toContain('<ViewHeader');
    expect(src).toMatch(/hidden[^"']*md:(flex|block)/);
    // And the thread still gets the full column when it is open on a phone.
    expect(src).toMatch(/mobileShowChat \? 'mt-0 md:mt-\d+' : 'mt-3 md:mt-\d+'/);
  });

  it("does not touch MessageThreadPane's own scroll-to-bottom logic (unchanged prop contract, only wrapped in a layout container)", () => {
    // The thread pane still receives the exact same props it always did —
    // this fix only wraps it in one extra layout div, it never edits the
    // component or its scroll behavior (that logic + its tests are owned by
    // MessageThreadPane.scroll.test.ts and are out of scope here).
    expect(src).toContain('className="flex-1 min-h-0"');
    expect(src).toContain('<MessageThreadPane');
  });
});
