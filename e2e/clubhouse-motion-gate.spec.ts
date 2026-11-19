import { test, expect, type Page } from '@playwright/test';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { GATE_SCREENS } from './clubhouse-gate/screens';
import { MOTION_KNOWN } from './clubhouse-gate/motion-known';
import { judgeIdle, judgeMotion, motionTokens, type IdleRow, type MotionRow } from './clubhouse-gate/motion';

/**
 * The motion gate: what actually animates on each gate screen in WebKit at phone width (tier W), read from the browser's
 * own animation list on every frame from the first one, and judged against the motion doctrine (D-64,
 * `.claude/rules/clubhouse.md`):
 *   - layout:    nothing animates a layout property (width, height, top, margin, padding, font-size, gap, ...);
 *   - token:     every finite animation runs for one of the six vocabulary durations (3.2: press 110, quick 180, base 260,
 *                release 280, marks 360, reveal 520);
 *   - first-paint: a screen opening paints at once: no finite animation other than the whole-page crossfade, and no
 *                stagger (a delayed entrance) on first paint (Q-153, "no routine staggers");
 *   - reduced:   under Reduce Motion every travel is a 180 ms opacity fade (MOTION-AND-VISUAL 3.11): on first paint nothing
 *                runs but the page crossfade, on an interaction only that fade, and the loops stop;
 *   - idle:      after load and a second of idle nothing runs at all, loops included (3.1: content never moves on its own;
 *                the working dots run only while work runs).
 * Then every popup kind is opened on the popup lab (sheets, the modal, the action sheet: the motion people see most) and
 * what its opening animates is judged the same way, without the first-paint rule.
 * A screen's known breaks are in `clubhouse-gate/motion-known.ts`; a new one fails, and the list only shrinks.
 * It cannot judge smoothness or feel: that is tier D (`helm-safari-performance`).
 *
 *   CH_QUALITY=1 CH_BASE=http://127.0.0.1:3100 npx playwright test -c playwright.clubhouse.config.ts --project motion-phone
 *   CH_MOTION_REPORT=<file.jsonl> also writes every screen's raw rows.
 */
test.skip(process.env.CH_QUALITY !== '1', 'Use CH_QUALITY=1 with playwright.clubhouse.config.ts.');

const WATCH_MS = 2500;

/** Injected before any page script: every Animation the document holds on any frame, deduped by object. */
function recorder() {
  const w = window as unknown as { __chMotion: unknown[] };
  if (w.__chMotion) return;
  w.__chMotion = [];
  const seen = new WeakSet<Animation>();
  const t0 = performance.now();
  const describe = (el: Element | null | undefined) => {
    if (!el || el.nodeType !== 1) return String(el);
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((c) => `.${c}`).join('');
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls}`;
  };
  const tick = () => {
    for (const a of document.getAnimations()) {
      if (seen.has(a)) continue;
      seen.add(a);
      const effect = a.effect as KeyframeEffect | null;
      const timing = effect?.getComputedTiming?.() ?? {};
      let frames: Keyframe[];
      try { frames = effect?.getKeyframes?.() ?? []; } catch { frames = []; }
      const named = a as Animation & { animationName?: string; transitionProperty?: string };
      let props = [...new Set(frames.flatMap((f) => Object.keys(f)))].filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p));
      if (!props.length && named.transitionProperty) props = [named.transitionProperty];
      w.__chMotion.push({
        at: Math.round(performance.now() - t0),
        kind: a.constructor.name,
        name: named.animationName || named.transitionProperty || a.id || '',
        props: props.map((p) => p.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)),
        duration: typeof timing.duration === 'number' ? Math.round(timing.duration) : null,
        delay: Math.round(Number(timing.delay ?? 0)),
        iterations: timing.iterations === Infinity ? 'infinite' : timing.iterations ?? 1,
        target: describe(effect?.target as Element | null),
        pseudo: effect?.pseudoElement ?? null,
        // A scroll-driven animation (animation-timeline: scroll()) moves with the person's scroll, not on its own.
        timeline: !a.timeline ? 'none' : a.timeline === document.timeline ? 'document' : a.timeline.constructor.name,
      });
    }
    // Runs until record() stops it, so a slow hydration on a CI runner cannot push an entrance out of the window.
    if (!(window as unknown as { __chMotionStop?: boolean }).__chMotionStop) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Records every Animation that appears in the next `ms`, from a fresh list (for an interaction after load). */
async function watch(page: Page, ms: number, act: () => Promise<void>): Promise<MotionRow[]> {
  await page.evaluate(() => {
    const w = window as unknown as { __chWatch: { rows: unknown[]; seen: WeakSet<Animation>; t0: number; on: boolean } };
    w.__chWatch = { rows: [], seen: new WeakSet(document.getAnimations()), t0: performance.now(), on: true };
    const tick = () => {
      for (const a of document.getAnimations()) {
        if (w.__chWatch.seen.has(a)) continue;
        w.__chWatch.seen.add(a);
        const effect = a.effect as KeyframeEffect | null;
        const timing = effect?.getComputedTiming?.() ?? {};
        let frames: Keyframe[];
        try { frames = effect?.getKeyframes?.() ?? []; } catch { frames = []; }
        const named = a as Animation & { animationName?: string; transitionProperty?: string };
        let props = [...new Set(frames.flatMap((f) => Object.keys(f)))].filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p));
        if (!props.length && named.transitionProperty) props = [named.transitionProperty];
        const el = effect?.target as Element | null;
        const cls = el ? (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((c) => `.${c}`).join('') : '';
        w.__chWatch.rows.push({
          at: Math.round(performance.now() - w.__chWatch.t0), kind: a.constructor.name, name: named.animationName || named.transitionProperty || a.id || '',
          props: props.map((p) => p.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)),
          duration: typeof timing.duration === 'number' ? Math.round(timing.duration) : null, delay: Math.round(Number(timing.delay ?? 0)),
          iterations: timing.iterations === Infinity ? 'infinite' : timing.iterations ?? 1,
          target: el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls}` : String(el), pseudo: effect?.pseudoElement ?? null,
          timeline: !a.timeline ? 'none' : a.timeline === document.timeline ? 'document' : a.timeline.constructor.name,
        });
      }
      if (w.__chWatch.on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await act();
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const w = window as unknown as { __chWatch: { rows: MotionRow[]; on: boolean } };
    w.__chWatch.on = false;
    return w.__chWatch.rows;
  });
}

async function record(page: Page, url: string, tap: string | undefined): Promise<MotionRow[]> {
  await page.addInitScript(recorder);
  const response = await page.goto(url, { waitUntil: 'load' }).catch(() => page.goto(url, { waitUntil: 'load' }));
  expect(response?.status(), `${url} did not render`).toBe(200);
  if (tap) await page.locator(tap).first().click();
  // The window is measured from hydration, not from the first byte: what a screen does as it opens happens after the
  // client takes over, and a CI runner hydrates seconds later than a Mac.
  await page.locator('.ch-root[data-hydrated]').first().waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(WATCH_MS);
  return page.evaluate(() => {
    const w = window as unknown as { __chMotion: MotionRow[]; __chMotionStop?: boolean };
    w.__chMotionStop = true;
    return w.__chMotion;
  });
}

/** What still runs a second after `record` has finished watching (load, hydration and WATCH_MS already passed). */
async function idleRows(page: Page): Promise<IdleRow[]> {
  await page.waitForTimeout(1000);
  return page.evaluate(() => {
    const describe = (el: Element | null | undefined) => {
      if (!el || el.nodeType !== 1) return String(el);
      const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((c) => `.${c}`).join('');
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls}`;
    };
    return document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => {
        const effect = a.effect as KeyframeEffect | null;
        const named = a as Animation & { animationName?: string; transitionProperty?: string };
        const iterations = effect?.getComputedTiming?.().iterations;
        return {
          kind: a.constructor.name,
          name: named.animationName || named.transitionProperty || a.id || '',
          target: describe(effect?.target as Element | null),
          pseudo: effect?.pseudoElement ?? null,
          iterations: iterations === Infinity ? ('infinite' as const) : (iterations ?? 1),
          timeline: !a.timeline ? 'none' : a.timeline === document.timeline ? 'document' : a.timeline.constructor.name,
        };
      });
  });
}

/**
 * A new break fails. A known break that did not show this run is noted, not failed: some of them depend on timing (a
 * Reduce Motion fade can land before or after the window opens), so absence in one run is not proof of a fix. Delete a
 * line from motion-known.ts when its fix lands.
 */
function expectKnown(key: string, breaks: string[]) {
  const known = new Set(MOTION_KNOWN[key] ?? []);
  const unseen = [...known].filter((b) => !breaks.includes(b));
  if (unseen.length) test.info().annotations.push({ type: 'known motion break not seen this run', description: `${key}: ${unseen.join(' | ')}` });
  expect(breaks.filter((b) => !known.has(b)), `${key}: new motion breaks (fix them; e2e/clubhouse-gate/motion-known.ts only shrinks)`).toEqual([]);
}

let tokens: Set<number>;
test.beforeAll(async () => {
  tokens = motionTokens(await readFile(path.resolve('src/clubhouse/styles/tokens.css'), 'utf8'));
});

for (const reduced of [false, true]) {
  test.describe(reduced ? 'reduce' : 'motion', () => {
    test.use({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    for (const screen of GATE_SCREENS.filter((s) => s.phone)) {
      test(`${screen.lane} ${screen.id} ${reduced ? 'reduce' : 'motion'} @motion`, async ({ page }) => {
        const rows = await record(page, screen.path, screen.tap);
        if (process.env.CH_MOTION_REPORT) {
          await mkdir(path.dirname(process.env.CH_MOTION_REPORT), { recursive: true });
          await appendFile(process.env.CH_MOTION_REPORT, `${JSON.stringify({ screen: screen.id, reduced, rows })}\n`);
        }
        const key = `${screen.id}|${reduced ? 'reduce' : 'motion'}`;
        const idle = judgeIdle(await idleRows(page));
        expectKnown(key, [...judgeMotion(rows, { reduced, tokens }), ...idle].sort());
      });
    }

    // A window change on Stats (3.7): the marks glide over 360 ms, the thumb slides over 260; under Reduce Motion only a
    // 180 ms fade. The player's own Stats fixture, the window switch pressed the way a person presses it.
    test(`STATS window change ${reduced ? 'reduce' : 'motion'} @motion`, async ({ page }) => {
      await record(page, '/clubhouse-preview/player', undefined);
      const choice = page.getByRole('radio', { name: 'Last 5', exact: true }).first();
      if (!(await choice.count())) test.skip(true, 'the player Stats fixture has no Last 5 choice');
      const rows = await watch(page, 1200, () => choice.click());
      if (process.env.CH_MOTION_REPORT) await appendFile(process.env.CH_MOTION_REPORT, `${JSON.stringify({ screen: 'stats-window', reduced, rows })}\n`);
      expectKnown(`stats-window|${reduced ? 'reduce' : 'motion'}`, judgeMotion(rows, { reduced, tokens, phase: 'interaction' }));
    });

    // The popups, opened the way a person opens them (the button), each in a fresh lab so nothing is mid-exit.
    for (const kind of ['Modal', 'FormSheet', 'ListSheet', 'PickerSheet', 'ActionSheet', 'RecFormSheet', 'RecPickSheet', 'RecActionSheet']) {
      test(`POPUP ${kind} opens ${reduced ? 'reduce' : 'motion'} @motion`, async ({ page }) => {
        const response = await page.goto('/clubhouse-preview/popup-lab');
        expect(response?.status(), 'popup lab did not render').toBe(200);
        await expect(page.locator('.ch-popup-lab')).toHaveAttribute('data-ready', 'true');
        await page.waitForTimeout(300);
        const rows = await watch(page, 1200, () => page.getByRole('button', { name: kind, exact: true }).click());
        await expect(page.locator('dialog[open]')).toHaveCount(1);
        if (process.env.CH_MOTION_REPORT) await appendFile(process.env.CH_MOTION_REPORT, `${JSON.stringify({ screen: `popup-${kind}`, reduced, rows })}\n`);
        // Opening a popup must move something when motion is allowed; an empty list would mean the recorder saw nothing.
        if (!reduced) expect(rows.length, `${kind} opened with no animation recorded`).toBeGreaterThan(0);
        const key = `popup-${kind}|${reduced ? 'reduce' : 'motion'}`;
        expectKnown(key, judgeMotion(rows, { reduced, tokens, phase: 'interaction' }));
      });
    }
  });
}
