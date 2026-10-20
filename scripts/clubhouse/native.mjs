#!/usr/bin/env node
/* global document, getComputedStyle -- scan() runs inside the page (tab.evaluate) */
/**
 * Native-feel scan of every Clubhouse preview screen at iPhone widths (390 and
 * 430 by default). Needs the dev server, like a11y.mjs:
 *
 *   CH_BASE=http://localhost:3107 node scripts/clubhouse/native.mjs [pages]
 *
 * Per screen it reports:
 *   - tap targets whose real hit area (probed with elementFromPoint, so a
 *     ::before or ::after hit area counts and clipping doesn't) is under
 *     44 x 44, Apple's minimum; not links inside running text;
 *   - text fields under 16px, which iOS zooms into on focus;
 *   - a page that scrolls sideways.
 * Exits 1 when any screen has a finding.
 */
import { chromium } from 'playwright';
import { CH_A11Y_PAGES } from './a11y.mjs';

const BASE = process.env.CH_BASE ?? 'http://localhost:3100';
const WIDTHS = (process.env.CH_WIDTHS ?? '390,430').split(',').map(Number);

function scan() {
  const out = { small: [], zoom: [], wide: document.documentElement.scrollWidth };
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[inert],[aria-hidden="true"]');
  };
  const name = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter((c) => c.startsWith('ch-')).slice(0, 2).join('.') : '';
    const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 28);
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} "${label}"`;
  };
  // The real hit area: a tap 21px left, right, above and below the centre still lands on the control
  // (its pseudo-element hit areas count; clipping and a neighbour on top don't).
  const widened = (el) => {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return [[cx - 21, cy], [cx + 21, cy], [cx, cy - 21], [cx, cy + 21]].every(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && (hit === el || el.contains(hit));
    });
  };
  // With a modal dialog open nothing behind it can be tapped (the top layer is inert, so a probe there lands on the dialog): scan the dialog.
  const root = document.querySelector('dialog[open]') ?? document.querySelector('.ch-root') ?? document.body;
  const targets = root.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="switch"], [role="menuitem"], select, summary, input[type="checkbox"], input[type="radio"]');
  for (const el of targets) {
    if (!shown(el) || el.disabled) continue;
    // Visually hidden until focused (skip link, screen-reader-only controls): not a touch target.
    if (el.matches('.ch-skip, .ch-sr-only, .ch-sr-only *')) continue;
    // A link inside running text is sized by its line (WCAG 2.5.8 inline exception).
    if (el.tagName === 'A' && el.closest('p, li > span')) continue;
    // A visually hidden native control is hit through its label.
    const input = el.tagName === 'INPUT' ? el : null;
    const hit = input?.labels?.[0] ?? el;
    const r = hit.getBoundingClientRect();
    if (r.width >= 44 && r.height >= 44) continue;
    if (widened(hit)) continue;
    out.small.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  for (const el of root.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="hidden"]), textarea, select')) {
    if (!shown(el)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 16) out.zoom.push(`${name(el)} ${size}px`);
  }
  return out;
}

async function main() {
  const only = process.argv.slice(2);
  const pages = only.length ? CH_A11Y_PAGES.filter(([p]) => only.includes(p)) : CH_A11Y_PAGES;
  const browser = await chromium.launch();
  let flagged = 0;
  const seen = new Map();
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, reducedMotion: 'reduce' });
    for (const [page, path, open] of pages) {
      if (open && !open.phone) continue;
      const tab = await ctx.newPage();
      const label = `${page.padEnd(12)} ${width}px ${path}${open ? ` (opened ${[open.phone].flat().join(' > ')})` : ''}`;
      try {
        await tab.goto(BASE + path, { waitUntil: 'networkidle', timeout: 240_000 });
        for (const step of [open?.phone ?? []].flat()) {
          await tab.tap(step, { timeout: 10_000 });
          await tab.waitForTimeout(400);
        }
        await tab.waitForTimeout(400);
      } catch (e) {
        flagged++;
        console.log(`FAIL ${label}\n     could not open: ${String(e.message).split('\n')[0]}`);
        await tab.close();
        continue;
      }
      let res;
      try {
        await tab.waitForSelector('.ch-root', { timeout: 30_000 });
        res = await tab.evaluate(scan);
      } catch (e) {
        flagged++;
        console.log(`FAIL ${label}\n     could not scan: ${String(e.message).split('\n')[0]}`);
        await tab.close();
        continue;
      }
      const lines = [];
      if (res.wide > width) lines.push(`scrolls sideways: ${res.wide}px wide`);
      for (const z of res.zoom) lines.push(`zooms on focus (under 16px): ${z}`);
      for (const s of res.small) lines.push(`tap target under 44: ${s}`);
      if (lines.length) {
        flagged++;
        console.log(`FAIL ${label}`);
        for (const l of lines) {
          console.log(`     ${l}`);
          seen.set(l, (seen.get(l) ?? 0) + 1);
        }
      } else console.log(`ok   ${label}`);
      await tab.close();
    }
    await ctx.close();
  }
  await browser.close();
  console.log(flagged ? `\nclubhouse:native: ${flagged} screen(s) with findings, ${seen.size} distinct` : '\nclubhouse:native clean');
  process.exit(flagged ? 1 : 0);
}

main();
