// TEMPORARY (remove before merge): where the Team stats chart's axis figures sit against their drawing, in CI's own browsers.
import { test, expect, type Page } from '@playwright/test';

const out = (tag: string, data: unknown) => process.stdout.write(`DIAG|${tag}|${JSON.stringify(data)}\n`);

async function prep(page: Page, url: string) {
  const response = await page.goto(url, { waitUntil: 'load' }).catch(() => page.goto(url, { waitUntil: 'load' }));
  expect(response?.status(), `${url} did not render`).toBe(200);
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; } *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }' });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-ui="clubhouse"]').first()).toBeVisible();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.locator('.ch-root[data-hydrated]').first().waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {});
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.waitForTimeout(500);
}

for (const theme of ['light', 'dark'] as const) {
  test(`stats-team axis figures ${theme}`, async ({ page }, info) => {
    await prep(page, '/clubhouse-preview/stats');
    await page.evaluate((t) => document.documentElement.setAttribute('data-fw-theme', t), theme);
    await page.waitForTimeout(250);
    const rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll('svg text.ch-shs-ax')).map((el) => {
        const t = el as SVGTextElement;
        const r = t.getBoundingClientRect();
        const o = t.ownerSVGElement!.getBoundingClientRect();
        const cs = getComputedStyle(t);
        const r1 = (n: number) => Math.round(n * 10) / 10;
        return {
          text: t.textContent,
          parent: t.parentElement?.tagName,
          x: t.getAttribute('x'),
          y: t.getAttribute('y'),
          anchor: t.getAttribute('text-anchor'),
          font: `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily.slice(0, 60)}`,
          svg: [r1(o.left), r1(o.top), r1(o.width), r1(o.height)],
          box: [r1(r.left), r1(r.top), r1(r.width), r1(r.height)],
          over: { left: r1(o.left - r.left), right: r1(r.right - o.right), top: r1(o.top - r.top), bottom: r1(r.bottom - o.bottom) },
          ascentAboveBaseline: r1(o.top + Number(t.getAttribute('y')) - r.top),
        };
      }),
    );
    out(`${info.project.name}|${theme}`, rows);
  });
}
