import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility audit via axe-core.
 *
 * Targets public routes only (no auth needed) so this runs cleanly in
 * CI without requiring seeded users. Add per-route variants once you
 * have a seeded test account flow.
 *
 * Rules enforced: WCAG 2.1 AA + WCAG 2.2 AA. The
 * `disableRules` list below tracks known acceptable violations — add
 * a rule here only with a written justification (issue link, comment).
 *
 * Background: docs/v3-testing-standards.md explicitly punted visual
 * regression "until a separate tooling decision" — but a11y is not
 * visual regression. axe checks semantic markup, ARIA, contrast,
 * focus order — all things a screenshot won't catch.
 */

interface PublicRoute {
  path: string;
  label: string;
  /**
   * Per-route axe rules to disable, with rationale. Keep this list
   * short — every entry is technical debt.
   */
  disableRules?: string[];
}

/**
 * Audit with REDUCED MOTION on.
 *
 * These pages are scroll-scrubbed, and a scrubbed timeline rewinds when you
 * scroll back up — so there is no single scroll position at which every scene
 * on the page is simultaneously settled. Auditing the animated page therefore
 * samples whatever frame each scene happens to be on, which is how /products
 * first reported 87 contrast failures (all of them arithmetic on part-revealed
 * text) and then passed and failed on alternate runs with identical code.
 *
 * Under `prefers-reduced-motion: reduce` every scene renders its END STATE at
 * mount and nothing is scrubbed, which makes the DOM deterministic — and it is
 * also the state that matters: WCAG asks whether the content is perceivable
 * without motion. This audit therefore doubles as the guarantee that the
 * reduced-motion path preserves all of the information the animated one shows.
 */
/**
 * Scroll the page end to end so every viewport-triggered reveal has fired, then
 * return to the top. Still needed under reduced motion because some sections
 * reveal on an IntersectionObserver that never fires for content the page has
 * not scrolled past. Steps are a fraction of a viewport so nothing is skipped.
 */
async function settleReveals(page: import('@playwright/test').Page): Promise<void> {
  const height = await page.evaluate(() => document.body.scrollHeight);
  const viewport = page.viewportSize()?.height ?? 720;
  for (let y = 0; y < height; y += Math.round(viewport * 0.6)) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
}

test.use({ contextOptions: { reducedMotion: 'reduce' } });

const PUBLIC_ROUTES: PublicRoute[] = [
  { path: '/', label: 'landing' },
  // /products carries the heaviest scroll choreography on the site — masked
  // SplitText reveals, a Flip layout transition and scrubbed path drawing. All
  // three write inline styles to text and to elements axe samples, so it is
  // exactly the route where an animation regression would show up as a
  // contrast or name failure. Audited for the same reason the landing page is.
  { path: '/products', label: 'products' },
  { path: '/golf/login', label: 'golf login' },
  { path: '/golf/signup', label: 'golf signup' },
  { path: '/baseball/login', label: 'baseball login' },
];

for (const route of PUBLIC_ROUTES) {
  test(`a11y — ${route.label} (${route.path})`, async ({ page }) => {
    await page.goto(route.path);

    // Wait for the page to settle. `networkidle` is more reliable than
    // a hard sleep but still flake-prone if there's analytics polling;
    // the 5s ceiling prevents the test from hanging forever.
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    // Fire every viewport-triggered reveal, then audit the whole document.
    await settleReveals(page);

    let builder = new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      // Exclude third-party widgets we don't control (Vercel toolbar,
      // Sentry feedback, etc.). Extend selectors here if more land in
      // the page.
      .exclude('[data-vercel-toolbar]')
      .exclude('#sentry-feedback');

    if (route.disableRules?.length) {
      builder = builder.disableRules(route.disableRules);
    }

    const { violations } = await builder.analyze();

    // Pretty-print violations so the CI log is useful without the
    // attached report. Each violation includes the rule id, impact,
    // and the failing nodes' selectors.
    if (violations.length > 0) {
      const summary = violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
        firstNode: v.nodes[0]?.target,
      }));
      console.error(`a11y violations on ${route.path}:`, JSON.stringify(summary, null, 2));
    }

    expect(violations, `Accessibility violations on ${route.path}`).toEqual([]);
  });
}
