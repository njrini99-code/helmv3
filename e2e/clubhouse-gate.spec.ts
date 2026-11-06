import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { GATE_SCREENS } from './clubhouse-gate/screens';
import { KNOWN } from './clubhouse-gate/known';
import { scanPage, type GateCheck, type GateFinding } from './clubhouse-gate/scan';

// Opt-in, as in clubhouse-quality.spec.ts: these are development fixtures.
test.skip(process.env.CH_QUALITY !== '1', 'Use CH_QUALITY=1 with playwright.clubhouse.config.ts.');

type Check = GateCheck | 'contrast';
const CHECKS: Check[] = ['card-escape', 'text-clip', 'cramped-text', 'nested-surface', 'phone-text', 'tap-target', 'row-inset', 'page-edge', 'contrast'];
const PHONE_ONLY = new Set<Check>(['phone-text', 'tap-target', 'page-edge', 'cramped-text']);
const THEMES = ['light', 'dark'] as const;

// One page load per screen, width and theme; every check reads the same scan. A worker restart only costs a rescan.
const scans = new Map<string, GateFinding[]>();

async function scan(page: Page, url: string, tap: string | undefined, theme: string, phone: boolean, key: string): Promise<GateFinding[]> {
  const cached = scans.get(key);
  if (cached) return cached;
  // The real fixtures must answer; a 500 or a redirect must not read as "no findings".
  // WebKit can drop a dev server connection under load ("The network connection was lost"); that's the rig, not the page.
  const response = await page.goto(url, { waitUntil: 'load' }).catch(() => page.goto(url, { waitUntil: 'load' }));
  expect(response?.status(), `${url} did not render`).toBe(200);
  if (tap && phone) await page.locator(tap).first().click();
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; } *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }' });
  await page.evaluate((t) => { document.documentElement.setAttribute('data-fw-theme', t); }, theme);
  await page.evaluate(() => document.fonts.ready);
  // Not every lane's screen has a <main> yet (PP-3), so wait for the app rather than for a landmark.
  await expect(page.locator('[data-ui="clubhouse"]').first()).toBeVisible();
  await page.waitForTimeout(250);
  // Land every entrance now (TEAM-33's fly-in holds marks at opacity 0 for 2 seconds); loops have no end and are left running.
  await page.evaluate(() => { for (const a of document.getAnimations()) { if (a.effect?.getComputedTiming().iterations !== Infinity) a.finish(); } });
  const findings = await page.evaluate(scanPage, { phone });
  const axe = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  for (const violation of axe.violations) {
    for (const node of violation.nodes) findings.push({ check: 'contrast' as GateCheck, at: node.target.join(' '), detail: (node.any[0]?.message ?? '').slice(0, 140) });
  }
  scans.set(key, findings);
  if (process.env.CH_GATE_REPORT) {
    await mkdir(path.dirname(process.env.CH_GATE_REPORT), { recursive: true });
    await appendFile(process.env.CH_GATE_REPORT, `${JSON.stringify({ key, findings })}\n`);
  }
  return findings;
}

// CH_GATE_DISCOVER=1: one scan per screen, nothing asserted, every finding in the report (scripts/clubhouse/gate-known.mjs reads it).
const discover = process.env.CH_GATE_DISCOVER === '1';
for (const screen of GATE_SCREENS) {
  for (const theme of THEMES) {
    if (discover) {
      test(`${screen.lane} ${screen.id} ${theme} discover`, async ({ page }) => {
        const phone = page.viewportSize()!.width <= 820;
        test.skip(phone ? !screen.phone : !screen.desktop, 'Not on this size');
        await scan(page, screen.path, screen.tap, theme, phone, `${screen.id}|${page.viewportSize()!.width}|${theme}`);
      });
      continue;
    }
    for (const check of CHECKS) {
      test(`${screen.lane} ${screen.id} ${theme} ${check} @gate`, async ({ page }) => {
        const width = page.viewportSize()!.width;
        const phone = width <= 820;
        test.skip(phone ? !screen.phone : !screen.desktop || PHONE_ONLY.has(check), 'Not on this size');
        const known = KNOWN[`${screen.id}|${width}|${theme}|${check}`];
        test.fail(!!known, known);
        const findings = await scan(page, screen.path, screen.tap, theme, phone, `${screen.id}|${width}|${theme}`);
        expect(findings.filter((f) => (f.check as Check) === check).map((f) => `${f.at}: ${f.detail}`)).toEqual([]);
      });
    }
  }
}
