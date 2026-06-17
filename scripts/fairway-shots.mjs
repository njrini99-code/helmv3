// Reusable Fairway design-system screenshot harness (local dev tool, not committed).
// Usage:
//   node scripts/fairway-shots.mjs <label> [viewport] [sections...] [--hover=<sel>]
//     label    : output prefix → /tmp/fw-<label>-<id>.png
//     viewport : "desktop" (1280) | "mobile" (390 iPhone) | "tablet" (834) | "WxH"
//     sections : space-separated element ids to capture (default: full viewport)
//   Examples:
//     node scripts/fairway-shots.mjs base desktop metrics surfaces insights
//     node scripts/fairway-shots.mjs base mobile          (full-page mobile)
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const label = args[0] || 'shot';
const vpArg = (args[1] || 'desktop');
const sections = args.slice(2).filter((a) => !a.startsWith('--'));
const hoverArg = args.find((a) => a.startsWith('--hover='));
const hoverSel = hoverArg ? hoverArg.slice('--hover='.length) : null;

const VIEWPORTS = {
  desktop: { width: 1280, height: 1000 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844 }, // iPhone 14/15 logical px
};
let viewport = VIEWPORTS[vpArg];
if (!viewport && /^\d+x\d+$/.test(vpArg)) {
  const [w, h] = vpArg.split('x').map(Number);
  viewport = { width: w, height: h };
}
viewport = viewport || VIEWPORTS.desktop;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport, deviceScaleFactor: 2, isMobile: vpArg === 'mobile' });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE.ERR:', m.text()); });

await page.goto('http://localhost:3000/fairway-preview', { waitUntil: 'networkidle', timeout: 120_000 });
await page.waitForTimeout(3000); // fonts + NumberFlow settle

if (hoverSel) {
  const h = await page.$(hoverSel);
  if (h) { await h.scrollIntoViewIfNeeded(); await h.hover(); await page.waitForTimeout(600); }
}

if (sections.length === 0) {
  await page.screenshot({ path: `/tmp/fw-${label}-${vpArg}.png`, fullPage: false });
  console.log(`captured /tmp/fw-${label}-${vpArg}.png`);
} else {
  for (const id of sections) {
    const el = await page.$(`#${id}`);
    if (el) {
      await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(450);
      await el.screenshot({ path: `/tmp/fw-${label}-${id}.png` });
      console.log(`captured /tmp/fw-${label}-${id}.png`);
    } else {
      console.log(`MISSING #${id}`);
    }
  }
}
await browser.close();
console.log('done');
