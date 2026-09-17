#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- repo-local capture script, same shape as capture-visual-canaries.cjs */
/**
 * Meridian V2 canary suite (master plan §109 required debug views, §111
 * canary hole set, §112 visual reference board, §116 screenshot regression;
 * Task 26). Extends `capture-visual-canaries.cjs`'s pattern (read that file
 * first) to the Meridian lab harness (`?lab=1`, `meridian-lab.tsx`) so it can
 * capture BOTH render worlds side by side in one run:
 *
 *   world 'v1' → `debug=final`    (the production Three.js landscape)
 *   world 'v2' → `debug=v2-world` (`terrain-debug.ts`'s V2 ground-shader
 *                                  world — `assembleV2World`/`buildV2World`)
 *
 * for every §111 canary hole × named camera shot × viewport, all under one
 * `--label`, writing PNGs plus one `canaries.json`
 * (`src/lib/golf/course-geometry/canary-compare.ts`'s `CanaryRunFile`
 * shape). `compare-canaries.mts` reads that file (via `--run`, splitting on
 * the `world` field, or compare two labeled runs with `--baseline`/
 * `--candidate`).
 *
 * Why the lab route and not the matrix route `capture-visual-canaries.cjs`
 * drives: the lab route is the one place `debug=v2-world` and the phone
 * (390×844) / desktop (1440×1000) viewports Task 26 asks for are both a
 * single query param away (`meridian-lab.tsx`'s `VIEWPORTS` map matches
 * those two pixel sizes exactly) — no dialog, no button-label matching, no
 * PRESETS ambiguity: `?preset=top|approach|green` sets the initial state
 * directly on navigation (`meridian-lab.tsx` reads `location.search` once at
 * mount), so this script never needs to click anything.
 *
 * Camera "shot" = one (`area`, `preset`) pair, both real
 * `meridian-lab.tsx`/`terrain.ts` enum values (`CourseView`/`TerrainPreset`):
 *   top      → area 'hole',     preset 'top'      (whole-hole overview)
 *   approach → area 'approach', preset 'approach' (approach-zone framing)
 *   green    → area 'green',    preset 'green'    (§11 "close Green frame")
 * A shot name not in this table still works (`area` falls back to 'hole'),
 * so `--presets` accepts any `TerrainPreset` string, matching
 * `capture-visual-canaries.cjs --presets=` in spirit.
 *
 * The lab stage (`[data-slot=lab-stage]`) is CSS-scaled down
 * (`transform: scale(stageScale)`) whenever the browser window is too small
 * to show it at native size — harmless on screen, fatal to a pixel diff
 * (every capture would be resized by an untracked factor). This script opens
 * a browser window comfortably larger than the biggest requested viewport
 * and asserts the stage's rendered box is exactly `width×height` before
 * ever taking a screenshot; a mismatch throws rather than silently
 * capturing a scaled image.
 *
 *   node scripts/golf/course-geometry/capture-v2-canaries.cjs \
 *     --label=v2-wave1 [--base=http://127.0.0.1:8768] [--course=peek-n-peak-upper] \
 *     [--holes=7,9,11,15,16,18] [--presets=top,approach,green] \
 *     [--viewports=phone,desktop] [--worlds=v1,v2] [--quality=standard|high]
 *
 * `--quality` overrides `QUALITY_FOR_VIEWPORT` below (see its own comment):
 * without it, every viewport gets its plan-default tier and the two cells
 * plan §116's "standard/high × phone viewport" cross-product cannot
 * otherwise reach (phone+high, desktop+standard) are one extra invocation
 * away, e.g. `--viewports=phone --quality=high`. `canaries.json` still
 * records the *nominal* `viewport` string either way (`"390x844"`), and
 * `canary-compare.ts`'s `tierForViewport`/`evaluateCanaryBudgets` derive
 * their gating tier from *that viewport string alone* — never from
 * `metadata.qualityTier` (this script's own `METADATA_KEYS`, the recorded
 * ground truth for which tier actually rendered a row). A decoupled
 * `--viewports=desktop --quality=standard` run is the direction that
 * matters most: its rows still carry `viewport: "1440x1000"` →
 * `tierForViewport` → `'desktop'` → `V2_BUDGETS.desktop.drawCalls` is
 * `undefined`, so the §93 draw-call rule is silently *skipped* even though
 * the capture ran at the one tier §93's 160/180 numbers are stated for —
 * the same "silently swallowed regression" failure mode
 * `canary-compare.ts` and its tests already call out as the worse of the
 * two directions a mismatched tier can produce. Comparing any decoupled run
 * needs `compare-canaries.mts --tier` passed explicitly (matching the
 * `--quality` actually used, not the viewport label), never left to derive
 * itself.
 *
 * Output: output/playwright/course-geometry/visual-system/v2-canaries/<label>/
 *   hole-NN-<preset>-<world>-<viewportKey>.png and canaries.json.
 * Read-only against the geometry package; nothing is written to src.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value ?? true];
}));
const label = String(args.label || 'v2-canary');
const base = String(args.base || 'http://127.0.0.1:8768');
const course = String(args.course || 'peek-n-peak-upper');
// §111's exact canary hole set.
const holes = String(args.holes || '7,9,11,15,16,18').split(',').map(Number);
const presets = String(args.presets || 'top,approach,green').split(',');
const viewportKeys = String(args.viewports || 'phone,desktop').split(',');
const worldKeys = String(args.worlds || 'v1,v2').split(',');
const outDir = path.resolve(String(args.out || `output/playwright/course-geometry/visual-system/v2-canaries/${label}`));

/** `meridian-lab.tsx`'s own `VIEWPORTS` map, phone/desktop entries only
 * (Task 26's two required viewports). Kept as a literal copy rather than
 * imported so this script never depends on Vite/TS module resolution — if
 * the fixture's own map ever disagrees, the stage-size assertion below
 * catches the drift loudly instead of silently mislabeling a capture. */
const VIEWPORTS = { phone: [390, 844], desktop: [1440, 1000] };
/** `debug=` value per render world (`terrain-debug.ts` `TERRAIN_DEBUG_VIEWS`). */
const DEBUG_VIEW = { v1: 'final', v2: 'v2-world' };
/** Default `quality=` per viewport, matching `v2-budgets.ts`'s own
 * "'phone' the plan's 'standard' tier … 'desktop' the plan's 'high' tier"
 * mapping. Deliberately not left on `meridian-lab.tsx`'s default `'auto'`:
 * `render-quality.ts` picks 'auto' from the *host machine's*
 * `navigator.hardwareConcurrency`/`deviceMemory`/`matchMedia('pointer:
 * coarse')`, none of which this script's single shared browser context
 * changes per `viewportKey` — capturing on 'auto' would make every number in
 * the table a function of whatever machine happened to run the capture
 * (constraint 13: deterministic, no such thing as a Meridian canary that
 * only reproduces on one laptop).
 *
 * This 1:1 pairing is a default, not a hard limit: `--quality` (see the
 * usage comment above) overrides it for every requested viewport, because
 * nothing about setting `?quality=` per navigation actually depends on the
 * shared browser context — only the *rejected* 'auto' tier would have. */
const QUALITY_FOR_VIEWPORT = { phone: 'standard', desktop: 'high' };
const qualityOverride = args.quality !== undefined ? String(args.quality) : null;
if (qualityOverride !== null && qualityOverride !== 'standard' && qualityOverride !== 'high') {
  console.error(`--quality must be "standard" or "high", got "${qualityOverride}"`);
  process.exit(2);
}
/** `area=` override for a shot whose framing needs more than the default
 * whole-hole view; anything else (top, tee, terrain, side, putting) uses
 * `meridian-lab.tsx`'s own default (`'hole'`). */
const AREA_FOR_PRESET = { approach: 'approach', green: 'green' };
const areaFor = preset => AREA_FOR_PRESET[preset] || 'hole';

for (const key of viewportKeys) {
  if (!VIEWPORTS[key]) { console.error(`--viewports: "${key}" is not one of ${Object.keys(VIEWPORTS).join(', ')} — this script only knows Task 26's two required viewports (meridian-lab.tsx has more, e.g. tablet/phone-large, but nothing here has verified those against a live run)`); process.exit(2); }
}
for (const world of worldKeys) {
  if (!DEBUG_VIEW[world]) { console.error(`--worlds: "${world}" is not one of ${Object.keys(DEBUG_VIEW).join(', ')}`); process.exit(2); }
}

const pick = (dataset, keys) => Object.fromEntries(keys.map(key => [key, dataset[key] ?? null]));
// Same list `capture-visual-canaries.cjs` reads off `canvas.dataset`
// (`three-renderer.ts`), plus `shadowUpdates` (§72 "bakes since ready" —
// already written by three-renderer.ts but never read by the V1 script).
const METADATA_KEYS = ['terrainRenderer', 'terrainProjection', 'visualStyleVersion', 'qualityTier', 'drawCalls', 'renderTriangles',
  'terrainTriangles', 'terrainTrees', 'pixelRatio', 'shadowMapSize', 'shadowMapType', 'shadowUpdates', 'terrainPitch', 'terrainYaw', 'terrainExaggeration',
  'terrainScale', 'terrainFov', 'crownDetail', 'bufferWidth', 'bufferHeight', 'renderCount', 'terrainHash', 'debugView', 'frameMs',
  'visualStyleHash', 'visualArtifactHash', 'visualArtifactSource', 'meridianCode', 'visualBunkers', 'terrainMassLobes', 'terrainTrunks', 'treeFamilies',
  'frameP95Ms', 'drawCallBudget', 'drawCallStatus', 'triangleBreakdown', 'treeLod', 'geometryMemoryMb', 'shadowMemoryMb',
  'gpuFrameP95Ms', 'gpuTimerBasis', 'multiDrawBasis', 'crownLodBasis'];

let packageHash = null;
try { packageHash = JSON.parse(fs.readFileSync(path.resolve(`src/test/fixtures/course-geometry/${course}.json`), 'utf8')).contentHash ?? null; }
catch { /* no local fixture for this course; canaries.json records null rather than guessing */ }

/** Poll `data-render-count` until stable for a full settle window — a
 * control change (preset/debug/viewport) triggers exactly one fresh render
 * under the event-driven renderer (constraint 12), so this is the same
 * "wait for the last render, not the first" pattern as
 * `capture-visual-canaries.cjs`'s `settled()`. */
async function settled(page, canvas) {
  let previous = await canvas.getAttribute('data-render-count');
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(200);
    const next = await canvas.getAttribute('data-render-count');
    if (next === previous) return;
    previous = next;
  }
}

/** Waits for either the terrain to become ready or a visible failure
 * (`meridian-lab.tsx` renders `role=alert` on a load failure or a camera-fit
 * error, and never mounts `CourseTerrainCanvas` at all when the camera fit
 * throws — so waiting only for "ready" would hang the full 15s timeout on
 * every such hole/preset/world combination instead of failing fast). */
async function waitForStageReady(page) {
  // Both branches resolve, never reject (a timed-out `waitFor`/`waitForFunction`
  // throws): whichever loses the race would otherwise reject *after* the
  // race already settled on the other one, as an unhandled rejection nothing
  // is listening for any more.
  const ready = page.waitForFunction(() => document.querySelector('[data-terrain-view-state=ready] canvas[data-terrain-state=ready]'), null, { timeout: 15_000 })
    .then(() => ({ ok: true }), () => ({ ok: false, reason: 'timeout' }));
  const alert = page.locator('[role=alert]').first().waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => ({ ok: false, reason: 'alert' }), () => ({ ok: false, reason: 'timeout' }));
  return Promise.race([ready, alert]);
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const report = {
    label, course, packageHash, base, capturedAt: new Date().toISOString(),
    holes, presets, viewports: viewportKeys, worlds: worldKeys,
    captures: [], errors: [],
  };
  const maxWidth = Math.max(...viewportKeys.map(key => VIEWPORTS[key][0]));
  const maxHeight = Math.max(...viewportKeys.map(key => VIEWPORTS[key][1]));
  // meridian-lab.tsx: stageScale = min(1, (innerWidth-360)/width, (innerHeight-24)/height).
  // A generous margin over the largest requested viewport keeps that at 1
  // for every viewport in this run, not just the biggest one.
  const outerViewport = { width: maxWidth + 400, height: maxHeight + 200 };
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: outerViewport, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push({ message: error.message }));
    for (const hole of holes) {
      for (const preset of presets) {
        const area = areaFor(preset);
        for (const viewportKey of viewportKeys) {
          const [width, height] = VIEWPORTS[viewportKey];
          for (const world of worldKeys) {
            const debugView = DEBUG_VIEW[world] ?? DEBUG_VIEW.v1;
            try {
              const quality = qualityOverride || QUALITY_FOR_VIEWPORT[viewportKey] || 'standard';
              const url = `${base}/?lab=1&course=${course}&hole=${hole}&area=${area}&preset=${preset}&debug=${debugView}&viewport=${viewportKey}&quality=${quality}`;
              await page.goto(url);
              const outcome = await waitForStageReady(page);
              if (!outcome.ok) { report.errors.push({ hole, preset, viewport: viewportKey, world, message: `stage never became ready (${outcome.reason})` }); continue; }
              const stage = page.locator('[data-slot=lab-stage]');
              const box = await stage.evaluate(el => { const rect = el.getBoundingClientRect(); return { width: Math.round(rect.width), height: Math.round(rect.height) }; });
              if (box.width !== width || box.height !== height) {
                throw new Error(`lab stage rendered at ${box.width}x${box.height}, expected ${width}x${height} — browser window too small (stageScale < 1); increase the outer viewport`);
              }
              const canvas = stage.locator('canvas');
              await settled(page, canvas);
              const file = `hole-${String(hole).padStart(2, '0')}-${preset}-${world}-${viewportKey}.png`;
              const target = path.join(outDir, file);
              await canvas.screenshot({ path: target });
              // A near-empty PNG almost always means a blank/black canvas got
              // captured, not a genuinely tiny image — this course renderer
              // never produces one. Chromium's WebGLRenderer here is built
              // without `preserveDrawingBuffer` (three-renderer.ts), which
              // some screenshot paths on some browser/driver combinations can
              // race against the compositor; this is a cheap net, not a
              // guarantee, and worth double-checking on the first real run
              // (see the task report).
              const bytes = fs.statSync(target).size;
              if (bytes < 500) throw new Error(`${file} is only ${bytes} bytes — looks like a blank canvas capture, not a real render`);
              const dataset = await canvas.evaluate(el => ({ ...el.dataset }));
              const metadata = { packageHash, ...pick(dataset, METADATA_KEYS) };
              if (world === 'v2') {
                // three-renderer.ts always writes landscape.artifact.contentHash
                // (the V1 artifact) into dataset.visualArtifactHash, even under
                // `debug=v2-world`: installTerrainDebugView never replaces
                // `landscape.artifact`, and no V2 artifact hash is exposed
                // anywhere at runtime yet (see this task's sharedDiffs).
                // Surfacing that V1 value as this row's `visualArtifactHash`
                // would make every V1/V2 pair print as "same artifact" in
                // canary-compare.ts's table — false, and worse than blank.
                metadata.v1LandscapeArtifactHashDuringV2Debug = metadata.visualArtifactHash;
                // Forward-compatible: once terrain-debug.ts's `v2-world`
                // branch sets this global (see sharedDiffs), it is picked up
                // here with no further change to this script; until then it
                // is always undefined and visualArtifactHash stays null.
                metadata.visualArtifactHash = await page.evaluate(() => window.meridianArtifactV2Hash ?? null);
              }
              report.captures.push({ hole, preset, viewport: `${width}x${height}`, world, file, metadata });
              process.stdout.write(`${file} draw=${dataset.drawCalls} tri=${dataset.renderTriangles} debug=${dataset.debugView}\n`);
            } catch (error) {
              report.errors.push({ hole, preset, viewport: viewportKey, world, message: error instanceof Error ? error.message : String(error) });
            }
          }
        }
      }
    }
    await context.close();
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(outDir, 'canaries.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`${report.captures.length} captures (${report.errors.length} error(s)) → ${outDir}`);
  if (report.errors.length) { console.error(JSON.stringify(report.errors, null, 2)); process.exitCode = 1; }
})().catch(error => { console.error(error); process.exit(1); });
