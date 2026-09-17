<!-- markdownlint-disable MD013 MD060 -->
# Cascaded shadow maps (CSM) — high-tier benchmark protocol

V2 plan Part XIII §69-73, Part XXI Task 22. Sibling of Task 23's light-probe
experiment (progress.md Ruling R9) in kind: an isolated, install/remove-able
experiment gated behind a query param, never wired into the standard (phone)
render path, kept only if it earns its cost.

**Nothing here changes the shipped renderer.**
`src/components/golf/course-geometry/three-csm-benchmark.ts` exports two
functions (`installCsmBenchmark` / `removeCsmBenchmark`) and nothing else
touches `src`. The lab does not honour `csm=1` yet — see **§5 Wiring** below
for the exact diff a controller applies before `bench-csm.cjs` measures
anything real.

## 1. What "in place of the single fitted shadow map" means

Today, every hole renders with exactly one shadow-casting light: `sun` in
`src/lib/golf/course-geometry/three-renderer.ts`, a `DirectionalLight` whose
shadow camera is re-fitted (`fitShadowBounds`) to the visible package on
every relevant camera/geometry change, with `shadow.autoUpdate = false` and
an explicit `needsUpdate` bake (§72's discipline — "before replacing it,
optimize `shadow.autoUpdate`/`needsUpdate`", already done). §73 asks for a
benchmark of three's own CSM addon (`three/examples/jsm/csm/CSM.js`, present
in three 0.186, fully typed by the matching `@types/three` 0.186.0) as a
**high-tier-only** alternative:

> standard = fitted single sun shadow
> high = benchmark 2-cascade CSM
>
> Do not enable standard.

## 2. What the module does beyond the raw addon

`installCsmBenchmark(scene, camera, renderer, options?)` does not just call
`new CSM(...)`. Three things the addon leaves for its caller to get right,
verified by reading `CSM.js` directly (see the file's own header comment for
the full reasoning):

1. **Hides** (does not remove) every existing shadow-casting
   `DirectionalLight` already in the scene for the duration of the install —
   otherwise it keeps illuminating and shadowing alongside the cascades, and
   CSM's per-cascade depth masking (which indexes `directionalLights[]`
   positionally) misattributes it to a cascade it isn't.
2. **Snapshots and restores `THREE.ShaderChunk.lights_fragment_begin` /
   `lights_pars_begin`** — CSM's constructor overwrites these two *global*
   chunks unconditionally (every material compiled anywhere in the process
   while CSM is installed reads the patched version), and neither
   `csm.remove()` nor `csm.dispose()` ever restores them.
3. **Snapshots and restores each patched material's `onBeforeCompile`** —
   `csm.dispose()` `delete`s it back to `Material.prototype`'s no-op, not
   back to whatever the material had before. `attachTurfStyle`
   (three-landscape.ts) installs its own `onBeforeCompile` on the ground
   material for DEM shading; without this fix, one install/remove cycle
   would permanently strip that shader injection.
4. Disposes each cascade light's `shadow.dispose()` on removal — a real GPU
   render-target leak `csm.remove()` alone does not close.
5. Sets `shadow.autoUpdate = false` on every cascade light and exposes
   `requestShadowUpdate()`, so a benchmark run compares two *event-driven*
   shadow systems (§72), not an event-driven baseline against a CSM side
   that naively rebakes every render for reasons unrelated to cascade count.

Only materials three's own lighting chunk system natively drives are patched
— `MeshStandardMaterial` (and its subclass `MeshPhysicalMaterial`),
`MeshPhongMaterial`, `MeshLambertMaterial` — everything in
three-landscape.ts today (turf/crown/trunk/mass) is `MeshStandardMaterial`.
A hand-rolled `ShaderMaterial` (the eventual V2 ground material —
`ground-shader-v2.ts`'s `groundShaderV2Chunks` are spliced GLSL text, not
three's `#include <lights_*>` chunk system, until a later wiring task makes
them so) is left alone and counted in `stats.materialsSkipped` unless it
sets `material.userData.csmCompatible = true`.

**Cascades default to 2**, per §73's own words ("benchmark 2-cascade CSM"),
not the addon's own constructor default of 3 (`data.cascades || 3`). Pass
`{ cascades: 3 }` to compare against that too — see the results table below.

**Camera**: perspective only, by the exported function's own TypeScript
signature. CSM's frustum splitting is a perspective-only construction, and
§73 itself frames the benefit as "sharper shadows over long whole-hole
**perspective**" — never the orthographic Top view.

Not implemented, on purpose (kept "compact... benchmark only"): `mode:
'custom'` / `customSplitsCallback`, and any material added to the scene
*after* install (it renders under whichever chunk branch is active at its
own compile time, correctly if unpatched, but is never retroactively
patched or unpatched — a documented limitation, not a defect, since the
benchmark's own usage is a static scene per page load, never a live
in-page toggle).

## 3. Headless test coverage and its limit

`three-csm-benchmark.test.ts` runs under `--project unit` (Node, no DOM/GL —
same fake-renderer pattern as `three-landscape.test.ts`'s
`installTerrainDebugView` calls: `{ shadowMap: { enabled: true } } as
THREE.WebGLRenderer`). It proves: cascade lights installed/removed cleanly,
the existing light hidden/restored, `ShaderChunk` globals restored exactly,
a pre-existing `onBeforeCompile` restored exactly, incompatible materials
left untouched, the `userData.csmCompatible` opt-in, repeated install/remove
cycles accumulate nothing, a double-install without remove throws, and
`removeCsmBenchmark` is idempotent.

It does **not** prove shadow-map render-target lifecycle under a real GPU —
there is no GL context in `--project unit`, so no bake ever happens and
`light.shadow.map` never allocates. `light.shadow.dispose()` is exercised
(no-ops safely on a `null` map) but its actual VRAM-releasing behavior is
unverified here. That needs the browser measurement below.

## 4. Measurement protocol

**Always at `quality=high`.** §73 is a high-tier-only benchmark ("Do not
enable standard") — never run `csm=1` at `quality=standard` or `low`.

- **Scene**: hole 7 (hero hole, Peek'n Peak Upper), presets `approach` and
  `green` (both `projection: 'perspective'`, per `TERRAIN_PRESETS` in
  `src/lib/golf/course-geometry/terrain.ts`), viewport `desktop` (1440×1000).
  Task 22's own plan checklist (§73) says "Hole 9/18 compare"; this task's
  dispatch specified hole 7 approach/green instead, and that is what this
  protocol and `bench-csm.cjs`'s defaults follow — hole 7 is this project's
  designated hero hole (every V2 task's fixtures and screenshots center on
  it). Compiled fixtures for holes 9 and 18 already exist
  (`compiled-peek-n-peak-upper/peek-n-peak-upper-{09,18}-*.json`), so
  `bench-csm.cjs --hole=9` / `--hole=18` run the plan's own literal
  comparison with no code change — this protocol just does not treat that
  as the required run.
- **Primary metric — GPU frame P95**: `canvas.dataset.gpuFrameP95Ms`, via
  `EXT_disjoint_timer_query_webgl2` (`gpuTimerBasis ===
  'ext_disjoint_timer_query'`). Chromium/ANGLE only; report
  `gpuTimerBasis` alongside every number so an "unavailable" run (most
  WebViews) is never confused with "0ms" or "no difference".
- **Secondary metric — CPU frame P95**: `canvas.dataset.frameP95Ms`, always
  present, always reported alongside the GPU number.
- **Sample size**: the renderer is event-driven (§72) — a settled, static
  frame is exactly one sample. `bench-csm.cjs` nudges the lab's Yaw slider
  through a short oscillation (`--nudges`, default 12) after settling, so
  the rolling last-30 `frameTimes`/`gpuTimes` buffers
  (`three-renderer.ts`) hold real, repeated renders before the P95 is read.
  A run reports how many nudges it used; treat fewer than ~20 as indicative,
  not a stable percentile.
- **Shadow-map memory**: `canvas.dataset.shadowMapSize` /
  `shadowMemoryMb` describe the *replaced* single map's own size, which
  stays whatever it was, unmoved, throughout — it does not go to zero when
  hidden. The CSM-side estimate is the new `csm*` dataset fields the wiring
  below adds (`csmShadowMapSize`, `csmCascades`,
  `csmEstimatedShadowMemoryMb`), computed by `stats.estimatedShadowMemoryBytes`
  in `three-csm-benchmark.ts` as `cascades × shadowMapSize² × 4 bytes` — the
  same "size² × 4 bytes/texel" convention `shadowMemoryMb` itself already
  uses, so the two numbers are comparable rather than independently
  "more correct" and therefore incommensurable.
- **Draw calls / triangles**: `drawCalls` / `renderTriangles` — CSM adds
  cascade-many shadow-pass draws per shadow-casting object; record the delta.

### No invented high-tier budget number

`src/lib/golf/course-geometry/v2-budgets.ts`'s own `DESKTOP` tier omits
`drawCalls`/`textureBytes`/`pixelBudgetMP` **on purpose**: "the plan states
no numbers for it... rather than guessing — `undefined`, not a fabricated
limit." This protocol does the same. §73's own bar —

> keep only if visually meaningful and within high-tier budget

— is a judgment call for whoever reviews a completed run (and, eventually,
Task 27's physical-device calibration), not an automated pass/fail this
document or `bench-csm.cjs` computes. Report the raw deltas; do not invent a
threshold to compare them against.

## 5. Wiring — controller-applied

Per this task's workspace rules, `terrain-debug.ts` and `three-renderer.ts`
belong to other tasks; this module cannot wire itself in. The diff below is
what makes `csm=1` real (until it lands, `bench-csm.cjs`'s `csm*` dataset
fields read back `undefined`, printed as `not-wired`, and both states of a
run render identically — expected, not a bug).

**`three-renderer.ts`** — thread the active perspective camera through (it
is not currently a parameter of `installTerrainDebugView`):

```diff
     releaseDebug = installTerrainDebugView(world, landscape, mesh, options.debugView ?? 'final', renderer, options.scene);
+    // Task 22: only meaningful with a perspective camera (§73) — passed
+    // separately from `view` because `view` is not assigned to the active
+    // projection until after this call.
+    releaseDebug = installTerrainDebugView(world, landscape, mesh, options.debugView ?? 'final', renderer, options.scene,
+      options.camera.projection === 'perspective' ? perspectiveView : undefined);
```

(Replace the existing call with the new one; `perspectiveView` is already an
in-scope local in this constructor.)

**`terrain-debug.ts`** — gate on `csm=1`, independent of `debugView` (a
benchmark run should be comparable across `v2-world`, `final`, or any other
debug view, not just one of them). Rename the existing function body to a
private helper and wrap it. One guard, one read site — both `csm` and the
optional `csmCascades` come from the same parsed `URLSearchParams`, so there
is no second, unguarded `location.search` read for a future editor to copy:

```diff
+import { installCsmBenchmark, removeCsmBenchmark, type CsmBenchmarkStats } from './three-csm-benchmark';
+
+function csmParams(): URLSearchParams | null {
+  // Guard required: this file is called directly from three-landscape.test.ts
+  // under `--project unit` (Node, no `location` global) — see that file's
+  // `installTerrainDebugView(..., { shadowMap: { enabled: true } } as ...)`
+  // calls, which must keep passing unchanged.
+  return typeof location === 'undefined' ? null : new URLSearchParams(location.search);
+}
+
-export function installTerrainDebugView(world: THREE.Scene, landscape: ThreeLandscape, mesh: TerrainMesh,
-  mode: TerrainDebugView, renderer: THREE.WebGLRenderer, scene?: HoleScene): () => void {
+export function installTerrainDebugView(world: THREE.Scene, landscape: ThreeLandscape, mesh: TerrainMesh,
+  mode: TerrainDebugView, renderer: THREE.WebGLRenderer, scene?: HoleScene, perspectiveCamera?: THREE.PerspectiveCamera): () => void {
+  const params = csmParams();
+  const csm = perspectiveCamera && params?.get('csm') === '1'
+    ? installCsmBenchmark(world, perspectiveCamera, renderer, { cascades: Number(params.get('csmCascades')) || 2 })
+    : null;
+  const releaseMode = installTerrainDebugViewMode(world, landscape, mesh, mode, renderer, scene);
+  // Merged AFTER the mode install, not before: every v2-* mode branch below
+  // assigns `userData.debugV2` fresh (see e.g. the v2-world case), which
+  // would otherwise clobber this. `{}` when the mode set nothing (`final`).
+  if (csm) landscape.terrain.userData.debugV2 = { ...(landscape.terrain.userData.debugV2 as Record<string, unknown> | undefined), csm: csm.stats };
+  return () => { releaseMode(); if (csm) removeCsmBenchmark(csm); };
+}
+
+function installTerrainDebugViewMode(world: THREE.Scene, landscape: ThreeLandscape, mesh: TerrainMesh,
+  mode: TerrainDebugView, renderer: THREE.WebGLRenderer, scene?: HoleScene): () => void {
   if (mode === 'final') return () => {};
    ... (existing body, unchanged) ...
```

**`three-renderer.ts`** — read that same `userData.debugV2.csm` slot back out
in `setCamera`'s existing `Object.assign(canvas.dataset, {...})` block (the
one that already writes `shadowMapSize`/`shadowMemoryMb` from `sun`).
`debugV2` itself is an established write-only diagnostic slot today (every
`v2-*` branch in terrain-debug.ts sets it, nothing in three-renderer.ts
reads it back) — this is the first read of it, added once, next to where
the sibling fields are already written:

```diff
+    const csmStats = (landscape.terrain.userData.debugV2 as { csm?: CsmBenchmarkStats } | undefined)?.csm;
     Object.assign(canvas.dataset, {
       ...
       shadowMapSize: `${sun?.shadow.mapSize.x ?? 0}`, shadowMapType: 'pcf', shadowUpdates: String(shadowUpdates),
+      csmActive: csmStats ? '1' : '0',
+      csmCascades: csmStats ? String(csmStats.cascades) : '',
+      csmShadowMapSize: csmStats ? String(csmStats.shadowMapSize) : '',
+      csmEstimatedShadowMemoryMb: csmStats ? (csmStats.estimatedShadowMemoryBytes / 1_048_576).toFixed(1) : '',
+      csmMaterialsPatched: csmStats ? String(csmStats.materialsPatched) : '',
+      csmMaterialsSkipped: csmStats ? String(csmStats.materialsSkipped) : '',
       ...
     });
```

(`CsmBenchmarkStats` imported from `three-csm-benchmark.ts`.) This is the
one concrete mechanism `bench-csm.cjs` depends on — it reads exactly these
six keys, spelled exactly this way; a different shape means a wired build
still prints `not-wired`.

`csm=1` is the one required param this task asks for; `csmCascades` above is
optional and purely additive (defaults to 2 if absent) — it lets one
`bench-csm.cjs` run also answer "2 vs 3 cascades" without a second param the
task did not ask for turning into a silent requirement.

**Known gap in the sketch above, left for whoever lands it**: at the point
`installTerrainDebugView` runs (inside `createThreeTerrainRuntime`,
three-renderer.ts), `perspectiveView` has not been configured for this hole
yet (`applyTerrainCamera` runs a few lines later, and `setCamera`'s first
real call happens later still, after `renderer.compileAsync` resolves) — so
`installCsmBenchmark`'s constructor computes its initial cascade split
against `PerspectiveCamera`'s raw defaults (`fov 50, aspect 1, near 0.1, far
2000`), not the hole's real values. This module's `handle.csm.updateFrustums()`
(exposed, not wrapped) needs one more call once the camera is actually
configured — pair it with the existing `dirtyShadow` block in
`setCamera` (three-renderer.ts) that already calls `sun.shadow.needsUpdate =
true`, and again on any later fov/aspect change. Until that follow-up call
exists, a `csm=1` run's *first* frame has this staleness; treat a run's
first sample as warm-up, not signal (the `--nudges` loop in `bench-csm.cjs`
already renders well past it before reading the P95).

## 6. Running the benchmark

Not run in this session (workspace rule: no capture scripts, nothing against
port 8768). Once the lab is serving and the wiring above has landed:

```sh
node scripts/golf/course-geometry/bench-csm.cjs \
  --base=http://127.0.0.1:8768 --course=peek-n-peak-upper --hole=7 \
  --presets=approach,green --nudges=12 \
  --out=output/playwright/course-geometry/csm-benchmark
```

Writes `<preset>-csm0.json` / `<preset>-csm1.json` (full dataset snapshot
each) plus `summary.json`, and prints one line per state to stdout.

## 7. Results table (fill in after a real run)

| Preset   | Cascades | GPU P95 off (ms) | GPU P95 on (ms) | Δ GPU | CPU P95 off | CPU P95 on | Shadow mem off (MB) | Shadow mem on (MB) | Draws off | Draws on | Visually meaningful? |
|----------|----------|-------------------|-----------------|-------|-------------|------------|----------------------|----------------------|-----------|----------|-----------------------|
| approach | 2        |                   |                 |       |             |            |                      |                      |           |          |                       |
| approach | 3        |                   |                 |       |             |            |                      |                      |           |          |                       |
| green    | 2        |                   |                 |       |             |            |                      |                      |           |          |                       |
| green    | 3        |                   |                 |       |             |            |                      |                      |           |          |                       |

`gpuTimerBasis` for the run: _______ (record once; if `unavailable`, the GPU
columns above are blank by necessity — report CPU P95 as the primary number
instead and say so).

## 8. Decision checklist (§73)

- [ ] Measured on the physical device class §73 cares about (desktop/high
      tier) — never used to justify enabling CSM on standard/phone.
- [ ] GPU P95 delta (or CPU P95, if no GPU timer) recorded for both presets,
      both cascade counts.
- [ ] Shadow-map memory delta recorded (existing single map vs. CSM
      estimate, same bytes/texel convention).
- [ ] A reviewer judged the shadow quality difference "visually meaningful"
      on the actual approach/green frames — a number alone does not decide
      this.
- [ ] Kept only if both the above hold. No numeric high-tier budget exists
      to gate against (§4) — this is a judgment call, recorded here, not an
      automated pass/fail.
