import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility audit for the admin CRM via axe-core.
 *
 * Mirrors e2e/accessibility.spec.ts. The CRM lives behind an admin auth gate
 * (src/app/golf/admin/crm/layout.tsx), so unauthenticated this navigation will
 * redirect to the login page. We don't have a seeded admin fixture in CI, so
 * this test is deliberately resilient to that redirect: it audits WHATEVER
 * renders (the CRM shell if somehow authed, or the login page after the
 * redirect) and asserts there are no CRITICAL axe violations on it.
 *
 * Why "critical only" rather than the full WCAG sweep used for the public
 * routes: until a seeded admin flow exists we can't guarantee which surface we
 * landed on, so we hold the resilient path to the highest-impact bar (broken
 * names/roles/keyboard traps) and leave the exhaustive AA sweep to the public
 * spec. Tighten to `.toEqual([])` once an admin fixture lands.
 */

const CRM_PATH = '/golf/admin/crm';

test(`a11y — admin CRM (${CRM_PATH}, resilient to auth redirect)`, async ({ page }) => {
  await page.goto(CRM_PATH);

  // The admin layout may redirect to login. Either way, wait for the resulting
  // page to settle. `networkidle` is more reliable than a hard sleep but still
  // flake-prone with polling; the 5s ceiling prevents an indefinite hang.
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    // Exclude third-party widgets we don't control.
    .exclude('[data-vercel-toolbar]')
    .exclude('#sentry-feedback')
    .analyze();

  // Whatever rendered (CRM shell or the login redirect), hold it to the
  // highest-impact bar. Only critical violations fail the build here.
  const critical = violations.filter((v) => v.impact === 'critical');

  if (critical.length > 0) {
    const summary = critical.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
      firstNode: v.nodes[0]?.target,
    }));
    // eslint-disable-next-line no-console
    console.error(
      `Critical a11y violations on ${page.url()}:`,
      JSON.stringify(summary, null, 2),
    );
  }

  expect(
    critical,
    `Critical accessibility violations on ${page.url()}`,
  ).toEqual([]);
});
