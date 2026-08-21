// @vitest-environment jsdom

/**
 * ============================================================================
 * dockScene — the qualifier card's "travel cut" beat
 * ----------------------------------------------------------------------------
 * Regression coverage for two bugs the owner caught on a live mobile
 * screenshot of the "Qualifying & Travel Selection" card: a stray, unlabeled
 * dash sitting between rank 4 and rank 5 in the standings, and the card's
 * bottom row clipped mid-render.
 *
 * Root causes (see dockScene.ts for the full analysis):
 *   1. `cutLabel` ("Travel cut") used to snap in at timeline position 0.24
 *      while `cutRule` (the divider bar) started growing at position 0 — a
 *      0.24s window where a growing/grown bar rendered with no label next to
 *      it. Fixed by moving `cutLabel`'s arrival to position 0.
 *   2. `Flip.from()` was called without `scale: true`, so GSAP's default is to
 *      tween real `width`/`height` from the scattered box to the docked one.
 *      The flagship tile sets `overflow: hidden` for its rounded corners, so
 *      while its real height was still short of its content's natural height
 *      mid-dock, the standings box's bottom row rendered clipped. Fixed by
 *      passing `scale: true`, which uses a `transform: scale()` instead and
 *      never shrinks the tile's real box.
 *
 * `dockScene` is a plain function of `{root, reduced, compact}` (see
 * `SceneContext`), so it is called directly here rather than through
 * `useScene`/React — no rendering, no ScrollTrigger scroll simulation needed
 * for the reduced-motion assertions.
 * ========================================================================== */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Flip, ScrollTrigger, gsap } from '@/lib/motion/gsap/register';
import { dockScene } from '../dockScene';
import type { SceneContext } from '@/lib/motion/gsap/useScene';

/**
 * A minimal stand-in for the real TeamManagement markup — just the
 * `data-dock`/`data-op` attributes dockScene's selectors key off of. Five
 * standing rows (ranks 1–4 washed/checked, rank 5 below the cut) with the
 * `CutLine` divider between rank 4 and rank 5, matching TeamManagement.tsx's
 * actual row order.
 */
function buildBoard(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = `
    <div data-dock="grid">
      <svg data-op="threads"></svg>
      <div data-dock="tile" data-op="source">
        <div>
          <span data-op="pending">Day 5 of 5</span>
          <span data-op="locked">Squad locked</span>
        </div>
        <div data-testid="standings">
          <div data-row="1"><span data-op="wash"></span><span>M. Alvarez</span><span data-op="check"></span></div>
          <div data-row="2"><span data-op="wash"></span><span>J. Okafor</span><span data-op="check"></span></div>
          <div data-row="3"><span data-op="wash"></span><span>T. Bennett</span><span data-op="check"></span></div>
          <div data-row="4"><span data-op="wash"></span><span>D. Park</span><span data-op="check"></span></div>
          <div data-row="cutline"><span data-op="cutrule"></span><span data-op="cutline">Travel cut</span></div>
          <div data-row="5"><span>R. Costa</span></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  return root;
}

function makeContext(root: HTMLElement, overrides: Partial<SceneContext> = {}): SceneContext {
  return {
    root,
    breakpoint: 'mobile',
    reduced: false,
    compact: true,
    mm: {} as gsap.Context,
    ...overrides,
  };
}

describe('dockScene — the qualifier card renders complete', () => {
  afterEach(() => {
    ScrollTrigger.getAll().forEach((st) => st.kill());
    gsap.globalTimeline.clear();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('reduced motion: all 5 standing rows render, exactly one cut-line divider, no orphan dash', () => {
    const root = buildBoard();
    const cleanup = dockScene(makeContext(root, { reduced: true }));

    // Every row from the real card is present, in the real order — the bug
    // was never a missing row, it was an extra-looking one.
    const rows = root.querySelectorAll('[data-testid="standings"] > div');
    expect(rows).toHaveLength(5 + 1); // 5 standing rows + the cut-line row
    expect(root.textContent).toContain('M. Alvarez');
    expect(root.textContent).toContain('D. Park');
    expect(root.textContent).toContain('R. Costa');

    // Exactly one divider — never a duplicate, never zero.
    const cutRules = root.querySelectorAll('[data-op="cutrule"]');
    const cutLabels = root.querySelectorAll('[data-op="cutline"]');
    expect(cutRules).toHaveLength(1);
    expect(cutLabels).toHaveLength(1);

    // The rule and its label are never independently resolved — reduced
    // motion renders the finished analysis, so both read as fully arrived
    // together. A dash with scaleX > 0 and an invisible label is exactly the
    // "stray dash" bug.
    const cutRule = cutRules[0] as HTMLElement;
    const cutLabel = cutLabels[0] as HTMLElement;
    expect(gsap.getProperty(cutRule, 'scaleX')).toBe(1);
    expect(gsap.getProperty(cutLabel, 'autoAlpha')).toBe(1);

    // "Day 5 of 5" hides once the squad is locked — never both visible.
    const pending = root.querySelector('[data-op="pending"]') as HTMLElement;
    const locked = root.querySelector('[data-op="locked"]') as HTMLElement;
    expect(getComputedStyle(pending).display).toBe('none');
    expect(gsap.getProperty(locked, 'autoAlpha')).toBe(1);

    cleanup?.();
  });

  it('docks tiles with scale:true so a growing box never clips overflow:hidden content mid-transition', () => {
    const root = buildBoard();
    const flipFromSpy = vi.spyOn(Flip, 'from');

    const cleanup = dockScene(makeContext(root, { reduced: false }));

    expect(flipFromSpy).toHaveBeenCalled();
    const [, flipVars] = flipFromSpy.mock.calls[0]!;
    // Without this, Flip's default is to tween real width/height — verified
    // directly against the installed Flip build (see dockScene.ts's comment)
    // — which is what let the flagship tile's own `overflow: hidden` clip its
    // last standings row while the tile's real box was still short of its
    // content's natural height.
    expect(flipVars).toMatchObject({ scale: true });

    cleanup?.();
  });

  it('the cut-line label never lags the rule: both are scheduled to arrive together', () => {
    // This guards the exact regression rather than re-simulating ScrollTrigger's
    // scroll math in jsdom (unreliable — no real layout engine). `cutRule`
    // grows via a plain `.to()` and `cutLabel` arrives via the `arrive()`
    // primitive, both scheduled onto the same scrubbed timeline at the same
    // position — reading their scheduled start times directly from the
    // timeline is the deterministic way to assert they can never separate.
    const root = buildBoard();
    const timelineSpy = vi.spyOn(gsap, 'timeline');

    const cleanup = dockScene(makeContext(root, { reduced: false }));

    // The cut-beat timeline is the one built with a `scrollTrigger.trigger`
    // pointed at the flagship tile itself (`[data-op="source"]`), distinct
    // from the dock's own Flip-driven ScrollTrigger.
    const source = root.querySelector('[data-op="source"]');
    const cutTl = timelineSpy.mock.results
      .map((r) => r.value as gsap.core.Timeline)
      .find((tl) => {
        const st = tl.scrollTrigger;
        return st?.trigger === source;
      });
    expect(cutTl).toBeDefined();

    const cutRule = root.querySelector('[data-op="cutrule"]') as HTMLElement;
    const cutLabel = root.querySelector('[data-op="cutline"]') as HTMLElement;
    const ruleTween = cutTl!.getChildren(false, true, false).find((t) => t.targets().includes(cutRule));
    const labelTween = cutTl!
      .getChildren(false, true, false)
      .find((t) => t.targets().includes(cutLabel));

    expect(ruleTween).toBeDefined();
    expect(labelTween).toBeDefined();
    // Both scheduled at the timeline's start — never a gap where the rule has
    // begun drawing and the label has not yet been told to appear.
    expect(labelTween!.startTime()).toBe(ruleTween!.startTime());

    cleanup?.();
  });
});
