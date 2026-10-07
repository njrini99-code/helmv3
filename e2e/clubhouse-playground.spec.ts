import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

test.skip(process.env.CH_QUALITY !== '1', 'Use the dedicated development presentation config.');
test('playground isolates proposals, restores originals and exports actual CSS', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/clubhouse-preview/components');
  const original = page.frameLocator('iframe[title="Original Clubhouse components"]');
  const candidate = page.frameLocator('iframe[title="Candidate Clubhouse components"]');
  await expect(candidate.locator('.ch-gallery')).toBeVisible();
  await expect(original.locator('.ch-gallery')).toBeVisible();
  // Audit each document separately: axe merges identical landmark names across
  // sibling frames even though assistive navigation treats them as documents.
  const accessibility = await new AxeBuilder({ page }).include('.ch-playground').exclude('iframe').analyze();
  expect(accessibility.violations).toEqual([]);
  const galleryPage = await page.context().newPage();
  await galleryPage.goto('/clubhouse-preview/components/gallery');
  await expect(galleryPage.locator('.ch-gallery')).toBeVisible();
  const galleryAccessibility = await new AxeBuilder({ page: galleryPage }).include('.ch-gallery').analyze();
  expect(galleryAccessibility.violations).toEqual([]);
  await galleryPage.close();
  const rootToken = (frame: typeof candidate) => frame.locator('.ch-root').evaluate(element => getComputedStyle(element).getPropertyValue('--ch-radius-md').trim());
  const before = await rootToken(original);
  await page.getByRole('slider', { name: /Corner radius/ }).focus();
  await page.keyboard.press('End');
  await expect.poll(() => rootToken(candidate)).toBe('20px');
  expect(await rootToken(original)).toBe(before);
  await page.getByRole('slider', { name: 'Motion sample duration', exact: true }).press('End');
  if (info.project.use.reducedMotion === 'reduce') {
    // Shared base CSS retains a 1ms duration for lifecycle events. The sample
    // opts out entirely through transition-property, regardless of duration.
    await expect.poll(() => candidate.locator('.ch-gallery__motion').evaluate(element => getComputedStyle(element).transitionProperty)).toBe('none');
  } else {
    await expect.poll(() => candidate.locator('.ch-gallery__motion').evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0.52s');
  }
  await page.getByLabel('Long text', { exact: true }).check();
  await expect(candidate.getByRole('heading', { name: /PinehurstChampionship/ })).toBeVisible();
  await expect(original.getByRole('heading', { name: /PinehurstChampionship/ })).toBeVisible();
  await candidate.getByRole('button', { name: 'Open dialog or sheet' }).click();
  await expect(candidate.getByRole('dialog')).toBeVisible();
  await candidate.getByRole('dialog').getByRole('button', { name: 'Actions', exact: true }).click();
  await expect(candidate.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(candidate.getByRole('menu')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(candidate.getByRole('dialog')).toHaveCount(0);
  await expect(original.getByRole('dialog')).toHaveCount(0);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSS' }).click();
  const download = await downloading;
  const file = info.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  const css = await readFile(file, 'utf8');
  expect(css).toContain('--ch-radius-md: 20px');
  expect(css).toContain('border-radius: var(--ch-radius-lg)');
  await page.getByRole('button', { name: 'Reset tuning' }).click();
  await expect.poll(() => rootToken(candidate)).toBe(before);
  await page.getByRole('combobox', { name: 'Viewport width', exact: true }).selectOption('1280');
  await expect(page.getByTitle('Candidate Clubhouse components')).toHaveAttribute('width', '1280');
  await page.screenshot({ path: info.outputPath('playground-desktop.png'), animations: 'disabled', timeout: 15_000 });
  await page.reload();
  await expect(candidate.locator('.ch-gallery')).toBeVisible();
  await page.screenshot({ path: info.outputPath('playground-phone.png'), fullPage: true, animations: 'disabled', timeout: 15_000 });
});
