import { expect, test } from '@playwright/test';

/**
 * The desk builder fits the screen (coach audit 13 Nov 2026, §5 #2): at 1920 the frame ran from x=400 to x=2072 and Publish was
 * off-screen. The shared desk edge (shell.css, "One left edge on a desk") gave the full-width builder a left margin, which pushed
 * its right side past the window. Publish, Preview and the Inspector must sit inside the window at every desk width.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test e2e/clubhouse/practice-builder-fit.spec.ts --project=chromium
 * WebKit, because Helm's coaches run Safari (owner, browser testing).
 */
test.skip(!process.env.PLAYWRIGHT_BASE_URL?.includes('localhost'), 'The preview routes run against a local dev server');
test.use({ browserName: 'webkit' });

for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]] as const) {
  test(`the builder fits a ${width} px window`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/clubhouse-preview/coachhelm-practice-builder?state=blocks', { waitUntil: 'networkidle' });
    const builder = page.locator('main[data-ch="practice-builder"]');
    await builder.waitFor();
    const box = await page.evaluate(() => {
      const right = (el: Element | null) => (el ? el.getBoundingClientRect().right : Number.NaN);
      const head = document.querySelector('.ch-prb-head');
      const buttons = [...(head?.querySelectorAll('button') ?? [])];
      const named = (word: string) => buttons.find((b) => b.textContent?.trim().startsWith(word)) ?? null;
      return {
        // The canvas scrolls and has a scroll bar on some systems: the room is the frame's, not the window's.
        room: right(document.querySelector('main[data-ch="practice-builder"]')?.parentElement ?? null),
        builder: right(document.querySelector('main[data-ch="practice-builder"]')),
        publish: right(named('Publish')),
        preview: right(named('Preview')),
        inspector: right(document.querySelector('.ch-prb-insp')),
      };
    });
    expect(box.publish, 'Publish is on screen').toBeLessThanOrEqual(box.room);
    expect(box.preview, 'Preview is on screen').toBeLessThanOrEqual(box.room);
    expect(box.inspector, 'the Inspector is on screen').toBeLessThanOrEqual(box.room);
    expect(box.builder, 'the builder ends at its frame').toBeLessThanOrEqual(box.room + 0.5);
  });
}
