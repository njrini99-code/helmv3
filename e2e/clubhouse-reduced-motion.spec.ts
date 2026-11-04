import { expect, test, type Page } from '@playwright/test';

/**
 * PR 12 (design-refresh/BUILD_BRIEF.md, DESIGN_LANGUAGE §8): under Reduce Motion nothing travels. One redesigned screen per
 * PR: load it, drive what opens on it, and assert no running animation or transition moves anything (transform, translate,
 * scale, rotate, or a layout property). Crossfades stay, as opacity only.
 *
 * WebKit, because that is what Helm's users run. LOCAL ONLY (the preview routes need a dev server):
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test e2e/clubhouse-reduced-motion.spec.ts --project=chromium
 */
test.skip(!process.env.PLAYWRIGHT_BASE_URL?.includes('localhost'), 'The preview routes run against a local dev server');
test.use({ browserName: 'webkit', reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });

const SCREENS: Array<{ pr: string; path: string; tap?: string }> = [
  { pr: 'PR 2 flat page, PR 3 large titles, PR 10 coach Home', path: '/clubhouse-preview/home' },
  { pr: 'PR 7, PR 8 Roster', path: '/clubhouse-preview/roster', tap: '.ch-rs-row, .ch-group__row' },
  { pr: 'PR 9 Classes', path: '/clubhouse-preview/classes' },
  { pr: 'PR 4a to 4c My stats', path: '/clubhouse-preview/player', tap: '.ch-shs-sum' },
  { pr: 'PR 5 Team stats', path: '/clubhouse-preview/stats', tap: '.ch-shs-sum' },
  { pr: 'PR 6 player Home', path: '/clubhouse-preview/home-player' },
  { pr: 'PR 11a to 11h Messages', path: '/clubhouse-preview/messages?state=design&view=thread' },
  { pr: 'CT1 to CT7 Team board', path: '/clubhouse-preview/coachhelm-team' },
  { pr: 'CR1 to CR5 Read', path: '/clubhouse-preview/coachhelm-read' },
  { pr: 'L1 to L6 Lenses', path: '/clubhouse-preview/coachhelm-player-file' },
  { pr: 'AK0 to AK11 Ask', path: '/clubhouse-preview/coachhelm-ask-v2' },
  { pr: 'QC0 to QC6 Quick chat', path: '/clubhouse-preview/calendar?qc=open' },
  { pr: 'PP0 to PP9 Practice plan', path: '/clubhouse-preview/coachhelm-practice-plan' },
];

/** Every animation in the document that moves something. A finished one (a fill at rest) has nothing left to travel. */
const moving = (page: Page) =>
  page.evaluate(() => {
    const TRAVEL = /^(transform|translate|scale|rotate|top|left|right|bottom|width|height|margin.*|padding.*)$/;
    return document.getAnimations().flatMap((a) => {
      if (a.playState !== 'running') return [];
      const effect = a.effect as KeyframeEffect | null;
      const target = effect?.target as Element | null | undefined;
      const props = effect?.getKeyframes().flatMap((k) => Object.keys(k)) ?? [];
      const hit = [...new Set(props)].filter((p) => TRAVEL.test(p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)));
      // A keyframe at the same value is no travel (`none` to `none`): keep only what changes.
      const frames = effect?.getKeyframes() ?? [];
      const changes = hit.filter((p) => new Set(frames.map((k) => String((k as Record<string, unknown>)[p] ?? ''))).size > 1);
      return changes.length ? [`${target?.tagName.toLowerCase()}.${String(target?.getAttribute('class') ?? '').slice(0, 60)}: ${changes.join(', ')}`] : [];
    });
  });

for (const s of SCREENS) {
  test(`${s.pr}: nothing travels under Reduce Motion`, async ({ page }) => {
    await page.goto(s.path, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ui="clubhouse"], .ch-root').first().waitFor();
    expect(await moving(page)).toEqual([]);
    if (s.tap) {
      const hit = page.locator(s.tap).first();
      if (await hit.count()) {
        await hit.click();
        // Sampled across the open, not only at rest: a push or a sheet would be mid-flight here.
        for (let i = 0; i < 6; i++) {
          expect(await moving(page)).toEqual([]);
          await page.waitForTimeout(40);
        }
      }
    }
  });
}
