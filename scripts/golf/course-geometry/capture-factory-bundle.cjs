#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- offline factory capture command */
/** Sequential, bounded capture of an explicit immutable local bundle.
 * node scripts/golf/course-geometry/capture-factory-bundle.cjs --layout=... --bundle=<sha256> [--holes=physical-key,...]
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.join('=')]; }));
const layout = args.layout, bundle = args.bundle;
if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(layout || '') || !/^[a-f0-9]{64}$/.test(bundle || '')) throw new Error('Explicit --layout and --bundle required');
const base = 'http://127.0.0.1:8774';
const output = path.resolve(args.out || `output/playwright/factory-bundles/${layout}/${bundle}`);
(async () => {
  const response = await fetch(`${base}/__factory/${layout}/${bundle}/manifest`);
  if (!response.ok) throw new Error('Bundle unavailable');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== bundle) throw new Error('Manifest integrity mismatch');
  const manifest = JSON.parse(bytes);
  const selected = args.holes ? args.holes.split(',') : manifest.holes.map(h => h.key);
  if (selected.some(key => !manifest.holes.some(h => h.key === key))) throw new Error('Unknown hole key');
  const browser = await chromium.launch();
  const captures = [], errors = [];
  fs.mkdirSync(output, { recursive: true });
  try {
    // One page/context at a time. Close it after every hole so WebGL and
    // canopy buffers cannot accumulate across an 18-hole run.
    for (const key of selected) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      page.on('pageerror', error => errors.push({ hole: key, message: error.message }));
      try {
        const expected = manifest.holes.find(h => h.key === key);
        await page.goto(`${base}/?layout=${layout}&bundle=${bundle}&hole=${key}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('canvas[data-terrain-state="ready"]', { timeout: 60000 });
        const evidence = await page.locator('[data-factory-state="ready"]').evaluate(el => ({ ...el.dataset }));
        const renderer = await page.locator('canvas[data-terrain-state="ready"]').evaluate(el => ({ ...el.dataset }));
        if (evidence.factoryBundle !== bundle || evidence.packageHash !== manifest.packageHash || evidence.meshHash !== expected.meshHash || renderer.terrainHash !== expected.meshHash) throw new Error('Captured identity mismatch');
        const file = `${key}-terrain-390x844.png`;
        await page.screenshot({ path: path.join(output, file), fullPage: true });
        captures.push({ holeKey: key, file, evidence, renderer });
        console.log(`${key}: draw ${renderer.drawCalls}/${renderer.drawCallBudget}, mesh ${expected.meshHash.slice(0, 12)}`);
      } finally { await page.close(); }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'captures.json'), JSON.stringify({ schema: 'golfhelm-factory-bundle-captures-v1', layoutId: layout, bundleHash: bundle,
      packageHash: manifest.packageHash, admissionHash: manifest.admission.report?.sha256 ?? null, viewport: { width: 390, height: 844 }, captures, errors,
      physicallyApproved: false }, null, 2) + '\n');
  }
  if (errors.length || captures.length !== selected.length || captures.some(c => c.renderer.drawCallStatus !== 'within')) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
