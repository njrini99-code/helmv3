import { expect, test, type Page } from '@playwright/test';

/**
 * Quick chat's motion (design-refresh/coachhelm 02-PLAN, QC motion tests) on the preview: a toggle mid-move goes from where the panel
 * is, opening holds its frames, the panel's height never moves, and only transform and opacity animate.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test e2e/clubhouse/quick-chat-motion.spec.ts --project=chromium --headed
 */
test.skip(!process.env.PLAYWRIGHT_BASE_URL?.includes('localhost'), 'The preview routes run against a local dev server');
test.use({ viewport: { width: 390, height: 844 } });

const PANEL = '[data-ch-qc-panel]';
const KEY = '[data-ch-qc-key]';
const key = (page: Page) => page.locator(KEY);
const start = async (page: Page, state = 'hello') => {
  await page.goto(`/clubhouse-preview/calendar?qc=${state}`, { waitUntil: 'networkidle' });
  await page.locator(KEY).first().waitFor();
};
const scaleNow = (page: Page) =>
  page.evaluate((sel) => {
    const t = getComputedStyle(document.querySelector(sel)!).transform;
    return t === 'none' ? 1 : new DOMMatrixReadOnly(t).a;
  }, PANEL);
const opened = async (page: Page) => (await page.locator(PANEL).isVisible()) && (await scaleNow(page)) > 0.99;

test('closing mid-open starts where the panel is', async ({ page }) => {
  await start(page);
  if (await opened(page)) {
    await key(page).click();
    await page.waitForTimeout(500);
  }
  // The session mounts on first use, so it is warmed with one full open and close first.
  await key(page).click();
  await page.waitForTimeout(900);
  await key(page).click();
  await page.waitForTimeout(500);
  await key(page).click();
  await page.waitForTimeout(90);
  const mid = await scaleNow(page);
  expect(mid).toBeGreaterThan(0.5);
  expect(mid).toBeLessThan(1);
  await key(page).click();
  const after = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(0)))).then(() => scaleNow(page));
  // Picks up from the live scale rather than snapping to the start or the end of a close.
  expect(Math.abs(after - mid)).toBeLessThan(0.3);
});

test('opening mid-close turns around', async ({ page }) => {
  await start(page);
  if (!(await page.locator(PANEL).isVisible())) {
    await key(page).click();
    await page.waitForTimeout(800);
  }
  await key(page).click();
  await page.waitForTimeout(70);
  const mid = await scaleNow(page);
  await key(page).click();
  await page.waitForTimeout(16);
  expect(Math.abs((await scaleNow(page)) - mid)).toBeLessThan(0.3);
  await page.waitForTimeout(800);
  expect(await opened(page)).toBe(true);
});

test('opening holds its frames, and animates only transform and opacity', async ({ page }) => {
  await start(page);
  if (await page.locator(PANEL).isVisible()) {
    await key(page).click();
    await page.waitForTimeout(500);
  }
  const sampling = page.evaluate(async () => {
    const gaps: number[] = [];
    const props = new Set<string>();
    let last = performance.now();
    const t0 = last;
    while (performance.now() - t0 < 800) {
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now();
      gaps.push(now - last);
      last = now;
      for (const a of document.getAnimations()) {
        const target = (a.effect as KeyframeEffect | null)?.target as Element | null | undefined;
        if (!target?.closest?.('.ch-qcs')) continue;
        for (const k of (a.effect as KeyframeEffect).getKeyframes()) for (const p of Object.keys(k)) if (!['offset', 'computedOffset', 'easing', 'composite'].includes(p)) props.add(p);
      }
    }
    return { over: gaps.slice(2).filter((g) => g > 25).length, props: [...props] };
  });
  await key(page).click();
  const { over, props } = await sampling;
  expect(over).toBeLessThanOrEqual(1);
  expect(props.filter((p) => !['transform', 'opacity', 'strokeDashoffset', 'strokeDasharray'].includes(p))).toEqual([]);
});

test('the panel keeps its height through a whole task', async ({ page }) => {
  await start(page, 'confirm-cal');
  if (!(await page.locator(PANEL).isVisible())) await key(page).click();
  await page.waitForTimeout(1000);
  const heights = await page.evaluate(async (sel) => {
    const el = document.querySelector(sel) as HTMLElement;
    const seen = new Set<number>();
    const t0 = performance.now();
    while (performance.now() - t0 < 1200) {
      await new Promise((r) => requestAnimationFrame(r));
      seen.add(Math.round(el.offsetHeight));
    }
    return [...seen];
  }, PANEL);
  expect(heights.length).toBe(1);
});

test.describe('Reduce Motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('is opacity only, at the fade or less', async ({ page }) => {
    await start(page);
    if (await page.locator(PANEL).isVisible()) {
      await key(page).click();
      await page.waitForTimeout(400);
    }
    const sampling = page.evaluate(async () => {
      const seen: Array<{ props: string[]; ms: number }> = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 500) {
        await new Promise((r) => requestAnimationFrame(r));
        for (const a of document.getAnimations()) {
          const e = a.effect as KeyframeEffect | null;
          if (!(e?.target as Element | null)?.closest?.('.ch-qcs')) continue;
          seen.push({ props: e!.getKeyframes().flatMap((k) => Object.keys(k)).filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p)), ms: Number(e!.getComputedTiming().duration) });
        }
      }
      return seen;
    });
    await key(page).click();
    const seen = await sampling;
    // A 1ms entry is the shell's Reduce Motion rule cutting a transition to nothing: nothing travels.
    const moving = seen.filter((s) => s.ms > 1);
    expect(moving.flatMap((s) => s.props).filter((p) => p !== 'opacity')).toEqual([]);
    expect(moving.filter((s) => s.ms > 180)).toEqual([]);
  });
});
