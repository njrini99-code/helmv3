import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { UI_CHECK_SCREENS } from './clubhouse-ui-check/screens';

/**
 * Clubhouse UI check (design lab GAP-Q1, dsx-09): every screen that is live in production, coach and player, at a phone
 * size (project ui-phone: WebKit, iPhone 17 Pro) and a desk size (ui-desktop: Chromium, 1440x900). Each screen must
 *
 *   1. render: the fixture answers 200, the Clubhouse frame is up and hydrated, and no new uncaught error reaches the page;
 *   2. hold its accessibility: a full axe pass on WCAG 2.2 A and AA. The rules (and uncaught errors) each screen and size
 *      breaks today are in e2e/clubhouse-ui-check/known-axe.json; a new rule fails, and so does a listed rule that now passes (remove it), so
 *      the list may only shrink;
 *   3. leave a full-page screenshot in the run's output, attached to the report, for a person to look at.
 *
 * Built to be able to block a merge: it runs in clubhouse-quality.yml's `ui-check` job, about 50 page loads. Making that
 * job a required check is the owner's GitHub setting; until then it is advisory.
 *
 * Fixtures, not production data: CI never signs in. Light theme; the presentation gate covers dark.
 * CH_UI_WRITE_KNOWN=1 rewrites each entry from this run (review the diff; never add a rule to pass).
 */
test.skip(process.env.CH_QUALITY !== '1', 'Use CH_QUALITY=1 with playwright.clubhouse.config.ts.');

const KNOWN_FILE = path.join(process.cwd(), 'e2e', 'clubhouse-ui-check', 'known-axe.json');
const WRITE = process.env.CH_UI_WRITE_KNOWN === '1';
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

type Known = Record<string, string[]>;
const readKnown = (): Known => (existsSync(KNOWN_FILE) ? JSON.parse(readFileSync(KNOWN_FILE, 'utf8')).screens ?? {} : {});

function writeKnown(key: string, rules: string[]): void {
  const screens = readKnown();
  if (rules.length) screens[key] = rules;
  else delete screens[key];
  const sorted = Object.fromEntries(Object.entries(screens).sort(([a], [b]) => a.localeCompare(b)));
  const body = {
    note: 'axe rules (WCAG 2.2 A/AA) each live Clubhouse screen breaks today, by screen and project (e2e/clubhouse-ui-check.spec.ts, dsx-09). May only shrink.',
    screens: sorted,
  };
  writeFileSync(KNOWN_FILE, JSON.stringify(body, null, 2) + '\n');
}

/** The presentation gate's settling, trimmed: no motion, fonts in, hydrated, entrances landed. */
async function settle(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      'nextjs-portal { display: none !important; } *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; caret-color: transparent !important; }',
  });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-ui="clubhouse"]').first()).toBeVisible();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.locator('.ch-root[data-hydrated]').first().waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {});
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      if (a.timeline === document.timeline && a.effect?.getComputedTiming().iterations !== Infinity) a.finish();
    }
  });
}

for (const screen of UI_CHECK_SCREENS) {
  test(`${screen.id} (${screen.route}) @ui-check`, async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message.split('\n')[0] ?? e.message));

    // WebKit can drop a dev server connection under load; that is the rig, not the page.
    const response = await page.goto(screen.path, { waitUntil: 'load' }).catch(() => page.goto(screen.path, { waitUntil: 'load' }));
    expect(response?.status(), `${screen.path} did not render`).toBe(200);
    await settle(page);

    // Saved under the run's output folder (uploaded by CI) and attached to the report.
    const file = testInfo.outputPath(`${screen.id}-${project}.png`);
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
    await testInfo.attach(`${screen.id}-${project}.png`, { path: file, contentType: 'image/png' });

    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    // An uncaught error is recorded as `pageerror: <its first words>`, beside the axe rule ids, under the same ratchet.
    const pageErrors = errors.map((e) => `pageerror: ${e.slice(0, 60)}`);
    const found = [...new Set([...axe.violations.map((v) => v.id), ...pageErrors])].sort();
    const key = `${screen.id}|${project}`;
    if (WRITE) {
      writeKnown(key, found);
      return;
    }
    const known = readKnown()[key] ?? [];
    const detail = [
      ...errors.filter((e) => !known.includes(`pageerror: ${e.slice(0, 60)}`)).map((e) => `uncaught: ${e}`),
      ...axe.violations
        .filter((v) => !known.includes(v.id))
        .map((v) => `${v.id} (${v.impact}): ${v.help}; ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`),
    ];
    expect(detail, `${key}: new uncaught errors or axe violations`).toEqual([]);
    const fixed = known.filter((r) => !found.includes(r));
    expect(fixed, `${key}: these pass now; remove them from e2e/clubhouse-ui-check/known-axe.json`).toEqual([]);
  });
}
