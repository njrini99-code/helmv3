#!/usr/bin/env node
/**
 * Joins labelled PNGs into one picture, left to right: the merge gate's design | before | after (redesign sweep, rule 11).
 * The script is committed; the images never are. They go on the pr-evidence branch and the PR body links them.
 *
 *   node scripts/clubhouse/side-by-side.mjs out.png design=a.png before=b.png after=c.png
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const [out, ...panels] = process.argv.slice(2);
if (!out || panels.length === 0 || panels.some((p) => !p.includes('='))) {
  console.error('usage: side-by-side.mjs <out.png> <label>=<image.png> ...');
  process.exit(2);
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const cells = panels.map((p) => {
  const at = p.indexOf('=');
  const data = readFileSync(p.slice(at + 1)).toString('base64');
  return `<figure><figcaption>${esc(p.slice(0, at))}</figcaption><img src="data:image/png;base64,${data}"></figure>`;
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.setContent(`<!doctype html><style>body{margin:0;background:#2a2a28;display:inline-flex;gap:16px;padding:16px;align-items:flex-start;font:600 18px system-ui;color:#f4eedd}figure{margin:0}figcaption{margin-bottom:8px}img{display:block;max-height:1400px}</style>${cells.join('')}`);
  await page.evaluate(() => Promise.all(Array.from(document.images).map((i) => i.decode())));
  await page.screenshot({ path: out, fullPage: true });
} finally {
  await browser.close();
}
