import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Page as AxePage } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

// axe-core declares its peer on `playwright-core` while Playwright Test owns the
// runtime page; npm may keep their patch releases in separate directories. Same
// boundary, same isolation, as e2e/accessibility.spec.ts.
function toAxePage(page: import('@playwright/test').Page): AxePage {
  return page as unknown as AxePage;
}


/**
 * Read-only signed-in sweep. Every step is a navigation, a scroll, or a
 * measurement — nothing here submits, sends, deletes or edits. That is a
 * deliberate constraint of the audit's authorization, not an oversight.
 *
 * The measurements are the ones that separate "native app" from "website in a
 * phone": tap targets below Apple's 44pt minimum, text below 11pt, horizontal
 * overflow, and content colliding with the home indicator.
 */
const ROUTES = [
  ['dashboard', '/golf/dashboard'],
  ['roster', '/golf/dashboard/roster'],
  ['calendar', '/golf/dashboard/calendar'],
  ['messages', '/golf/dashboard/messages'],
  ['rounds', '/golf/dashboard/rounds'],
  ['qualifiers', '/golf/dashboard/qualifiers'],
  ['courses', '/golf/dashboard/courses'],
  ['insights', '/golf/dashboard/insights'],
] as const;

const MIN_TAP_PT = 44;
const MIN_TEXT_PX = 11;

/**
 * Scroll end to end so every IntersectionObserver reveal has fired, then return
 * to the top — the same technique as e2e/accessibility.spec.ts's settleReveals.
 * Without it, controls below the fold are still un-revealed when measured, so
 * the undersized-target count would be an UNDERCOUNT rather than a false alarm.
 */
async function settle(page: import('@playwright/test').Page) {
  await page.evaluate(async () => { await document.fonts.ready; });
  const height = await page.evaluate(() => document.body.scrollHeight);
  const viewport = page.viewportSize()?.height ?? 844;
  for (let y = 0; y < height; y += Math.round(viewport * 0.6)) {
    await page.evaluate(to => window.scrollTo(0, to), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
}

for (const [name, route] of ROUTES) {
  test(`signed-in screen: ${name}`, async ({ page }, testInfo) => {
    const res = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(res!.status(), `${route} must not be an error document`).toBeLessThan(400);
    // A bounce to /login means the session expired mid-run; measuring the login
    // page eight times and calling it eight screens would be worse than failing.
    await expect(page, `${route} must not bounce to login`).not.toHaveURL(/\/golf\/login/);
    await settle(page);

    const metrics = await page.evaluate(({ MIN_TAP_PT, MIN_TEXT_PX }) => {
      const small: { tag: string; label: string; w: number; h: number }[] = [];
      const tiny: { text: string; px: number }[] = [];
      const sel = 'a[href], button, [role="button"], [role="tab"], input, select, textarea, [tabindex]:not([tabindex="-1"])';
      // Two classes of false positive have to go before any of this is
      // reportable. (1) Visually-hidden elements: skip links and screen-reader
      // helpers are 32x16 by design and no finger ever hunts for them.
      // (2) A small box inside a larger interactive ancestor: the ancestor is
      // what the finger actually hits, so the child's own rect proves nothing.
      const isHidden = (el: Element, s: CSSStyleDeclaration, r: DOMRect) => {
        if (r.width <= 1 || r.height <= 1) return true;
        if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') return true;
        if (s.clip === 'rect(0px, 0px, 0px, 0px)') return true;
        if (s.clipPath === 'inset(50%)') return true;
        if (el.className && typeof el.className === 'string' && /\bsr-only\b/.test(el.className)) return true;
        return false;
      };
      const coveredByAncestor = (el: Element) => {
        let n = el.parentElement, hops = 0;
        while (n && hops < 3) {
          if (n.matches(sel)) {
            const pr = n.getBoundingClientRect();
            if (pr.width >= MIN_TAP_PT && pr.height >= MIN_TAP_PT) return true;
          }
          n = n.parentElement; hops++;
        }
        return false;
      };
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        if (isHidden(el, s, r)) continue;
        if (r.width >= MIN_TAP_PT && r.height >= MIN_TAP_PT) continue;
        if (coveredByAncestor(el)) continue;
        small.push({
          tag: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).slice(0, 2).join('.') : ''),
          label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
          w: Math.round(r.width), h: Math.round(r.height),
        });
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set<string>();
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const t = (n.textContent || '').trim();
        if (t.length < 3) continue;
        const p = n.parentElement;
        if (!p) continue;
        const px = parseFloat(getComputedStyle(p).fontSize);
        if (px < MIN_TEXT_PX && !seen.has(t)) { seen.add(t); tiny.push({ text: t.slice(0, 40), px }); }
      }
      return {
        smallTapTargets: small,
        tinyText: tiny,
        horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        safeAreaBottom: getComputedStyle(document.documentElement).getPropertyValue('--sab') || 'unset',
        title: document.title,
      };
    }, { MIN_TAP_PT, MIN_TEXT_PX });

    await testInfo.attach(`metrics-${name}`, {
      body: Buffer.from(JSON.stringify(metrics, null, 2)),
      contentType: 'application/json',
    });
    await testInfo.attach(`shot-${name}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });

    const axe = await new AxeBuilder({ page: toAxePage(page) }).analyze();
    await testInfo.attach(`axe-${name}`, {
      body: Buffer.from(JSON.stringify(axe, null, 2)),
      contentType: 'application/json',
    });

    // Recorded, not asserted. This run's job is to measure the gap, and a
    // failing assertion here would stop the sweep at the first screen instead
    // of producing the comparison across all eight.
    const dir = process.env.HELM_AUDIT_DIR!;
    fs.mkdirSync(path.join(dir, 'signed-in'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'signed-in', `${name}.json`),
      JSON.stringify({ route, metrics, axe: {
        violations: axe.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
        incomplete: axe.incomplete.map(v => ({ id: v.id, nodes: v.nodes.length })),
      } }, null, 2) + '\n',
    );
  });
}
