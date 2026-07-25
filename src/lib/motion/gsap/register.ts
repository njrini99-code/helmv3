'use client';

/**
 * ============================================================================
 * GSAP plugin registration — the ONE place plugins are registered
 * ----------------------------------------------------------------------------
 * `gsap.registerPlugin` is idempotent, but calling it from many modules makes
 * it impossible to see what the app actually loads. Everything imports `gsap`
 * and the plugins from here instead of from 'gsap' directly.
 *
 * SplitText and Flip ship in the public `gsap` package as of 3.13 (they used to
 * be Club-only), so there is no auth token or private registry involved —
 * verified against gsap@3.15.0's own files.
 *
 * Import-time side effects are safe here because every consumer is a client
 * component: the plugins touch `window` only when a plugin method runs, and
 * `registerPlugin` itself is guarded below so an accidental server import is a
 * no-op rather than a crash.
 * ========================================================================== */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { Flip } from 'gsap/Flip';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger, SplitText, Flip);

  // Marketing pages are the only GSAP consumers, and they never animate
  // anything before hydration — so let ScrollTrigger recompute after the web
  // fonts swap rather than measuring against fallback metrics. A masked
  // SplitText line reveal measures line boxes; getting that wrong by a font
  // swap is the classic "text peeks above its mask" bug.
  if ('fonts' in document) {
    document.fonts.ready
      .then(() => ScrollTrigger.refresh())
      .catch(() => {
        /* font loading is best-effort; triggers still refresh on resize */
      });
  }
}

export { gsap, ScrollTrigger, SplitText, Flip };
