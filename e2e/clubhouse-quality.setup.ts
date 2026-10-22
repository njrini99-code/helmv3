import { chromium, type FullConfig } from '@playwright/test';

/**
 * Global setup for playwright.clubhouse.config.ts: opens every route the presentation suite visits once, before the first test.
 *
 * `next dev` compiles a route on its first request and, by default, disposes one idle for 60 seconds. Each compile sends a hot
 * update to the pages still open, and on 2026-10-15 two CI runs failed when one reloaded the popup lab under a test's click
 * ("Clicking the checkbox did not change its state", only in the first project, right after a route compiled). With every route
 * compiled here and HELM_DEV_KEEP_ROUTES=1 on the server (next.config.mjs), nothing compiles while a test has a page open.
 *
 * The first route pays for compiling the app (101 s on two cores; on 2026-10-22 a CI runner needed over 180 s, which the
 * Playwright config's server readiness check used to wait for), so each visit gets 300 s.
 */
const ROUTES = ['/clubhouse-preview/popup-lab', '/clubhouse-preview/messages', '/clubhouse-preview/settings', '/clubhouse-preview/components', '/clubhouse-preview/components/gallery'];

export default async function warmClubhouseRoutes(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error('clubhouse-quality setup: no baseURL');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const route of ROUTES) {
      // A route's first render on a dev server can fail while it compiles (a 500 that a reload clears).
      let status = 0;
      for (let attempt = 0; attempt < 3 && status !== 200; attempt++) {
        status = (await page.goto(baseURL + route, { waitUntil: 'load', timeout: 300_000 }).catch(() => null))?.status() ?? 0;
      }
      if (status !== 200) throw new Error(`clubhouse-quality setup: ${route} answered ${status || 'nothing'}`);
    }
  } finally {
    await browser.close();
  }
}
