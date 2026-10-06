import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Opt-in prevents the ordinary authenticated suite from accidentally running dev fixtures.
const enabled = process.env.CH_QUALITY === '1';
test.skip(!enabled, 'Use CH_QUALITY=1 with playwright.clubhouse.config.ts (development fixtures).');
const full = process.env.CH_FULL === '1';
const sizes = full ? [
  { width: 390, height: 480 }, { width: 430, height: 932 },
  { width: 768, height: 600 }, { width: 1280, height: 800 },
] : [{ width: 390, height: 480 }];
const phoneKinds = full ? ['Modal', 'FormSheet', 'ListSheet', 'PickerSheet', 'ActionSheet', 'RecFormSheet', 'RecPickSheet', 'RecActionSheet'] : ['Modal', 'FormSheet', 'RecPickSheet'];

async function fixture(page: Page) {
  const response = await page.goto('/clubhouse-preview/popup-lab');
  expect(response?.status(), 'Development popup fixture unavailable; production intentionally returns 404').toBe(200);
  await expect(page.locator('.ch-popup-lab')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(() => document.fonts.ready);
  // Next's development indicator is diagnostic chrome, outside the Clubhouse fixture.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
}

async function bounded(surface: Locator, page: Page) {
  await expect(surface).toBeVisible();
  // Wait for real entrance motion to settle before measuring. Screenshot animation disabling
  // happens only below; normal-motion behavioral assertions still exercise entrance/exit.
  await expect.poll(async () => surface.evaluate((element) => {
    const r = element.getBoundingClientRect();
    return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
}

async function capture(page: Page, info: TestInfo, name: string) {
  const screenshot = await page.screenshot({ animations: 'disabled' });
  await info.attach(name, { body: screenshot, contentType: 'image/png' });
  // Candidate capture is a local review step, never approval or CI baseline updating.
  if (process.env.CH_CAPTURE_DIR) {
    const folder = path.resolve(process.env.CH_CAPTURE_DIR, info.project.name);
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, `${name}.png`), screenshot);
    await writeFile(path.join(folder, `${name}.json`), JSON.stringify({
      project: info.project.name, viewport: page.viewportSize(),
      browserVersion: page.context().browser()?.version(), platform: process.platform,
      capturedAt: new Date().toISOString(), reviewStatus: 'unreviewed candidate',
    }, null, 2));
  }
  if (process.env.CH_VISUAL === '1') {
    const filename = `${name}.png`;
    expect(existsSync(info.snapshotPath(filename)), `Missing reviewed baseline: ${info.snapshotPath(filename)}. Capture artifacts, review them, and supply CH_VISUAL_BASELINES; CI never creates baselines.`).toBe(true);
    await expect(page).toHaveScreenshot(filename);
  }
}

for (const size of sizes) {
  // Settings/Recruiting phone sheets have styles and route owners only at
  // <=820px. Desktop production uses Modal (see POPUP_AUDIT and ProspectForm).
  // Exercise every phone primitive at supported sizes and Modal/menus on desktop.
  const kinds = size.width <= 820 ? phoneKinds : ['Modal'];
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size });
    for (const kind of kinds) {
      test(`${kind} long content stays usable @smoke`, async ({ page }, info) => {
        await fixture(page);
        await page.getByLabel('Long content', { exact: true }).check();
        const opener = page.getByRole('button', { name: kind, exact: true });
        // Safari pointer activation does not focus a button; exercise the keyboard
        // opener explicitly so focus restoration checks the real keyboard contract.
        await opener.focus();
        await page.keyboard.press('Enter');
        const dialog = page.locator('dialog[open]');
        await expect(dialog).toHaveCount(1);
        const surface = kind === 'ActionSheet' ? dialog : dialog.locator('.ch-modal__panel, .ch-setm-sheet, .ch-rec-sheet, .ch-rec-act').first();
        await bounded(surface, page);
        // Native modal inertness prevents focusing the page beneath it.
        expect(await opener.evaluate((element) => {
          element.focus();
          return document.activeElement !== element;
        })).toBe(true);
        for (let i = 0; i < 4; i++) {
          await page.keyboard.press('Tab');
          expect(await dialog.evaluate((element) => {
            // Both engines permit Tab into browser chrome. At that boundary
            // activeElement is body and the document is blurred; no page
            // control may receive focus beneath the still-modal dialog.
            return element.matches(':modal') && (
              element.contains(document.activeElement) ||
              (document.activeElement === document.body && !document.hasFocus())
            );
          })).toBe(true);
        }
        const lastField = dialog.getByRole('textbox', { name: 'Field 24', exact: true });
        if (await lastField.count()) {
          await lastField.focus();
          await bounded(lastField, page);
          await lastField.fill('Edited locally');
          await expect(lastField).toHaveValue('Edited locally');
          await dialog.evaluate((element) => {
            for (const child of element.querySelectorAll('*')) {
              if (child.scrollHeight > child.clientHeight) child.scrollTop = 0;
            }
          });
        } else if (kind === 'PickerSheet') {
          await dialog.getByRole('radio').last().scrollIntoViewIfNeeded();
          await bounded(dialog.getByRole('radio').last(), page);
        }
        await capture(page, info, `${kind}-${size.width}x${size.height}`);
        const axe = await new AxeBuilder({ page }).include('dialog[open]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        expect(axe.violations).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(opener).toBeFocused();
      });
    }
    test('nested menu keyboard, containment and focus return @smoke', async ({ page }, info) => {
      await fixture(page);
      await page.getByLabel('Long content', { exact: true }).check();
      await page.getByRole('button', { name: 'Modal', exact: true }).click();
      const dialog = page.locator('dialog[open]');
      const actions = dialog.getByRole('button', { name: 'Actions', exact: true });
      await actions.click();
      const menu = page.getByRole('menu', { name: 'Nested actions' });
      await bounded(menu, page);
      await expect(menu.getByRole('menuitem').first()).toBeFocused();
      await page.keyboard.press('End');
      await expect(menu.getByRole('menuitem').last()).toBeFocused();
      await bounded(menu.getByRole('menuitem').last(), page);
      await page.keyboard.press('Home');
      await expect(menu.getByRole('menuitem').first()).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
      await capture(page, info, `nested-menu-${size.width}x${size.height}`);
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(actions).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    });
    test('tall page menu stays within short viewport @smoke', async ({ page }, info) => {
      await fixture(page);
      await page.getByRole('button', { name: 'Tall menu' }).click();
      const menu = page.getByRole('menu', { name: 'Page actions' });
      await bounded(menu, page);
      await page.keyboard.press('End');
      await expect(menu.getByRole('menuitem').last()).toBeFocused();
      await bounded(menu.getByRole('menuitem').last(), page);
      await capture(page, info, `tall-menu-${size.width}x${size.height}`);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Tall menu' })).toBeFocused();
    });
  });
}
