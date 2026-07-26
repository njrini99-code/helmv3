import { test, expect } from '@playwright/test';

/**
 * Marketing scroll choreography — the "no half-legible datum" guard.
 *
 * WHY THIS EXISTS, and why it is not part of `accessibility.spec.ts`:
 *
 * That suite audits the public routes under `prefers-reduced-motion: reduce`
 * ONLY, with a written rationale — the animated page has no single scroll
 * position at which every scene is settled, so axe samples whatever frame each
 * scene happens to be on and the contrast results flap. That reasoning is
 * correct for a gating axe run, but it has a cost: it makes CI structurally
 * blind to anything that only goes wrong WHILE the page is animating.
 *
 * Something did. Shipped to production and reported by the founder:
 * "SG · App +0.4" sat permanently at `opacity: 0.27` with 8.7px of leftover
 * translate, because its reveal was the last tween on a scrubbed timeline and
 * so only completed at the literal final pixel of the trigger range. A sweep of
 * the live page then found 20 more of the same thing in the stats band, with
 * ranked-cell copy measured as low as 1.34:1.
 *
 * The common cause is one mistake: interpolating opacity on a SCRUBBED
 * timeline. Scroll is not a clock — the reader stops wherever they stop, and a
 * "fade" becomes a resting state at whatever fraction that was. So the rule the
 * scenes now follow is: reveal by transform (masked rise, scale, slide) and
 * SNAP visibility with a zero-duration `set()`. Text is either absent or fully
 * legible; it is never dimmed.
 *
 * This spec asserts exactly that rule, and nothing softer:
 *
 *   at any settled scroll position, no element that renders its own text may
 *   carry a fractional INLINE opacity.
 *
 * Inline is the load-bearing word. GSAP writes `style="opacity: 0.27"`; a
 * designed translucency comes from a stylesheet. Checking only the inline
 * property targets animation output precisely and will not cry wolf over a
 * decorative `opacity-60` rule in the design system. "Settled" is likewise
 * load-bearing: the scenes scrub with `SCRUB.smooth` (1s of lag), so each stop
 * waits past that before sampling — which is what makes this deterministic
 * where a naive mid-scroll audit is not.
 */

const ROUTES = ['/', '/products'] as const;

/** Comfortably longer than SCRUB.smooth (1s) so the timeline finishes catching
 *  up to the scroll position before anything is measured. */
const SCRUB_SETTLE_MS = 1300;

interface DimText {
  route: string;
  scrollY: number;
  opacity: string;
  tag: string;
  text: string;
  path: string;
}

for (const route of ROUTES) {
  test(`no text is left half-faded while scrolling ${route}`, async ({ page }) => {
    test.setTimeout(360_000);

    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    // A route that did not actually render is the one way this spec can pass
    // while proving nothing — the sweep finds no faded text because there is no
    // text. `src/proxy.ts` fails CLOSED with a 500 when the Supabase env vars
    // are absent, which is exactly what happens in a worktree with no
    // `.env.local`. Skip loudly rather than green-tick an error page.
    const status = response?.status() ?? 0;
    test.skip(status !== 200, `${route} returned ${status} — nothing to audit (missing env?)`);

    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1500);

    const viewport = page.viewportSize()?.height ?? 720;
    const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    // Same guard from the other side: a 200 that renders a stub is still not an
    // audit. Every one of these routes is a long scroll narrative.
    expect(docHeight, `${route} rendered only ${docHeight}px — too short to be the real page`).toBeGreaterThan(
      viewport * 2,
    );
    // 12% of a viewport, NOT a half-screen. A reveal window is only ~20% of its
    // scene's scroll range; sampling in half-viewport jumps steps clean over it
    // and the test passes with the bug present. Verified by reintroducing the
    // original fading reveal — at 0.45 the spec still passed, at 0.12 it fails.
    const step = Math.round(viewport * 0.12);
    const offenders: DimText[] = [];

    for (let y = 0; y < docHeight; y += step) {
      await page.evaluate((to) => window.scrollTo(0, to), y);
      await page.waitForTimeout(SCRUB_SETTLE_MS);

      const found = await page.evaluate(() => {
        const out: { opacity: string; tag: string; text: string; path: string }[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
          // Only animation-written opacity — a designed translucency lives in a
          // stylesheet, not in the style attribute.
          const inline = el.style.opacity;
          if (!inline) continue;
          const value = Number(inline);
          if (!Number.isFinite(value) || value <= 0.02 || value >= 0.98) continue;

          // Only things that put TEXT on screen. A part-transparent SVG ball or
          // a decorative rule is not a legibility problem; a part-transparent
          // numeral is. This deliberately tests the whole SUBTREE rather than
          // the element's own text nodes: GSAP sets opacity on the wrapper a
          // reveal is authored against, and the numeral is a grandchild. An
          // earlier version of this check looked only at own text nodes, which
          // is why it passed against the known-bad build.
          const own = (el.textContent ?? '').trim();
          if (!own) continue;

          // Report the OUTERMOST faded ancestor only, so one faded panel is one
          // finding rather than one per descendant.
          let covered = false;
          for (let p = el.parentElement; p; p = p.parentElement) {
            const pv = Number(p.style.opacity);
            if (p.style.opacity && Number.isFinite(pv) && pv > 0.02 && pv < 0.98) {
              covered = true;
              break;
            }
          }
          if (covered) continue;

          const path: string[] = [];
          for (let cur: Element | null = el; cur && path.length < 4; cur = cur.parentElement) {
            path.unshift(cur.tagName.toLowerCase() + (cur.id ? `#${cur.id}` : ''));
          }
          out.push({ opacity: inline, tag: el.tagName.toLowerCase(), text: own.slice(0, 60), path: path.join('>') });
        }
        return out;
      });

      for (const f of found) offenders.push({ route, scrollY: y, ...f });
    }

    expect(
      offenders,
      offenders.length
        ? `Text left at a fractional inline opacity after the scrub settled — reveal by transform and snap visibility instead:\n` +
            offenders
              .slice(0, 25)
              .map((o) => `  scrollY=${o.scrollY} opacity=${o.opacity} <${o.tag}> "${o.text}" (${o.path})`)
              .join('\n')
        : '',
    ).toEqual([]);
  });
}
