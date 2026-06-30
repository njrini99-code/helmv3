import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const INVENTORY_PATH = join(process.cwd(), 'docs/operations/generated/route-inventory.json');
const REPORT_PATH = join(process.cwd(), 'docs/operations/generated/route-crawler-report.md');
const CRAWL_TMP_DIR = join(process.cwd(), 'docs/operations/generated/.route-crawl-tmp');

const DESTRUCTIVE_PATTERN = /\b(delete|archive|remove|send|invite|charge|submit final|publish)\b/i;

type RouteRow = {
  canonicalPath: string;
  authExpectation: string;
  dynamic: boolean;
  dynamicParams: string[];
  product: string;
};

type CrawlResult = {
  path: string;
  status: 'ok' | 'fail' | 'skip';
  issues: string[];
  httpStatus?: number;
};

function loadInventory(): RouteRow[] {
  const raw = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8'));
  return (raw.routes ?? []).filter((r: RouteRow & { fileType: string }) => r.fileType === 'page');
}

function writeCrawlResult(testId: string, result: CrawlResult): void {
  mkdirSync(CRAWL_TMP_DIR, { recursive: true });
  const safeId = testId.replace(/[^\w-]+/g, '_');
  writeFileSync(join(CRAWL_TMP_DIR, `${safeId}.json`), JSON.stringify(result));
}

function collectCrawlResults(): CrawlResult[] {
  if (!existsSync(CRAWL_TMP_DIR)) return [];
  return readdirSync(CRAWL_TMP_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(CRAWL_TMP_DIR, f), 'utf8')) as CrawlResult);
}

async function crawlPage(
  page: import('@playwright/test').Page,
  targetPath: string,
  options: { expectAuthRedirect?: boolean } = {},
): Promise<CrawlResult> {
  const issues: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (!url.includes('_next') && !url.includes('favicon')) {
      failedRequests.push(`${req.failure()?.errorText ?? 'failed'} ${url}`);
    }
  });

  const response = await page.goto(targetPath, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const httpStatus = response?.status() ?? 0;

  if (httpStatus >= 500) issues.push(`HTTP ${httpStatus}`);
  if (httpStatus === 404) issues.push('HTTP 404');

  const bodyText = await page.locator('body').innerText().catch(() => '');
  if (bodyText.trim().length < 20) issues.push('Blank or near-blank page');
  if (/something went wrong/i.test(bodyText)) issues.push('Error boundary text visible');

  const finalUrl = page.url();
  if (targetPath.startsWith('/golf') && /\/baseball\//.test(finalUrl)) {
    issues.push(`Wrong sport redirect: landed on ${finalUrl}`);
  }
  if (targetPath.startsWith('/baseball') && /\/golf\//.test(finalUrl) && !targetPath.includes('/golf')) {
    issues.push(`Wrong sport redirect: landed on ${finalUrl}`);
  }

  if (options.expectAuthRedirect) {
    if (!/\/login/.test(finalUrl)) {
      issues.push(`Expected auth redirect, got ${finalUrl}`);
    }
  } else {
    const landmark = page.locator('main, h1, [role="main"]').first();
    if (!(await landmark.isVisible().catch(() => false))) {
      issues.push('Missing main landmark or primary heading');
    }
  }

  const spinner = page.locator('[data-testid="loading"], .animate-spin').first();
  if (await spinner.isVisible().catch(() => false)) {
    await page.waitForTimeout(2000);
    if (await spinner.isVisible().catch(() => false)) {
      issues.push('Stuck loading spinner');
    }
  }

  if (consoleErrors.length > 0) {
    issues.push(`Console errors: ${consoleErrors.slice(0, 3).join(' | ')}`);
  }
  if (failedRequests.length > 0) {
    issues.push(`Failed requests: ${failedRequests.slice(0, 3).join(' | ')}`);
  }

  return {
    path: targetPath,
    status: issues.length === 0 ? 'ok' : 'fail',
    issues,
    httpStatus,
  };
}

test.describe('Route crawler — public routes', () => {
  for (const path of [
    '/',
    '/golf',
    '/golf/login',
    '/golf/signup',
    '/baseball',
    '/baseball/login',
    '/baseball/signup',
    '/privacy',
    '/terms',
  ]) {
    test(`crawl ${path}`, async ({ page }, testInfo) => {
      const result = await crawlPage(page, path);
      writeCrawlResult(testInfo.testId, result);
      expect(result.issues, result.issues.join('; ')).toEqual([]);
    });
  }
});

test.describe('Route crawler — protected redirects', () => {
  const protectedPaths = ['/golf/dashboard', '/golf/dashboard/stats', '/baseball/dashboard'];
  for (const path of protectedPaths) {
    test(`unauthenticated ${path} redirects safely`, async ({ page }, testInfo) => {
      const result = await crawlPage(page, path, { expectAuthRedirect: true });
      writeCrawlResult(testInfo.testId, result);
      expect(result.issues, result.issues.join('; ')).toEqual([]);
    });
  }
});

test.describe('Route crawler — inventory public pages', () => {
  const inventory = loadInventory();
  const publicPages = inventory
    .filter((r) => r.authExpectation === 'public' && !r.dynamic)
    .map((r) => r.canonicalPath)
    .filter((p) => !['/golf/login', '/golf/signup', '/baseball/login', '/baseball/signup', '/privacy', '/terms', '/'].includes(p) && !p.startsWith('/api'))
    .slice(0, 15);

  for (const path of publicPages) {
    test(`crawl inventory public ${path}`, async ({ page }, testInfo) => {
      const result = await crawlPage(page, path);
      writeCrawlResult(testInfo.testId, result);
      expect(result.issues, result.issues.join('; ')).toEqual([]);
    });
  }
});

const demoEmail = process.env.E2E_GOLF_EMAIL;
const demoPassword = process.env.E2E_GOLF_PASSWORD;
const authReady = Boolean(demoEmail && demoPassword && process.env.E2E_AUTH_SMOKE_ENABLED === 'true');

const authCrawl = authReady ? test : test.skip;
authCrawl('authenticated golf dashboard crawl', async ({ page }, testInfo) => {
  await page.goto('/golf/login');
  await page.locator('input[type="email"], input[name="email"]').fill(demoEmail ?? '');
  await page.locator('input[type="password"], input[name="password"]').fill(demoPassword ?? '');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/golf\/dashboard/, { timeout: 15_000 });

  const coachPaths = ['/golf/dashboard/stats', '/golf/dashboard/roster', '/golf/dashboard/messages'];
  for (const path of coachPaths) {
    const result = await crawlPage(page, path);
    writeCrawlResult(`${testInfo.testId}-${path.replace(/\//g, '_')}`, result);
    expect(result.issues, result.issues.join('; ')).toEqual([]);
  }

  if (await page.locator('[role="tablist"] button, [role="tab"]').count() > 0) {
    const tabs = page.locator('[role="tablist"] [role="tab"], [role="tab"]');
    const count = Math.min(await tabs.count(), 4);
    for (let i = 0; i < count; i++) {
      const tab = tabs.nth(i);
      const label = (await tab.innerText()).trim();
      if (DESTRUCTIVE_PATTERN.test(label)) continue;
      await tab.click();
      await page.waitForTimeout(500);
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.length).toBeGreaterThan(20);
    }
  }
});

test.afterAll(() => {
  const results = collectCrawlResults();
  mkdirSync(join(process.cwd(), 'docs/operations/generated'), { recursive: true });
  const fails = results.filter((r) => r.status === 'fail');
  const lines = [
    '# Route Crawler Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `- Pages crawled: ${results.length}`,
    `- Failures: ${fails.length}`,
    '',
  ];
  for (const row of results) {
    lines.push(`## ${row.path}`, '');
    lines.push(`- Status: ${row.status}`, `- HTTP: ${row.httpStatus ?? 'n/a'}`);
    if (row.issues.length) {
      for (const issue of row.issues) lines.push(`- Issue: ${issue}`);
    }
    lines.push('');
  }
  writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
  if (existsSync(CRAWL_TMP_DIR)) {
    rmSync(CRAWL_TMP_DIR, { recursive: true, force: true });
  }
});
