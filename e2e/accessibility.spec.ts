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

const PUBLIC_ROUTES: PublicRoute[] = [
  { path: '/', label: 'landing' },
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
