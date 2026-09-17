# Light-probe grid — experiment protocol and recommendation

V2 plan Part XIII §70 (bent-sky ambient) + §74 ("Light probe grids —
experiment only"), Part XXI Task 23, progress.md Ruling R9. Sibling of Task
22's CSM benchmark (`docs/golf/course-geometry/csm-benchmark.md`) in kind: an
isolated, install/remove-able experiment, never wired into the standard
render path, kept only if it earns its cost. Unlike Task 22, this one needed
no controller-applied wiring diff to produce its headline numbers — see §3.

**Nothing here changes the shipped renderer.**
`src/components/golf/course-geometry/three-light-probe-experiment.ts` is a
new, standalone module. No other `src` file was touched.

## 1. Correction to Ruling R9's premise

R9 records "three 0.186 has no LightProbeGrid" as the reason this task builds
a manual grid from `THREE.LightProbe` + `LightProbeGenerator` instead. That
premise is false for the three version actually installed
(`node_modules/three@0.186.0`):

- `three/examples/jsm/lighting/LightProbeGridWebGL.js` exists, and its own
  header says "this class can only be used with `WebGLRenderer`" (there is
  also `LightProbeGrid.js` for `WebGPURenderer` and a TSL
  `LightProbeGridNode.js`).
- It is wired **end to end** in the classic renderer, not just present as an
  unused addon: `WebGLRenderer.js` calls `currentRenderState.pushLightProbeGrid(object)`
  for every `isLightProbeGrid` object during scene traversal, then
  `findLightProbeGrid(volumes, object)` picks the containing grid **per
  drawn object** and feeds it into `programCache.getParameters(...)`, which
  sets `USE_LIGHT_PROBES_GRID` and the `getLightProbeGridIrradiance(...)`
  call in `lights_fragment_begin.glsl.js`. This fires for **any** material
  with `needsLights` — `MeshStandardMaterial` included — with **no
  app-side shader wiring**, unlike the plain `LightProbe` hazard below.

R9's *conclusion* is unaffected — this task's own instructions name
`THREE.LightProbe` + `LightProbeGenerator` specifically, and building that
manual grid still surfaces a real, load-bearing finding the correct-premise
class does not have (§2). But if light probes are ever revisited for real,
the class to prototype is `LightProbeGridWebGL`, not a manual grid — see §6.

## 2. The hazard a manual grid has that `LightProbeGridWebGL` does not

A plain `THREE.LightProbe` has no spatial selectivity at all.
`WebGLLights.js` sums **every** active `LightProbe`'s SH into one global
term:

```js
} else if ( light.isLightProbe ) {
  for ( let j = 0; j < 9; j ++ ) {
    state.probe[ j ].addScaledVector( light.sh.coefficients[ j ], intensity );
  }
```

Adding all 64 cells of an 8×8 grid to a scene at once would not approximate
a spatial grid — it would blur every cell into one meaningless average, for
every object in the scene, everywhere. `attachNearestProbe(scene, grid,
positionM)` exists specifically to make that failure mode structurally
impossible: it keeps exactly one grid cell attached (tagged
`golfV2LightProbeExperiment` in `userData`) and detaches the previous one
before adding the next. `three-light-probe-experiment.test.ts` regression-pins
this: attaching twice at two different positions still leaves exactly one
`LightProbe` in the scene.

## 3. What was actually measured (headless, this session — real numbers, not a stub)

Everything in this module except `captureLightProbeFromScene` (§5) is plain
math over a synthetic six-canopy-plus-one-structure scene inside hole 7's
real `renderProfile.tacticalBoundsM` (`[-640, 956, -288, 1168]`, from
`src/test/fixtures/course-geometry/compiled-peek-n-peak-upper/`). That made
the core comparison — geometric openness, not an irradiance color a reviewer
would have to take on faith — runnable right now, with no lab, no GPU, no
port 8768:

```
grid: 8 x 8 = 64 probes, directionSamples = 128
reportLightProbeGridCost: probeCount=64 bytesPerProbe=108 totalShBytes=6912
probeOpenFraction over the grid: min=0.8594 max=1.0000 mean=0.9919
bentSkyVisibility over the same flat comparison terrain: min=1.0000 max=1.0000 (exact)
cells with any occlusion at all (probeOpenFraction < 0.99): 17 / 64

Direct samples (not grid-aligned):
  near-trees      [-575, 1006, 2.5]  probeOpenFraction = 0.3281
  near-structure  [-400, 1100, 2.5]  probeOpenFraction = 0.6719
  open            [-340,  966, 2.5]  probeOpenFraction = 1.0000
buildLightProbeGrid() wall time: 1.03 ms (this machine, JS only — not a device number)
```

Reproduce with `node_modules/.bin/tsx` against a throwaway script importing
`buildWoodedStructureScene`, `buildLightProbeGrid`, `buildFlatBentSkyBaseline`,
`compareToBentSky`, `estimateProbeAtPosition`, `reportLightProbeGridCost` from
the module — the exact calls made are in
`three-light-probe-experiment.test.ts`'s `compareToBentSky` and
`estimateProbeAtPosition` suites.

**Reading it (compare fractions, not colors):**
`bentSkyVisibility` is exactly 1.0 everywhere because `compileSkyField` only
ever sees `flatComparisonTerrainGrid`'s height field (flat, by construction
— §70's bent-sky ambient is real, terrain-relief-driven signal that this
comparison deliberately does not reproduce, so it cannot be credited to the
probe grid). The probe grid's `openFraction` is the same 0–1 "how much sky
can this point see" quantity, from ray-vs-occluder tests instead of a
horizon march, and it **does** drop where bent-sky cannot: 0.33 in the
canopy cluster, 0.67 next to the structure. That gap is the entire value
proposition §74 asks about, isolated from any color choice.

**A second finding, not anticipated going in:** the regular 8×8 grid's own
minimum (0.86) is far less dramatic than the direct in-cluster sample
(0.33), because no grid point lands inside the 18×24 m tree cluster — the
nearest cell is tens of meters away. This is structural, not bad luck in
this scene's placement: at 352×212 m over 8×8 cells the spacing is ≈50×30 m,
so a point anywhere in the domain can sit up to ≈25 m/15 m from its nearest
grid cell — an order of magnitude larger than the 4.2 m canopy radius that
would need to contain that cell for the grid to "see" it. A "low-resolution
grid" (§74's own words) will alias past most wooded pockets this size at
this resolution, not just this particular cluster; it argues against a
fixed, small grid resolution being a reliable indicator of enclosure
anywhere it hasn't been deliberately centered on the feature of interest.

## 4. What was not measured (needs a browser + GPU; not run this session)

Per this task's workspace rules, no capture script was run and nothing
touched port 8768. Two things need a real device/browser and are left for
the controller:

1. **Visual A/B.** No lab view exists to flip between "bent-sky only" and
   "bent-sky + attached probe" (`terrain-debug.ts` is Task 24's file; this
   task cannot wire itself in, same limitation Task 22 records). Paste this
   into the browser console on the existing `v2-world` lab view
   (`?debug=v2-world`, hole 7) once a `THREE.Scene` and a lit structure/tree
   material are reachable from it. This session never touched the running
   lab or port 8768, so the import specifier is illustrative — Vite serves
   `.ts` sources directly, so a path-based dynamic `import()` should work
   unmodified or close to it, but adjust it to however the dev server
   actually serves `src/components/golf/course-geometry/`:

   ```js
   const mod = await import('/src/components/golf/course-geometry/three-light-probe-experiment.ts');
   const scene = mod.buildWoodedStructureScene();
   const grid = mod.buildLightProbeGrid(scene);
   // `world` = the running THREE.Scene; `material` = a MeshStandardMaterial
   // on a structure or hero-tree mesh you want to compare — pick coordinates
   // from `scene.structure.centerM` or `scene.trees[0].positionM`.
   const probe = mod.attachNearestProbe(world, grid, [scene.structure.centerM[0], scene.structure.centerM[1], 2.5]);
   // Toggle by removing it again:
   // mod.detachManagedProbe(world);
   ```

   **This alone will not visibly update the canvas.** The renderer is
   event-driven with no continuous render loop (constraint 12) — this is
   exactly why the CSM benchmark's own script nudges the lab's Yaw slider to
   force fresh frames (`csm-benchmark.md` §4 "Sample size"). After attaching
   or detaching the probe, nudge the same slider (or whatever the lab
   exposes as its own redraw/dirty trigger) before looking. Attaching or
   removing a `LightProbe` also changes the affected material's light count,
   which forces a three.js shader recompile on its next render — treat that
   first post-nudge frame as warm-up and judge the comparison on the frame
   after it, the same "first sample is not signal" rule the CSM protocol
   already uses. Judge: does the lit material read as noticeably more
   enclosed/tinted with the probe attached than with bent-sky ambient alone,
   on that settled frame? §74's own bar is "obvious depth", not a
   measurable-but-subtle shift.

2. **Real bake cost.** `captureLightProbeFromScene(renderer, scene,
   positionM)` is wired to a real `THREE.CubeCamera` +
   `LightProbeGenerator.fromCubeRenderTarget`, guarded to return `null` with
   no renderer (never exercised in tests for exactly that reason). Time 64
   sequential calls (one 8-cubemap-face render each) against a real scene on
   a target device, and record whether that bake fits inside a hole-load
   budget or needs to run once and cache — this module does not cache or
   batch the real path, on purpose, since caching an unmeasured technique's
   output was not asked for.

## 5. Cost: bytes are not the objection

`reportLightProbeGridCost`: **108 bytes/probe, 6.9 KB for an 8×8 grid, ≈124
KB for 18 holes at the same resolution** — against §94's 10 MB field-texture
target, that is noise (≈1.2%), not a reason to reject.

`LightProbeGridWebGL` (§1) is not measured by this module (its bake needs a
renderer this experiment never uses), but its atlas size is computable from
`LightProbeGridWebGL.js` directly: `_ensureTextures()` allocates
`WebGL3DRenderTarget(nx, ny, 7*(nz+2))` at `RGBAFormat`/`FloatType` (16
bytes/texel). For an 8×8-probe grid, depth (`nz`) resolution changes it a
lot: `nz=2` (the class's own minimum) is `8×8×7×4×16 = 28,672 B ≈ 28.7 KB`;
`nz=8` is `8×8×7×10×16 = 71,680 B ≈ 71.7 KB`. Baking also needs the shared
`_batchTarget` (`9 × totalProbes × 16` bytes — 18.4 KB at `nz=2`, 73.7 KB at
`nz=8`, bake-time-only) and, if `bounces>0`, a second atlas-sized
`_bounceTarget` clone that persists alongside the live atlas. All of these
are still noise against §94's 10 MB — do not let a future reader conclude
bytes were the problem for either class. The real costs:

- **No spatial selectivity in the class this task built** (§2) — a
  production integration would need `attachNearestProbe`-style region
  bookkeeping (which mesh/camera is "in" which cell, when to swap) that this
  experiment does not attempt to make robust at scale.
- **Baking needs a live `WebGLRenderer`.** This repo's precompile pipeline
  (`compile-visual-artifact-v2.ts` and `scripts/golf/course-geometry/compile-display-lods.mts`)
  runs under `tsx` in Node with no headless-GL dependency installed (the
  same honest gap Ruling R8 records for GLB/KTX2 tooling). Neither the
  manual grid nor `LightProbeGridWebGL` can be produced by today's
  precompile step without new tooling; either would have to bake at
  runtime, which competes with hole-load time and conflicts with
  constraint 22's "precompiled whenever possible."
- **Grid aliasing** (§3): a low-resolution grid can miss the exact pocket
  that would have benefited from it.
- **Unclear value for a largely outdoor course** — §74's own words, and §3's
  own numbers back it up: 47/64 cells (73%) showed no occlusion signal at
  all on a hole-scale synthetic scene with real wooded/structure features
  present.

## 6. Recommendation: reject for the V2 production path

§74 puts the burden on keeping it: "Keep if it creates obvious depth not
already achieved by sky visibility/bent normal." No visual A/B was run this
session (§4) — that is not "inconclusive, lean keep"; absent that evidence,
the default is reject, same as any other unproven premium effect (constraint
21: "every expensive effect needs a measurable fallback" — bent-sky-only is
that fallback, already shipping, already free).

**Reject the manual `THREE.LightProbe` grid outright, regardless of any
future visual result** — §2's summing hazard makes it unsound as a spatial
technique at any grid resolution without rebuilding the region-bookkeeping
this experiment deliberately did not harden.

**Do not build against it going forward.** If light probes are revisited,
prototype `LightProbeGridWebGL` instead (§1) — it removes the summing
hazard and needs no per-material shader wiring — but budget for: a
headless-GL or in-browser bake step this repo does not have today, and a
real visual A/B on the exact §4 checklist before spending further time.

**The measurement that would overturn this:** run §4's snippet on hole 7's
actual forest-edge-v2 tree instances and a real structure mesh (not this
experiment's synthetic 6-canopy scene) once forest-edge-v2 is stable enough
to borrow from without editing it, and get a "yes, obviously more enclosed"
from a reviewer looking at the rendered frame, not just the openFraction
numbers in §3 (which already show the effect exists geometrically — the
open question is whether it is *visible*, not whether it is *present*).

## 7. Decision checklist (§74)

- [x] Built a low-resolution grid (8×8, configurable) over a wooded/structure
      test scene, from `THREE.LightProbe` + `LightProbeGenerator`, per R9.
- [x] Compared against bent-sky ambient (`terrain-sky-field.ts`) on the
      same 0–1 openness scale, not an arbitrary color delta (§3).
- [x] Measured cost: exact SH bytes (§5), grid build wall time (§3),
      corrected the class-availability premise this task's brief cites (§1).
- [ ] Visual "obvious depth" judgment on a real rendered frame — not run
      this session (§4); pending the controller.
- [ ] Real device/GPU bake timing for `captureLightProbeFromScene` — not run
      this session (§4); pending the controller.
- [x] **Recommendation recorded: reject for V2 production**, with the
      specific overturning measurement named (§6), per §74's "may be
      rejected" and Ruling R9's "result must be measured and may be
      rejected."
