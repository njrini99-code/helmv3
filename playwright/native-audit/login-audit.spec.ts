import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Page as AxePage } from 'playwright-core';

// axe-core declares its peer on `playwright-core` while Playwright Test owns the
// runtime page; npm may keep their patch releases in separate directories. Same
// boundary, same isolation, as e2e/accessibility.spec.ts.
function toAxePage(page: import('@playwright/test').Page): AxePage {
  return page as unknown as AxePage;
}


/**
 * axe's color-contrast rule samples rendered pixels. An element still inside
 * its entrance transition (opacity < 1, translated) is skipped as
 * "incomplete" rather than evaluated, so an un-settled page produces a
 * *quieter* report than a settled one — a false pass that gets quieter the
 * slower the machine. `document.fonts.ready` does not cover this: fonts and
 * CSS transitions finish independently.
 *
 * So: settle first, and record whether settling actually happened. A project
 * that never settles is itself evidence (a reduced-motion lane stuck at
 * opacity 0 would mean the entrance animation ignores the preference), which
 * is why the outcome is attached instead of silently swallowed.
 */
async function waitForEntranceSettled(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const target = document.querySelector('button[type="submit"]');
    if (!target) return { settled: false, reason: 'no submit button', samples: [] as unknown[] };

    const sample = () => {
      const chain: { tag: string; opacity: string; transform: string }[] = [];
      let node: Element | null = target;
      while (node && node !== document.documentElement) {
        const s = getComputedStyle(node);
        chain.push({
          tag: node.tagName.toLowerCase() + (node.id ? `#${node.id}` : ''),
          opacity: s.opacity,
          transform: s.transform,
        });
        node = node.parentElement;
      }
      return chain;
    };

    const isSettled = (chain: ReturnType<typeof sample>) =>
      chain.every(
        n =>
          Number(n.opacity) === 1 &&
          (n.transform === 'none' || n.transform === 'matrix(1, 0, 0, 1, 0, 0)'),
      );

    const deadline = Date.now() + 5000;
    let chain = sample();
    while (!isSettled(chain) && Date.now() < deadline) {
      await new Promise(r => requestAnimationFrame(() => r(null)));
      chain = sample();
    }
    return { settled: isSettled(chain), reason: '', samples: chain };
  });
}

test('GolfHelm signed-out login: visible controls and accessibility evidence', async ({ page }, testInfo) => {
  const response = await page.goto('/golf/login', { waitUntil: 'domcontentloaded' });
  expect(response, 'The document navigation must return a response.').not.toBeNull();
  expect(response!.status(), 'Do not audit an HTTP error document as the login form.').toBeLessThan(400);
  await expect(page).toHaveURL(/\/golf\/login(?:[/?#]|$)/);

  const form = page.getByRole('form', { name: 'Sign in to GolfHelm' });
  await expect(form).toBeVisible();
  await expect(form.locator('#golf-signin-email')).toBeVisible();
  await expect(form.locator('#golf-signin-password')).toBeVisible();
  await expect(form.locator('button[type="submit"]')).toBeEnabled();

  await page.evaluate(async () => { await document.fonts.ready; });
  const settle = await waitForEntranceSettled(page);
  await testInfo.attach('entrance-settle', {
    body: Buffer.from(JSON.stringify(settle, null, 2)),
    contentType: 'application/json',
  });

  await testInfo.attach('login-render', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  const results = await new AxeBuilder({ page: toAxePage(page) }).analyze();
  await testInfo.attach('axe-results', {
    body: Buffer.from(JSON.stringify(results, null, 2)),
    contentType: 'application/json',
  });

  // Asserted after the axe evidence is attached, so a page that never settles
  // still leaves a full report behind to read.
  expect(
    settle.settled,
    'The login form never finished its entrance transition; axe skips un-rendered elements, so the report below understates contrast findings.',
  ).toBe(true);

  const highImpact = results.violations.filter(
    issue => issue.impact === 'critical' || issue.impact === 'serious',
  );
  expect(highImpact, 'Review the attached full axe report; all severities remain recorded.').toEqual([]);
});
