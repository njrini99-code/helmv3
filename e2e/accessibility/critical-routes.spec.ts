import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const routes = ['/', '/golf', '/baseball'];

for (const route of routes) {
  test(`critical route has no severe accessibility violations: ${route}`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const severe = results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''));
    expect(severe).toEqual([]);
  });
}
