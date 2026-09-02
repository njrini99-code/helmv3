// @vitest-environment jsdom

/**
 * ============================================================================
 * coachHelmDeepScene — the symptom sentence stops parking mid-scrub
 * ----------------------------------------------------------------------------
 * Regression coverage for the mobile-Safari readability bug: "3.2 three-putts
 * per round — up from 1.4 in the fall." used to arrive as masked words
 * scheduled directly on the card's SCRUBBED timeline (`tl.to(symptomWords,
 * ..., 0)`). A masked word is only legible at yPercent 0 or yPercent 110 —
 * never in between (see `primitives.ts` and the fix shipped in f35e71f26 for
 * the landing thesis and coachHelmScene's own insight sentence) — so any
 * scroll position that parks the scrub mid-tween, which mobile Safari's
 * momentum scrolling does far more readily than a desktop wheel, freezes the
 * sentence sliced through the middle of its own line boxes.
 *
 * The fix moves the symptom reveal onto its own clock-based, paused timeline
 * driven by a plain `ScrollTrigger.create({ onEnter, onRefresh })`, matching
 * the pattern already shipped for every other masked reveal on this page.
 * This test asserts the regression directly: the symptom words must NOT be
 * scheduled as tweens on the card's scrubbed timeline, and a separate paused
 * timeline plus a non-scrubbed ScrollTrigger must exist to drive them.
 * ========================================================================== */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScrollTrigger, gsap } from '@/lib/motion/gsap/register';
import { coachHelmDeepScene } from '../coachHelmDeepScene';
import type { SceneContext } from '@/lib/motion/gsap/useScene';

function buildCard(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = `
    <div data-ch-card>
      <p data-ch-symptom>3.2 three-putts per round — up from 1.4 in the fall.</p>
      <div data-cause="ruled-out"><span data-cause-label>Green speeds changed mid-season</span></div>
      <div data-cause="ruled-out"><span data-cause-label>Putting practice volume dropped</span></div>
      <div data-cause="ruled-out"><span data-cause-label>Equipment change</span></div>
      <div data-cause="survivor"><span data-cause-marker>Survivor</span></div>
      <p data-ch-cause>Caused by — a change in green speed the team never adjusted to.</p>
      <div data-si="1">Sample 1</div>
      <div data-si="2">Sample 2</div>
      <p data-ch-verdict>Proven — 2.1 strokes at stake.</p>
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

describe('coachHelmDeepScene — the symptom sentence never parks mid-scrub', () => {
  afterEach(() => {
    ScrollTrigger.getAll().forEach((st) => st.kill());
    gsap.globalTimeline.clear();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('reduced motion: the symptom text is plain, static content — nothing masked, nothing to park', () => {
    const root = buildCard();
    const cleanup = coachHelmDeepScene(makeContext(root, { reduced: true }));

    // Reduced motion never calls maskedWords() at all — the symptom
    // paragraph's own text node is untouched, still fully legible and
    // unsplit.
    const symptom = root.querySelector('[data-ch-symptom]') as HTMLElement;
    expect(symptom.textContent).toContain('3.2 three-putts per round');
    expect(symptom.querySelector('.fw-word')).toBeNull();

    cleanup?.();
  });

  it('the symptom words are never scheduled on the scrubbed cascade timeline', () => {
    const root = buildCard();
    const timelineSpy = vi.spyOn(gsap, 'timeline');

    const cleanup = coachHelmDeepScene(makeContext(root, { reduced: false }));

    const card = root.querySelector('[data-ch-card]');
    // The scrubbed elimination-cascade timeline: the one whose scrollTrigger
    // has `scrub` set.
    const scrubbedTl = timelineSpy.mock.results
      .map((r) => r.value as gsap.core.Timeline)
      .find((tl) => Boolean(tl.scrollTrigger?.trigger === card && tl.scrollTrigger?.getVelocity !== undefined && (tl.scrollTrigger as unknown as { vars: { scrub?: unknown } }).vars?.scrub));
    expect(scrubbedTl).toBeDefined();

    const symptomWords = root.querySelectorAll('.fw-word');
    expect(symptomWords.length).toBeGreaterThan(0);

    // The regression: none of the split words may appear as a tween target
    // on the scrubbed timeline.
    const scrubbedTargets = new Set(
      scrubbedTl!
        .getChildren(false, true, false)
        .flatMap((t) => t.targets() as Element[]),
    );
    symptomWords.forEach((w) => {
      expect(scrubbedTargets.has(w)).toBe(false);
    });

    cleanup?.();
  });

  it('the symptom reveal runs on its own paused, clock-based timeline played by onEnter', () => {
    const root = buildCard();
    const timelineSpy = vi.spyOn(gsap, 'timeline');
    const createSpy = vi.spyOn(ScrollTrigger, 'create');

    const cleanup = coachHelmDeepScene(makeContext(root, { reduced: false }));

    const symptomWords = [...root.querySelectorAll('.fw-word')];
    expect(symptomWords.length).toBeGreaterThan(0);

    // A timeline targeting the split words exists, and it was CONSTRUCTED
    // paused — checked against the constructor call, not live `.paused()`
    // state, since jsdom's zero-geometry layout can let `onEnter` fire
    // synchronously during scene setup and immediately unpause it.
    const symptomTlIndex = timelineSpy.mock.results.findIndex((r) => {
      const tl = r.value as gsap.core.Timeline;
      const targets = tl.getChildren(false, true, false).flatMap((t) => t.targets() as Element[]);
      return symptomWords.some((w) => targets.includes(w));
    });
    expect(symptomTlIndex).toBeGreaterThanOrEqual(0);
    const symptomTlArgs = timelineSpy.mock.calls[symptomTlIndex]?.[0] as gsap.TimelineVars | undefined;
    expect(symptomTlArgs?.paused).toBe(true);

    // A plain ScrollTrigger.create (not a `scrollTrigger:` timeline option)
    // drives it via onEnter/onRefresh — never scrub.
    const call = createSpy.mock.calls.find((c) => {
      const vars = c[0] as ScrollTrigger.Vars;
      return typeof vars.onEnter === 'function' && vars.scrub === undefined;
    });
    expect(call).toBeDefined();

    cleanup?.();
  });
});
