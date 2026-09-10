// Supplementary pass for the surfaces the first sweep missed: the LOADED
// Find a time workspace (the schedule fetch takes >3.5s in dev), the person
// sheet from the drawer's People section, and the editor with a title typed
// and the keyboard up. Same devices and safe areas as capture.mjs.
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const WT = '/Users/ricknini/worktrees/helmv3/calendar-makeover';
dotenv.config({ path: path.join(WT, '.env.local') });
const BASE = 'http://localhost:3013';
const OUT = path.resolve(process.env.CAPTURE_OUT ?? './captures');

const DEVICES = {
  iphone15: { ...devices['iPhone 15'] },
  se: { ...devices['iPhone SE (3rd gen)'] },
  promax: { ...devices['iPhone 15 Pro Max'] },
  w320: { ...devices['iPhone SE (3rd gen)'], viewport: { width: 320, height: 694 } },
  landscape: { ...devices['iPhone 15 landscape'] },
};
const SAFE = { iphone15: { top: 59, bottom: 34 }, promax: { top: 59, bottom: 34 }, se: { top: 20, bottom: 0 }, w320: { top: 20, bottom: 0 }, landscape: { top: 0, bottom: 21, left: 59, right: 59 } };
const log = (...a) => console.log('[extra]', ...a);

async function login(browser, role) {
  const email = role === 'coach' ? process.env.GOLFHELM_COACH_EMAIL : process.env.GOLFHELM_PLAYER_EMAIL;
  const password = role === 'coach' ? process.env.GOLFHELM_COACH_PASSWORD : process.env.GOLFHELM_PLAYER_PASSWORD;
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto('/golf/login');
  await page.locator('#golf-signin-email').fill(email);
  await page.locator('#golf-signin-password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/golf/') && !u.pathname.endsWith('/login'), { timeout: 60_000 });
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

async function newPage(browser, state, deviceKey, opts = {}) {
  const dev = DEVICES[deviceKey];
  const ctx = await browser.newContext({ ...dev, baseURL: BASE, storageState: state, reducedMotion: 'reduce', ...opts });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0, ...SAFE[deviceKey] } }).catch(() => {});
  return { ctx, page };
}

async function snap(page, dir, name, fullPage = false) {
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage });
  try { fs.writeFileSync(path.join(dir, `${name}.aria.yml`), await page.locator('body').ariaSnapshot()); } catch {}
  log(name);
}

async function openCalendar(page) {
  await page.goto('/golf/dashboard/calendar');
  await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);
}

async function openFindATime(page) {
  await page.getByRole('button', { name: 'More calendar actions' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Find a time' }).first().click();
  await page.getByTestId('scheduling-timeline').waitFor({ timeout: 45_000 });
  await page.waitForTimeout(700);
}

const keyboard = (page, up) => page.evaluate((on) => {
  document.documentElement.style.setProperty('--keyboard-height', on ? '336px' : '0px');
  document.body.classList.toggle('keyboard-open', on);
}, up);

async function step(name, fn) { try { await fn(); } catch (e) { log(`FAILED ${name}: ${String(e.message || e).split('\n')[0]}`); } }

const browser = await chromium.launch();
try {
  const coach = await login(browser, 'coach');

  // Loaded workspace at every size, plus scroll states, keyboard, dark, large text, landscape.
  for (const d of ['iphone15', 'w320', 'se', 'promax', 'landscape']) {
    const dir = path.join(OUT, 'coach', d);
    const { ctx, page } = await newPage(browser, coach, d);
    await step(`find-a-time@${d}`, async () => {
      await openCalendar(page);
      await openFindATime(page);
      await snap(page, dir, '06-find-a-time-loaded');
      await snap(page, dir, '06-find-a-time-loaded-full', true);
      if (d === 'iphone15') {
        const tl = page.getByTestId('scheduling-timeline');
        await tl.evaluate((el) => { el.scrollLeft = 260; });
        await page.waitForTimeout(300);
        await snap(page, dir, '06b-find-a-time-scrolled');
        const body = page.getByTestId('scheduling-body');
        if (await body.count()) { await body.evaluate((el) => { el.scrollTop = 99999; }); await page.waitForTimeout(300); await snap(page, dir, '06c-find-a-time-bottom'); await body.evaluate((el) => { el.scrollTop = 0; }); }
        // A suggestion / next open time, if the board offers one.
        const next = page.getByRole('button', { name: /Next open time|Use this time/ }).first();
        if (await next.count()) { await next.click(); await page.waitForTimeout(600); await snap(page, dir, '06e-find-a-time-after-suggestion'); }
        const date = page.getByLabel('Date').first();
        if (await date.count()) { await keyboard(page, true); await date.focus(); await page.waitForTimeout(400); await snap(page, dir, '06d-find-a-time-keyboard'); await keyboard(page, false); }
        // Tap a person row → person sheet from inside the workspace.
        const person = page.getByRole('button', { name: /^Open .* schedule$/ }).first();
        if (await person.count()) { await person.click(); await page.waitForTimeout(900); await snap(page, dir, '06f-find-a-time-person'); await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
      }
    });
    await ctx.close();
  }
  for (const [key, opts, name] of [['dark', { colorScheme: 'dark' }, '20d-dark-find-a-time-loaded'], ['large', {}, '21d-largetext-find-a-time-loaded']]) {
    const dir = path.join(OUT, 'coach', 'variants');
    const { ctx, page } = await newPage(browser, coach, 'iphone15', opts);
    await step(name, async () => {
      await openCalendar(page);
      if (key === 'dark') await page.evaluate(() => { document.documentElement.classList.add('dark'); document.documentElement.setAttribute('data-theme', 'dark'); });
      if (key === 'large') await page.addStyleTag({ content: 'html{font-size:21px !important}' });
      await openFindATime(page);
      await snap(page, dir, name);
    });
    await ctx.close();
  }

  // Person sheet from the drawer, and the editor typing with the keyboard up.
  for (const role of ['coach', 'player']) {
    const state = role === 'coach' ? coach : await login(browser, 'player');
    const dir = path.join(OUT, role, 'iphone15');
    const { ctx, page } = await newPage(browser, state, 'iphone15');
    await step(`person@${role}`, async () => {
      await openCalendar(page);
      await page.getByRole('radiogroup', { name: 'Calendar view' }).getByRole('radio', { name: 'Agenda' }).click();
      await page.waitForTimeout(500);
      await page.locator('[aria-label*=" — "]').first().click();
      const dlg = page.getByRole('dialog').first();
      await dlg.waitFor({ timeout: 10_000 });
      // Wait for the People section to finish loading (skeletons gone).
      await page.waitForFunction(() => !document.querySelector('[role="dialog"] [data-slot="fw-skeleton"], [role="dialog"] .animate-pulse'), null, { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(600);
      await snap(page, dir, '10c-event-drawer-people-loaded');
      const people = dlg.locator('button, a').filter({ hasText: /./ });
      const names = await people.allInnerTexts();
      log('drawer controls:', JSON.stringify(names.slice(0, 20)));
      const person = dlg.getByRole('button', { name: /^Open .*|.* schedule$|.* profile$/ }).first();
      if (!(await person.count())) throw new Error('no person control');
      await person.click();
      await page.waitForTimeout(900);
      await snap(page, dir, '12-person-sheet');
      await snap(page, dir, '12-person-sheet-full', true);
    });
    if (role === 'coach') {
      await step('editor-typing', async () => {
        await openCalendar(page);
        await page.getByRole('button', { name: 'New event' }).first().click();
        await page.waitForTimeout(900);
        const title = page.getByPlaceholder(/Event name/i).first();
        await title.fill('Short game session');
        await keyboard(page, true);
        await title.focus();
        await page.waitForTimeout(400);
        await snap(page, dir, '11b-editor-typing-keyboard');
        await keyboard(page, false);
        await page.getByRole('button', { name: /^Continue/ }).first().click();
        await page.waitForTimeout(700);
        await snap(page, dir, '11c-editor-stage-2-with-title');
        // Try to close with unsaved changes → discard prompt.
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        await snap(page, dir, '11e-editor-close-with-changes');
      });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  log('done');
}
