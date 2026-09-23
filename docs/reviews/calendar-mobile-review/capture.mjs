// Mobile capture of the golf calendar for the UX review.
// Drives the dev server on :3013 (calendar-makeover worktree) as coach and
// player on emulated iPhones, and writes PNGs + an ARIA snapshot + a
// deterministic measurement pass (touch targets, overflow, console errors)
// per surface into ./captures. Read-only against the app: it never creates
// or edits events.
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const WT = '/Users/ricknini/worktrees/helmv3/calendar-makeover';
dotenv.config({ path: path.join(WT, '.env.local') });

const BASE = process.env.CAPTURE_BASE ?? 'http://localhost:3013';
const OUT = path.resolve(process.env.CAPTURE_OUT ?? './captures');
fs.mkdirSync(OUT, { recursive: true });

const ROLES = {
  coach: { email: process.env.GOLFHELM_COACH_EMAIL, password: process.env.GOLFHELM_COACH_PASSWORD },
  player: { email: process.env.GOLFHELM_PLAYER_EMAIL, password: process.env.GOLFHELM_PLAYER_PASSWORD },
};

// iPhone 15 is the reference device; SE and Pro Max are the extremes, 320 is
// the smallest width the design system promises.
const DEVICES = {
  'iphone15': { ...devices['iPhone 15'] },
  'se': { ...devices['iPhone SE (3rd gen)'] },
  'promax': { ...devices['iPhone 15 Pro Max'] },
  'w320': { ...devices['iPhone SE (3rd gen)'], viewport: { width: 320, height: 694 } },
  'landscape': { ...devices['iPhone 15 landscape'] },
};
const SAFE = { iphone15: { top: 59, bottom: 34 }, promax: { top: 59, bottom: 34 }, se: { top: 20, bottom: 0 }, w320: { top: 20, bottom: 0 }, landscape: { top: 0, bottom: 21, left: 59, right: 59 } };

const manifest = [];
const log = (...a) => console.log('[capture]', ...a);

async function login(browser, role) {
  const { email, password } = ROLES[role];
  if (!email || !password) throw new Error(`no credentials for ${role}`);
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

// Deterministic audit of what is on screen right now.
async function measure(page, viewport) {
  return page.evaluate((vw) => {
    const sel = 'a[href],button,[role="button"],[role="radio"],[role="tab"],[role="menuitem"],[role="option"],[role="slider"],[role="checkbox"],[role="switch"],input,select,textarea,[tabindex]:not([tabindex="-1"])';
    const small = [];
    const offscreen = [];
    const nodes = Array.from(document.querySelectorAll(sel));
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const inView = r.bottom > 0 && r.top < window.innerHeight;
      if (!inView) continue;
      const name = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      const role = el.getAttribute('role') || el.tagName.toLowerCase();
      if (r.width < 44 || r.height < 44) small.push({ name, role, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) });
      if (r.left < -1 || r.right > vw + 1) offscreen.push({ name, role, left: Math.round(r.left), right: Math.round(r.right) });
    }
    const docOverflow = document.documentElement.scrollWidth > vw;
    // Text that overflows its own box (clipped or ellipsised) in the viewport.
    const clipped = [];
    for (const el of Array.from(document.querySelectorAll('h1,h2,h3,p,span,button,a,label,time'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) continue;
      if (el.children.length > 0) continue;
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') {
        clipped.push({ text: (el.textContent || '').trim().slice(0, 50), sw: el.scrollWidth, cw: el.clientWidth });
      }
    }
    const fonts = new Set();
    for (const el of Array.from(document.querySelectorAll('h1,h2,h3,p,span,button,a,label'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) continue;
      const cs = getComputedStyle(el);
      fonts.add(`${cs.fontFamily.split(',')[0].replace(/"/g, '')} ${cs.fontSize} ${cs.fontWeight}`);
    }
    return { small, offscreen, docOverflow, docScrollWidth: document.documentElement.scrollWidth, clipped: clipped.slice(0, 20), fontsInView: Array.from(fonts).sort() };
  }, viewport.width);
}

async function snap(page, dir, name, { fullPage = false, viewport } = {}) {
  const file = path.join(dir, `${name}.png`);
  await page.waitForTimeout(350);
  await page.screenshot({ path: file, fullPage });
  let aria = '';
  try { aria = await page.locator('body').ariaSnapshot(); } catch { /* older playwright */ }
  fs.writeFileSync(path.join(dir, `${name}.aria.yml`), aria);
  const m = await measure(page, viewport);
  fs.writeFileSync(path.join(dir, `${name}.measure.json`), JSON.stringify(m, null, 2));
  manifest.push({ file: path.relative(OUT, file), name, small: m.small.length, offscreen: m.offscreen.length, docOverflow: m.docOverflow, clipped: m.clipped.length });
  log(name, `small=${m.small.length} offscreen=${m.offscreen.length} overflow=${m.docOverflow} clipped=${m.clipped.length}`);
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(900);
}

async function openCalendar(page) {
  await page.goto('/golf/dashboard/calendar');
  await settle(page);
}

async function closeOverlay(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
}

async function step(dir, name, fn) {
  try { await fn(); } catch (e) { log(`FAILED ${name}: ${String(e.message || e).split('\n')[0]}`); manifest.push({ name, failed: String(e.message || e).split('\n')[0] }); }
}

async function newPage(browser, state, deviceKey, { colorScheme = 'light', reducedMotion = 'reduce' } = {}) {
  const dev = DEVICES[deviceKey];
  const ctx = await browser.newContext({ ...dev, baseURL: BASE, storageState: state, colorScheme, reducedMotion });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0, ...SAFE[deviceKey] } }).catch(() => {});
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
  return { ctx, page, errors, viewport: dev.viewport };
}

async function sweep(browser, role, state, deviceKey, full) {
  const dir = path.join(OUT, role, deviceKey);
  fs.mkdirSync(dir, { recursive: true });
  const { ctx, page, errors, viewport } = await newPage(browser, state, deviceKey);
  const S = (name, opts = {}) => snap(page, dir, name, { viewport, ...opts });
  const isCoach = role === 'coach';

  await step(dir, 'home', async () => { await openCalendar(page); await S('01-home'); await S('01-home-full', { fullPage: true }); });

  for (const view of ['Day', 'Week', 'Month', 'Agenda']) {
    await step(dir, view, async () => {
      await page.getByRole('radiogroup', { name: 'Calendar view' }).getByRole('radio', { name: view }).click();
      await page.waitForTimeout(600);
      await S(`02-view-${view.toLowerCase()}`);
      if (full) await S(`02-view-${view.toLowerCase()}-full`, { fullPage: true });
    });
  }
  if (!full) { await ctx.close(); return errors; }

  // Week strip: step to next week and back, on Day view.
  await step(dir, 'day-next', async () => {
    await page.getByRole('radiogroup', { name: 'Calendar view' }).getByRole('radio', { name: 'Day' }).click();
    await page.waitForTimeout(400);
    // The phone masthead has no arrows (swipe / keyboard / date-jump step the
    // period); ArrowRight is the calendar's own keyboard step.
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    await S('03-day-next-week');
    await page.keyboard.press('ArrowLeft');
  });

  // Date jump from the title.
  await step(dir, 'date-jump', async () => {
    await page.getByRole('radiogroup', { name: 'Calendar view' }).getByRole('radio', { name: 'Agenda' }).click();
    await page.waitForTimeout(400);
    await page.getByRole('heading', { level: 1 }).first().click();
    await page.waitForTimeout(600);
    await S('04-date-jump');
    await closeOverlay(page);
  });

  // More menu and each destination.
  await step(dir, 'more', async () => {
    await page.getByRole('button', { name: 'More calendar actions' }).click();
    await page.waitForTimeout(500);
    await S('05-more-menu');
    await closeOverlay(page);
  });
  const dests = [
    ...(isCoach ? [['Find a time', '06-find-a-time']] : []),
    [/^Conflicts/, '07-conflicts'],
    ['My availability', '08-my-availability'],
    ['Add to phone', '09-add-to-phone'],
  ];
  for (const [label, name] of dests) {
    await step(dir, name, async () => {
      await page.getByRole('button', { name: 'More calendar actions' }).click();
      await page.waitForTimeout(400);
      const item = page.getByRole('menuitem', { name: label }).or(page.getByRole('button', { name: label })).first();
      await item.click();
      if (name === '06-find-a-time') await page.getByTestId('scheduling-timeline').waitFor({ timeout: 45_000 }).catch(() => {});
      await page.waitForTimeout(name === '06-find-a-time' ? 800 : 1500);
      await S(name);
      await S(`${name}-full`, { fullPage: true });
      if (name === '06-find-a-time') {
        // Scroll the timeline sideways and the body down, then the keyboard.
        const tl = page.getByTestId('scheduling-timeline');
        if (await tl.count()) { await tl.evaluate((el) => { el.scrollLeft = 240; }); await page.waitForTimeout(300); await S('06b-find-a-time-scrolled'); }
        const body = page.getByTestId('scheduling-body');
        if (await body.count()) { await body.evaluate((el) => { el.scrollTop = 99999; }); await page.waitForTimeout(300); await S('06c-find-a-time-bottom'); await body.evaluate((el) => { el.scrollTop = 0; }); }
        // Keyboard up: the Capacitor provider sets --keyboard-height; emulate it.
        const date = page.getByLabel('Date');
        if (await date.count()) {
          await page.evaluate(() => { document.documentElement.style.setProperty('--keyboard-height', '336px'); document.body.classList.add('keyboard-open'); });
          await date.focus();
          await page.waitForTimeout(400);
          await S('06d-find-a-time-keyboard');
          await page.evaluate(() => { document.documentElement.style.setProperty('--keyboard-height', '0px'); document.body.classList.remove('keyboard-open'); });
        }
      }
      await closeOverlay(page);
      await closeOverlay(page);
      if (!(await page.getByRole('radiogroup', { name: 'Calendar view' }).count())) await openCalendar(page);
    });
  }

  // Event detail drawer from the first card in Agenda; then Day.
  await step(dir, 'drawer', async () => {
    await openCalendar(page);
    await page.getByRole('radiogroup', { name: 'Calendar view' }).getByRole('radio', { name: 'Agenda' }).click();
    await page.waitForTimeout(500);
    const card = page.locator('[aria-label*=" — "]').first();
    if (!(await card.count())) throw new Error('no event card in agenda');
    await card.click();
    await page.waitForTimeout(900);
    await S('10-event-drawer');
    await S('10-event-drawer-full', { fullPage: true });
    // Scroll the drawer body if it scrolls.
    const dlg = page.getByRole('dialog').first();
    if (await dlg.count()) {
      await dlg.evaluate((el) => { const s = el.querySelector('[class*="overflow-y-auto"], [class*="overflow-auto"]'); if (s) s.scrollTop = 99999; });
      await page.waitForTimeout(300);
      await S('10b-event-drawer-scrolled');
    }
    await closeOverlay(page);
  });

  // Editor (coach) / Respond (player).
  await step(dir, 'editor', async () => {
    await openCalendar(page);
    // Coach on a phone: the floating "+" (the masthead's labelled button is md+).
    const cta = isCoach
      ? page.getByTestId('calendar-fab')
      : page.getByRole('button', { name: 'Respond' }).or(page.getByRole('link', { name: 'Respond' })).first();
    if (!(await cta.count())) throw new Error('no primary action visible');
    await cta.click();
    await page.waitForTimeout(900);
    await S('11-editor-stage-1');
    await S('11-editor-stage-1-full', { fullPage: true });
    if (isCoach) {
      const title = page.getByLabel(/^Title/).or(page.getByPlaceholder(/title|What/i)).first();
      if (await title.count()) {
        await title.fill('Short game session');
        await page.evaluate(() => { document.documentElement.style.setProperty('--keyboard-height', '336px'); document.body.classList.add('keyboard-open'); });
        await S('11b-editor-typing-keyboard');
        await page.evaluate(() => { document.documentElement.style.setProperty('--keyboard-height', '0px'); document.body.classList.remove('keyboard-open'); });
      }
      const next = page.getByRole('button', { name: /^(Next|Continue|People|Time)/ }).first();
      if (await next.count()) { await next.click(); await page.waitForTimeout(600); await S('11c-editor-stage-2'); await S('11c-editor-stage-2-full', { fullPage: true }); }
      const next2 = page.getByRole('button', { name: /^(Next|Continue|Review)/ }).first();
      if (await next2.count()) { await next2.click(); await page.waitForTimeout(600); await S('11d-editor-stage-3'); await S('11d-editor-stage-3-full', { fullPage: true }); }
    }
    await closeOverlay(page);
    await closeOverlay(page);
    // A discard prompt may appear; capture it if so.
    const discard = page.getByRole('alertdialog').or(page.getByRole('dialog').filter({ hasText: /discard|unsaved/i })).first();
    if (await discard.count()) { await S('11e-editor-discard-prompt'); await page.getByRole('button', { name: /discard|leave/i }).first().click().catch(() => {}); }
  });

  // Person sheet from the drawer's people, if present.
  await step(dir, 'person', async () => {
    await openCalendar(page);
    await page.getByRole('radiogroup', { name: 'Calendar view' }).getByRole('radio', { name: 'Agenda' }).click();
    await page.waitForTimeout(500);
    const card = page.locator('[aria-label*=" — "]').first();
    if (!(await card.count())) throw new Error('no event card');
    await card.click();
    await page.waitForTimeout(800);
    const person = page.getByRole('dialog').getByRole('button', { name: /schedule|Open .* profile|^Open /i }).first();
    if (!(await person.count())) throw new Error('no person control in drawer');
    await person.click();
    await page.waitForTimeout(800);
    await S('12-person-sheet');
    await closeOverlay(page);
    await closeOverlay(page);
  });

  fs.writeFileSync(path.join(dir, 'console.txt'), errors.join('\n'));
  await ctx.close();
  return errors;
}

async function variants(browser, role, state) {
  const dir = path.join(OUT, role, 'variants');
  fs.mkdirSync(dir, { recursive: true });
  // Dark theme: the token file accepts .dark on <html> and [data-theme="dark"].
  {
    const { ctx, page, viewport } = await newPage(browser, state, 'iphone15', { colorScheme: 'dark' });
    const S = (n, o = {}) => snap(page, dir, n, { viewport, ...o });
    await step(dir, 'dark', async () => {
      await openCalendar(page);
      await page.evaluate(() => { document.documentElement.classList.add('dark'); document.documentElement.setAttribute('data-theme', 'dark'); });
      await page.waitForTimeout(500);
      await S('20-dark-home');
      await page.getByRole('radiogroup', { name: 'Calendar view' }).getByRole('radio', { name: 'Month' }).click();
      await page.waitForTimeout(500);
      await S('20b-dark-month');
      const card = page.locator('[aria-label*=" — "]').first();
      await page.getByRole('radiogroup', { name: 'Calendar view' }).getByRole('radio', { name: 'Agenda' }).click();
      await page.waitForTimeout(500);
      if (await card.count()) { await card.click(); await page.waitForTimeout(800); await S('20c-dark-drawer'); await closeOverlay(page); }
      if (role === 'coach') {
        await page.getByRole('button', { name: 'More calendar actions' }).click();
        await page.waitForTimeout(300);
        await page.getByRole('menuitem', { name: 'Find a time' }).or(page.getByRole('button', { name: 'Find a time' })).first().click();
        await page.waitForTimeout(3000);
        await S('20d-dark-find-a-time');
      }
    });
    await ctx.close();
  }
  // Large text (Dynamic Type ~ "xxxLarge"): bump the root size the way iOS does.
  {
    const { ctx, page, viewport } = await newPage(browser, state, 'iphone15');
    const S = (n, o = {}) => snap(page, dir, n, { viewport, ...o });
    await step(dir, 'large-text', async () => {
      await openCalendar(page);
      await page.addStyleTag({ content: 'html{font-size:21px !important}' });
      await page.waitForTimeout(500);
      await S('21-largetext-home');
      await page.getByRole('radiogroup', { name: 'Calendar view' }).getByRole('radio', { name: 'Month' }).click();
      await page.waitForTimeout(500);
      await S('21b-largetext-month');
      await page.getByRole('radiogroup', { name: 'Calendar view' }).getByRole('radio', { name: 'Agenda' }).click();
      await page.waitForTimeout(500);
      const card = page.locator('[aria-label*=" — "]').first();
      if (await card.count()) { await card.click(); await page.waitForTimeout(800); await S('21c-largetext-drawer'); await closeOverlay(page); }
      if (role === 'coach') {
        await page.getByRole('button', { name: 'More calendar actions' }).click();
        await page.waitForTimeout(300);
        await page.getByRole('menuitem', { name: 'Find a time' }).or(page.getByRole('button', { name: 'Find a time' })).first().click();
        await page.waitForTimeout(3000);
        await S('21d-largetext-find-a-time');
      }
    });
    await ctx.close();
  }
  // Motion ON (no reduced-motion): a mid-transition capture of opening the drawer.
  {
    const { ctx, page, viewport } = await newPage(browser, state, 'iphone15', { reducedMotion: 'no-preference' });
    const S = (n, o = {}) => snap(page, dir, n, { viewport, ...o });
    await step(dir, 'motion', async () => {
      await openCalendar(page);
      await page.getByRole('radiogroup', { name: 'Calendar view' }).getByRole('radio', { name: 'Agenda' }).click();
      await page.waitForTimeout(600);
      const card = page.locator('[aria-label*=" — "]').first();
      if (!(await card.count())) throw new Error('no event card');
      await card.click();
      await page.waitForTimeout(90);
      await page.screenshot({ path: path.join(dir, '22-motion-drawer-t90ms.png') });
      await page.waitForTimeout(700);
      await S('22b-motion-drawer-settled');
    });
    await ctx.close();
  }
}

const browser = await chromium.launch();
try {
  // CAPTURE_QUICK=1: iPhone 15 sweep only (used for the before/after against main).
  const quick = process.env.CAPTURE_QUICK === '1';
  for (const role of ['coach', 'player']) {
    log(`login ${role}`);
    const state = await login(browser, role);
    await sweep(browser, role, state, 'iphone15', true);
    if (quick) continue;
    for (const d of ['w320', 'se', 'promax']) await sweep(browser, role, state, d, false);
    if (role === 'coach') {
      // Landscape: home + Find a time.
      const dir = path.join(OUT, role, 'landscape'); fs.mkdirSync(dir, { recursive: true });
      const { ctx, page, viewport } = await newPage(browser, state, 'landscape');
      const S = (n, o = {}) => snap(page, dir, n, { viewport, ...o });
      await step(dir, 'landscape', async () => {
        await openCalendar(page); await S('30-landscape-home');
        await page.getByRole('button', { name: 'More calendar actions' }).click(); await page.waitForTimeout(300);
        await page.getByRole('menuitem', { name: 'Find a time' }).or(page.getByRole('button', { name: 'Find a time' })).first().click();
        await page.waitForTimeout(3000); await S('30b-landscape-find-a-time');
      });
      await ctx.close();
    }
    await variants(browser, role, state);
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  log('done', OUT);
}
