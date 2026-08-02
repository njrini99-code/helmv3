'use client';

/**
 * ============================================================================
 * anim-gate — per-element release for the first-paint entrance gate
 * ----------------------------------------------------------------------------
 * `marketing-anim-gate` (set on <html> by a blocking head script, see
 * components/landing/MarketingAnimGate.tsx) hides every entrance target in the
 * first painted frame so the server's settled HTML can never be seen and then
 * yanked away. Something has to un-hide it, and WHERE that happens is the whole
 * design problem.
 *
 * The obvious answer — lift one global class from the shared shell once it
 * mounts — is wrong, and measurably so. `/products` renders MarketingShell and
 * ProductsLanding as two SEPARATE client boundaries, and React hydrates them in
 * separate commits: the shell's layout effect ran first and dropped the gate
 * while all 20 `[data-reveal]` blocks were still at their default opacity, so
 * they flashed for ~20ms (94ms at 4x CPU) before useProductsEffects hid them.
 * `/` never showed this because LandingView pulls the shell and the hero into
 * ONE boundary that hydrates together — i.e. the global lift was correct only
 * by accident of how a page happened to be composed.
 *
 * So the release is PER ELEMENT and owned by whoever hides it. An entrance
 * target stays hidden by CSS until its own animation system has written its own
 * hidden state and stamped `data-anim-ready` on it. There is no ordering to get
 * right, no cross-boundary race, and a page that composes its client boundaries
 * differently tomorrow cannot silently reintroduce the flash.
 *
 * The global escape hatches still exist and still matter — no JS means the class
 * is never set at all, and the head script drops it on a timer so a failed
 * hydration can never leave the page blank.
 * ========================================================================== */

const ANIM_READY_ATTR = 'data-anim-ready';

/** This element's animation system has taken over; CSS may stop hiding it. */
export function markAnimReady(el: Element | null | undefined): void {
  el?.setAttribute(ANIM_READY_ATTR, '');
}

/** Bulk form, for the systems that prep a whole NodeList in one pass. */
export function markAllAnimReady(els: Iterable<Element | null | undefined>): void {
  for (const el of els) el?.setAttribute(ANIM_READY_ATTR, '');
}

/**
 * HAND THE ELEMENT BACK TO THE GATE. Every system that marks must also unmark
 * from its cleanup, because releasing is not a one-way door.
 *
 * React StrictMode (on in dev — next.config.mjs sets `reactStrictMode: true`)
 * double-invokes effects: mount, clean up, mount again. `useScene`'s cleanup is
 * `mm.revert()`, and reverting a GSAP context RESTORES the inline styles it
 * wrote — which is to say it puts the element back in its SETTLED, VISIBLE
 * state. With the release left stamped, the CSS gate no longer applies, so
 * between the teardown and the second mount the finished hero paints at full
 * opacity and then gets hidden and animated again. That is the "it flashes and
 * then starts over" on every dev load, and it is the exact failure the gate
 * exists to prevent, reintroduced through the back door.
 *
 * Unmarking here means a teardown re-gates the element, so the only thing
 * visible across a double-mount is the hidden state.
 */
export function unmarkAnimReady(el: Element | null | undefined): void {
  el?.removeAttribute(ANIM_READY_ATTR);
}

/** Bulk form of {@link unmarkAnimReady}. */
export function unmarkAllAnimReady(els: Iterable<Element | null | undefined>): void {
  for (const el of els) el?.removeAttribute(ANIM_READY_ATTR);
}
