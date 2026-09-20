<!-- markdownlint-disable MD013 -->
# Course 3D system — handoff (front to back)

Written 2026-09-20 on `agent/course-factory-c`. This is an orientation map:
it names where everything lives and which document owns each part. It does
not replace those documents.

| Question | Authority |
| --- | --- |
| How does each pipeline script run, with real commands | `scripts/golf/course-geometry/README.md` |
| Feature contract (what the app may do, gates, risks) | `memory/features/shot-tracking.md` (registry route for `scripts/golf/course-geometry/**`, `course-geometry/catalog/**`, `src/components/golf/course-geometry/**`) |
| Factory design (DAG, fingerprints, ledger, blocker codes) | `docs/plans/2026-09-19-course-geometry-factory-v2.md`, `docs/plans/2026-09-19-course-geometry-factory-v2-next.md` (PR A–H roadmap) |
| Build log of what was actually built, with evidence | `docs/plans/2026-09-19-course-geometry-factory-v2-review.md` |
| Player-view / outside-world spec and its sign-off | `docs/plans/2026-09-16-outside-world-status.md`, `docs/plans/2026-09-16-outside-world-review-prompts.md` |
| Visual system (Meridian) plans and status | `docs/plans/2026-09-16-meridian-v2-master-plan.md`, `docs/plans/2026-09-16-meridian-visual-master-plan-status.md`, `docs/plans/2026-09-16-fidelity-status.md`, `docs/plans/2026-09-16-renderer-redesign-status.md` |
| Library scale-out (which courses, in what order) | `docs/plans/2026-09-19-course-library-scale-out-plan.md` |
| Original course-geometry design | `docs/plans/2026-09-12-golfhelm-course-geometry.md` |

"One-Tap" is the product name of the live 3D round
(`src/lib/golf/one-tap/`, flag `peek_n_peak_one_tap_v1`). The build chain
that feeds it is the same whether you call it the one-shot build or the
course factory.

## 1. The five layers

```text
catalog  →  factory (DAG + ledger)  →  pipeline scripts  →  lab (Vite, :8768)  →  runtime (Next app, One-Tap)
course-geometry/   scripts/golf/course-geometry/factory/   scripts/golf/course-geometry/*.py|.mts|.cjs
                   course-factory.py                        src/test/fixtures/course-geometry/browser/   src/lib/golf/course-geometry/, src/lib/golf/one-tap/,
                                                                                                       src/components/golf/course-geometry/, public/course-geometry/
```

### 1.1 Catalog — what a course is

`course-geometry/catalog/`

- `facilities/<id>.json` (`golfhelm-facility-v1`): the physical property.
  `originWgs84`, `aoi` (an OSM element id + margin), `sourcePins`,
  `providerPolicy` (`terrain`, `imagery`, `context` provider order),
  optional `knownRenovationAfter`, optional `retained` paths.
- `layouts/<id>.json` (`golfhelm-layout-v1`): one playable 18 (or 9) on a
  facility. `siteIds`, `segments`/`holeOrder`, `routeWayIds` (the OSM
  `golf=hole` ways — a human pin, never guessed), `capabilityTier`,
  `externalBindings.golfCourseIds` (the `golf_courses` rows this layout
  serves), `scorecardProfiles`, `geometry` (`package` + `published` paths
  once checked in), optional `retained` evidence paths.
- `scorecards/<profile>.json` (`golfhelm-scorecard-profile-v1`): one tee's
  par/yards with its provenance (`source.provider`).

Schema and validation: `scripts/golf/course-geometry/factory/catalog.py`
(mirrored for the app in `src/lib/golf/course-geometry/catalog.ts`).
`python3 scripts/golf/course-geometry/course-factory.py intake` writes C0
entries from the usage cohort and the coverage audit.

Today: 12 facilities, 16 layouts (see §7).

### 1.2 Factory — the build engine

`scripts/golf/course-geometry/course-factory.py`, package
`scripts/golf/course-geometry/factory/`:

| File | Role |
| --- | --- |
| `cli.py` | `doctor`, `plan`, `run`, `status`, `why`, `invalidate`, `intake`; `--output <root>`, `--repo-root` |
| `graph.py` | builds the DAG: facility → layout → hole scopes; 29 task ids, 97 nodes for an 18-hole layout |
| `tasks/{facility,layout,hole,aggregate}_tasks.py` | one `TaskSpec` per task: deps, evaluator (inputs, blockers, adoptable artifacts), `impl_files`, settings, retention class |
| `fingerprints.py` | fingerprint = task id + version + impl-file hashes + settings + direct semantic inputs (never the git commit) |
| `planner.py` | state per node: `ready`, `pending`, `cached`, `stale`, `blocked`, `failed`; own blockers outrank a cached success; `why` chains |
| `ledger.py` | SQLite `state.sqlite`: task runs (`running/success/failed/interrupted/blocked`), artifacts, inputs, invalidations |
| `runner.py` | executes ready nodes in order, writes `runs/<id>/report.{json,md}` and one log per task; a `Precondition` closes a run as `blocked` |
| `adapters.py`, `providers.py` | executors plus explicit provider selection: policy order selects a supported adapter; tests inject fakes |
| `context.py` | every path under the output root; adoption of retained (checked-in) evidence; `_current(built, retained)` |
| `lab.py` | is the lab listening, is this hole served, capture verdicts |
| `imagery.py` | `knownRenovationAfter` vs capture dates |
| `osm.py`, `intake.py`, `disk.py`, `reasons.py`, `report.py`, `model.py` | route proposals, cohort intake, the 8 GB reserve, reason texts, renderers, dataclasses |

Output root (disposable, never committed): `output/course-geometry/factory/`

```text
state.sqlite
runs/<run-id>/report.{json,md} + <task>.log
facilities/<facilityId>/{aoi.json, osm/, osm-context/, terrain/<boundsKey>/, naip/<boundsKey>/}
layouts/<layoutId>/{routes.json, scorecard.json, candidates/, package/normalized.json, canopy-review.json,
                    compiled-base/, compiled/ (asset-manifest.json + <layout>-NN-terrain.json[.gz] + -report.json),
                    context/<layout>-context.json + -context-report.json, imagery-review/, imagery-review.json,
                    world/holes/<holeKey>/, terrain-summary.json, review-queue.json, capability-report.json,
                    visual/ (canaries + sheets), player/ (captures + sheets), publish-verification.json}
research/s1m-coverage.{json,md}
```

Task order (facility → layout → hole → aggregates):

```text
catalog.validate → facility.aoi.resolve → facility.osm.snapshot, facility.context.snapshot
layout.identity.resolve, layout.scorecard.validate → layout.routes.resolve → layout.scorecard.compose
→ layout.candidates.compose → layout.terrain.acquire → layout.canopy.derive → layout.package.compose
→ layout.package.validate → layout.terrain.base → hole.terrain.compile ×18 → layout.context.classify
→ layout.imagery.audit → hole.world.build ×18 → layout.terrain.aggregate, layout.world.aggregate
→ hole.visual.canary ×18 → layout.visual.aggregate → hole.player.capture ×18 → layout.player.aggregate
→ layout.review.queue → layout.review.compose → layout.publish.prepare → layout.publish.verify
→ layout.capability.evaluate
```

Rules the factory enforces: it never writes `src/`, `public/`, flags or a
retained path; every executor writes under the output root; heavy tasks
stay above `COURSE_FACTORY_DISK_RESERVE_GB` (8); a facility's OSM extract
is immutable once retained (a re-fetch is a new revision); one bounded
Overpass request per facility revision.

### 1.3 Pipeline scripts — what each executor wraps

All under `scripts/golf/course-geometry/`. Python needs GDAL/numpy/shapely
(`requirements-terrain.txt`); TS scripts run through `node_modules/.bin/tsx`.

| Stage | Script | In → out |
| --- | --- | --- |
| OSM golf extract | `fetch-osm-course.py` | facility card (bbox) → `overpass.json.gz` + `manifest.json` (retained, immutable) |
| OSM context extract | `fetch-osm-context.py` | same shape, the non-golf world around the course |
| Package | `prepare-osm-course.py` (`--canopy-review`, `--traces`, `--routes`) | extract + scorecard → `normalized.json` (`golfhelm-course-geometry` package, `contentHash`) + association report |
| Terrain source + meshes | `compile-course-terrain.py` (`--acquire-only`, `--holes`, `--context`), with `elevation_raster.py`, `fetch-terrain-pilot.py`, `prepare-pilot.py`, `course_crs.py` | 3DEP native-1 m tile → `source-manifest.json`, `elevation.tiff`; per hole `<layout>-NN-terrain.json.gz` + `-report.json`, `asset-manifest.json` (`course-terrain-v4`) |
| Canopy | `derive-canopy-naip.py` (`measure-canopy-rerun.py`, `report-unexplained-naip.py`) | NAIP 4-band export (FPAC `conus_naip`) → `canopy-review.json` (tree groups the package merges as `woods`) |
| Outside world | `prepare-context-layer.py` with `src/lib/golf/course-geometry/context-rules.json` | both extracts + compiled footprints → `<layout>-context.json` (`golfhelm-context-layer-v1`) + `-context-report.json` (uncertain share per hole) |
| Imagery review | `review-course-imagery.py` | package + NAIP → contact sheet + `imagery-review.json` (bunker sand shares) |
| Physical world + truth gate | `build-course-world.py`, `compile-physical-world.py`, `course-truth-gate.py`, `vectorize-terrain.py` | per hole study → physical world → truth verdict → GLB; `course-world-manifest.json` |
| Visual artifacts (Meridian v2) | `compile-visual-artifacts-v2.mts`, `compile-display-lods.mts`, `export-v2-glb.mts`, `validate-v2-budgets.mts` | display meshes, LODs, budgets |
| Human review kit | `build-qgis-review-kit.py`, `apply-review-adjustments.py`, `build-context-prompt-sheet.py` | QGIS project + sidecar → reviewed package |
| Captures | `capture-visual-canaries.cjs` (`--presets=Top,Terrain,Side --viewports=390x844,…`), `capture-player-view.cjs` (`--viewport=phone` or `desktop`, `--view=terrain`, `top` or `green`), `build-canary-sheet.py`, `build-player-sheet.py`, `compare-canaries.mts`, `diff-visual-canaries.py` | PNGs + JSON (draw calls, triangles, `terrainHash`) + sheets |
| Publish | `publish-course-assets.mts --course=<layout> --out=public/course-geometry` | compiled fixtures → `public/course-geometry/<layout>/` (a source change; ships only by deploy) |
| Research (read-only) | `research-s1m-coverage.py`, `audit-library-coverage.py`, `audit-course-cohort.py`, `fetch-nc-*-study.py` | reports under `output/…/research/` |

### 1.4 Lab — the local renderer

- Server: `npx vite --config scripts/golf/course-geometry/browser.config.ts`
  on `127.0.0.1:8768`. Root is `src/test/fixtures/course-geometry/browser/`;
  `public/` is the Vite public dir. Real app components, inert adapters
  (`supabase.ts`, `offline-provider.tsx`, `navigation.ts`, `dynamic.tsx`,
  `link.tsx`, `image.tsx`); server actions are stubbed by the
  `isolate-server-actions` plugin. Never imported by Next.
- Entry: `browser/main.tsx`. URL params: `?course=<key>` (unknown → cacapon),
  `?hole=N`, `?onetap` (+ `&bar`, `&mode=competition`, `&world=v2`),
  `?matrix` (course matrix), `?lab` (Meridian lab), `?play`,
  `?export=top`, `terrain` or `side` (terrain export presets), `?study=bryan` or `cardinal`.
  Fixtures: `one-tap.tsx`, `course-matrix.tsx`, `meridian-lab.tsx`,
  `play-round.tsx`, `terrain-export.tsx`, `source-study.tsx`.
- Registry: `browser/fixture-assets.ts` — `compiledCourses` is a static
  map. **Committed today: `cacapon` (pilot package) and
  `peek-n-peak-upper`** (with its context layer). A course is drawable in
  the lab only when its compiled directory
  `src/test/fixtures/course-geometry/compiled-*/` and package JSON are
  checked in and listed here. The loader refuses a hole the manifest does
  not list and caps asset sizes (2 MB compressed / 8 MB decoded).
- Capture scripts drive the lab with Playwright and write `terrainHash`
  (= the mesh `contentHash` the canvas drew) into each capture's JSON.

The factory's "served" fact (`factory/lab.py: served`) has four conditions:
`compiled-*/asset-manifest.json` exists, its `geometryHash` equals the
factory's package hash, the fixture package `contentHash` equals it, and the
hole is listed. Otherwise a capture node blocks with
`LAB_COURSE_NOT_SERVED` naming both hashes; a lab that is not listening is
`LAB_NOT_LISTENING`. Rule of the house: never edit `src/` while a capture
runs against :8768 (Vite HMR would change what the capture measures).

### 1.5 Runtime — how a player sees it

- Eligibility: `src/lib/golf/course-geometry/course-registry.ts`
  (`COURSE_GEOMETRY_REGISTRY`, `PEEK_N_PEAK_UPPER_POLICY`) +
  `course-policy.ts` (`courseGeometryEligibility`: right product course,
  exact approved package hash). An unlisted course resolves to null and
  makes zero geometry requests.
- Loading: `src/components/golf/course-geometry/use-course-geometry.ts`
  → `src/lib/golf/one-tap/course-assets.ts` (`manifestUrl`,
  `loadCoursePackage`, `loadHoleTerrain`; network-first manifest,
  cache-first assets in the Cache API, prune to the current version).
  Assets: `public/course-geometry/<layout>/manifest.json`
  (`courseId`, `geometryVersion`, `packageUrl`, `terrainByHole`,
  `contextLayerUrl`), each file named with its own content hash.
- Parsing/validation: `src/lib/golf/course-geometry/schema.ts` (package),
  `terrain.ts` (`parseTerrainMesh`, hash-locked to the package),
  `context-layer.ts` (`parseContextLayer`).
- Rendering: `src/components/golf/course-geometry/CourseTerrainCanvas.tsx`,
  `CourseHoleScene.tsx`, `HoleSceneFrame.tsx`, `three-world-v2.ts`,
  `three-world-v2-objects.ts`, `three-context.ts`, `TerrainCanopyLayer.tsx`,
  `CourseShotOverlay.tsx`; engine modules in
  `src/lib/golf/course-geometry/` (`three-renderer.ts`, `build-scene.ts`,
  `tracking-scene.ts`, `terrain-material.ts`, `ground-shader-v2.ts`,
  `green-surface-v2.ts`, `forest-edge-v2.ts`, `camera*.ts`,
  `render-quality.ts`, `v2-budgets.ts`, …).
- The product: `src/components/golf/one-tap/OneTapPlayerScreen.tsx` and
  `use-one-tap*.ts`, engine in `src/lib/golf/one-tap/` (location, anchors,
  lie, competition policy, `peek-n-peak-policy.ts`).
- Gate: `config/feature-flags.yml` `peek_n_peak_one_tap_v1` — off in
  production, on in preview (the owner's on-course pilot surface). Turning
  it on selects the tracker screen for eligible Upper rounds only.
- Round pages that consult it: `src/app/golf/(dashboard)/dashboard/rounds/{new,continue/[id],[id]/review}`.

## 2. The hash chain (the spine)

```text
package contentHash  (prepare-osm-course.py → normalized.json)
   = manifest.geometryVersion            public/course-geometry/<layout>/manifest.json
   = asset-manifest.json geometryHash    compiled meshes were cut against this package
   ⊃ per-hole mesh contentHash           asset-manifest.holes[<holeKey>].contentHash = terrain file
   = canvas dataset terrainHash          what the renderer actually drew (captures verify this)
   = context layer packageHash           the outside world is locked to the same package
   = terrain source-manifest packageHash the 3DEP tile records every package it served
```

Every stage refuses the previous one's output if the hash does not match:
the compiler refuses another package's tile, the app refuses a mesh for
another package, the lab refuses an unlisted hole, `layout.publish.verify`
fails on any published byte whose hash is not in the evidence. An edit to
hole N's OSM changes the package hash, and the factory's per-hole
subhashes (`hole-subhashes.json`) rebuild only hole N plus aggregates.

## 3. Worked example — Peek'n Peak Upper, catalog to phone

The only layout that has been through the whole chain.

1. Catalog: `course-geometry/catalog/facilities/peek-n-peak.json`,
   `layouts/peek-n-peak-upper.json` (`routeWayIds` pinned; `retained`
   names every checked-in evidence path), `scorecards/peek-n-peak-upper-official.json`.
2. Retained sources (checked in):
   `src/test/fixtures/course-geometry/sources/peek-n-peak-upper-osm/`,
   `…-osm-context/`, `…-terrain/` (3DEP `USGS one meter x60y466 NY Southwest East 2017`, EPSG:32617, 1 m).
3. Package: `src/test/fixtures/course-geometry/peek-n-peak-upper.json`
   (`contentHash fdec6ea8…`, approved 2026-09-16), canopy review
   `peek-n-peak-upper-canopy-review.json`, imagery review
   `peek-n-peak-upper-imagery-review.json`, context layer
   `peek-n-peak-upper-context.json` + `-context-report.json`.
4. Meshes: `src/test/fixtures/course-geometry/compiled-peek-n-peak-upper/`
   (18 holes, `course-terrain-v4`, ~0.6 MB gzip each).
5. Published: `public/course-geometry/peek-n-peak-upper/{manifest.json,
   package-fdec6ea8467d.json, context-2ff18c09bcf5.json, terrain/…}`.
6. Factory view of it: `python3 scripts/golf/course-geometry/course-factory.py plan --layout peek-n-peak-upper`
   → 97 nodes cached (adopted from the retained paths), `layout.publish.verify`
   21/21 checks, earned tier C2.
7. Sign-off captures (2026-09-20 `run-20260920T000117-8f5472`): 216 canary
   captures at 5–10 draws (budgets 140–180) and 72 player captures at 5–15 draws,
   0 page errors; uncertain-share gate passes 1 of 18 holes (a property of
   the retained context report, moved only by the §39 human pass).

Manual equivalent of steps 2–5 with real commands: README §"Whole-course
build (Peek'n Peak Upper)".

## 4. Gates and what earns what

- **Truth gate** (`course-truth-gate.py`, per hole in `hole.world.build`):
  unreviewed OSM boundaries fail by design; a course-familiar review records
  boundary uncertainty before anything is called true.
- **Uncertain-share gate** (context report, outside-world spec §39): a hole
  passes at ≤ 15 % uncertain outside-world area; failures are findings for
  the human context pass, never a build failure.
- **Draw-call budget** (Meridian §106, `RENDER_BUDGETS.drawCalls` in `src/lib/golf/course-geometry/render-quality.ts`: top 140, terrain 180, side 160); a breach is a
  `visual_signoff` finding.
- **Capture verdict**: the capture report, not the script exit code —
  `CAPTURE_REPORT_MISSING`, `PAGE_ERRORS`, `CAPTURE_MISSING`,
  `CAPTURE_MESH_MISMATCH` fail the hole; breaches and gate failures do not.
- **Imagery currency**: imagery flown before `knownRenovationAfter` blocks
  `layout.imagery.audit` (`IMAGERY_TOO_OLD_FOR_KNOWN_RENOVATION`).
- **Review queue** (`layouts/<layout>/review-queue.json`), the six human
  passes: `route_confirmation`, `imagery_currency`, `imagery_review`,
  `context_review`, `visual_signoff`, `boundary_review`.
- **Capability tiers** (`capability-report.json`, derived, never asserted):
  C0 catalog entry · C1 package + 18 meshes compiled · C2 published
  (`layout.publish.prepare` adopted) · C3 boundary review + imagery review +
  truth gate all passed · C4 field verification. The catalog's declared
  tier is compared with the earned one.
- **Publishing / production**: `PUBLISH_NOT_APPROVED` until the owner
  approves a package hash; publishing is a PR; the flag decides exposure;
  production deploys are owner-run (`scripts/deploy-prod.sh`).

## 5. Where evidence and outputs live

| Kind | Path | Committed? |
| --- | --- | --- |
| Retained sources and reviews | `src/test/fixtures/course-geometry/…` | yes (fixtures) |
| Pilot scorecards, traces | `scripts/golf/course-geometry/pilots/` | yes |
| Published player assets | `public/course-geometry/<layout>/` | yes |
| Factory builds, ledgers, runs, captures | `output/course-geometry/factory/` | no (disposable) |
| Study sheets and evidence images | `docs/plans/assets/course-factory-2026-09-20/` | yes |
| Unit tests (Python, run from `scripts/golf/course-geometry`) | `test_factory_*.py` (88), `test_compile_course_terrain.py` (25), `test_derive_canopy_naip.py` (6), `test_research_s1m_coverage.py` (8), `test_compile_physical_world.py`, `test_course_truth_gate.py`, `test_apply_review_adjustments.py` | yes |
| Unit tests (vitest) | `src/lib/golf/course-geometry/__tests__/` (56 files), `src/components/golf/course-geometry/*.test.ts(x)`, `src/lib/golf/one-tap/__tests__/` | yes |

Commands:

```bash
cd scripts/golf/course-geometry && python3 -m unittest discover -p 'test_factory*.py'   # network-free
F=scripts/golf/course-geometry/course-factory.py
python3 $F doctor; python3 $F plan --layout <layout>; python3 $F why --layout <layout> --task <task> [--hole N]
python3 $F run --layout <layout> [--until <task>] [--dry-run]; python3 $F status --layout <layout>
npx vite --config scripts/golf/course-geometry/browser.config.ts   # the lab on :8768
node scripts/golf/course-geometry/capture-player-view.cjs --course=peek-n-peak-upper --hole=7 --viewport=phone --view=terrain --out=/tmp/h7.png
```

## 6. Branch and PR state (2026-09-20)

Stack, merged in this order: `#1939` (`agent/golf-course-geometry` → main,
owner-only landing) → `#1949` PR A (`agent/course-factory-a`) → `#1950`
PR B (`agent/course-factory-b`, factory runtime) → `#1951` PR C
(`agent/course-factory-c`, draft: canopy gate, UTM zone, named hole series,
sign-off captures, publish verify, imagery currency, S1M spike). Required
main checks: CI aggregate, Review Gate aggregate, Analyze, block-historical-edits.

## 7. Current library state

16 catalog layouts; six have 18/18 holes compiled.

| Layout | Facility | State | Root blocker |
| --- | --- | --- | --- |
| peek-n-peak-upper | peek-n-peak (NY) | C2, published, captures signed off by machine | §39 human pass, boundary review |
| winchester-cc | winchester-country-club (VA) | C1 (factory build, output root) | lab not serving; publish approval |
| forsyth-country-club | forsyth-country-club (NC) | C1 | same |
| grande-dunes-resort-club | grande-dunes-resort-course (SC) | C1; canopy suspect (5 groups) | same |
| cacapon | cacapon (WV) | C1 factory rebuild (pilot package is what the lab serves) | same |
| big-blue-course-uk | university-club-of-kentucky (KY) | C1; routes proposed (`osm_ref_named`) | route confirmation |
| boonsboro-cc | boonsboro-country-club (VA) | C0 | `ROUTE_WAY_IDS_REQUIRED` (OSM has no hole ways; NAIP sheet in `docs/plans/assets/course-factory-2026-09-20/`) |
| pga-national-champ | pga-national-resort (FL) | C0 | `ROUTE_WAY_IDS_REQUIRED` |
| cutter-creek, starmount-forest, the-cardinal, cc-of-landfall-nick-{m-o,o-p,p-m} | NC facilities | C0 | terrain adapter selected (`nc_onemap_dem03`); package, source acquisition and human review remain |
| cc-of-landfall-marsh-9, cc-of-landfall-ocean-9 | landfall-country-club-golf-course (NC) | C0 | `HOLE_COUNT_UNSUPPORTED` (9-hole segments) |

The four factory builds were made before the UTM-zone change to
`prepare-osm-course.py`; the plan marks their `layout.candidates.compose`
stale, so a rebuild recomposes their packages.

## 8. Known gaps and owner decisions

1. **Lab serving for factory-built courses** — the lab registry is
   checked-in code, so a factory build cannot be looked at without a
   fixture retention step or a dev-only lab source. This is why the
   2026-09-20 screenshots of Winchester/Forsyth/Grande Dunes/Cacapon were
   made from *temporary, uncommitted* copies under
   `src/test/fixtures/course-geometry/` plus local edits to
   `browser/fixture-assets.ts` and `browser/main.tsx`; they are not part
   of any commit.
2. Landing `#1939`, then the factory stack.
3. §39 human context pass and boundary review on the Upper (C3).
4. Route pins: Kentucky confirmation; Boonsboro and PGA National way ids or
   drawn tee→green routes (proposed `retained.routeTraces` format in the
   review doc).
5. **NC terrain adapter is now wired** — `nc_onemap_dem03` acquires one
   native 3.125-US-survey-foot DEM03 export under the standard immutable
   manifest contract and converts its declared raw vertical unit to metres.
   It retains unknown vertical datum and redistribution terms as review
   blockers, so it enables C1 source candidates but not C3/production truth.
   S1M remains research-only: Cutter Creek has real 2014–2020 lidar while
   Greensboro's S1M tiles are 2003–04 NED at 3 m resampled to 1 m, with an
   unresolved roughly 1 m horizontal difference from current 3DEP exports.
6. 9-hole layout support in the DAG (Landfall Marsh/Ocean).
7. Human OSM pins for the cohort courses the intake skipped (Bryan Park,
   River Landing, Pinehurst No. 8, Magnolia Greens, Forest Oaks).
8. Provider selection and acquisition now have a small shared contract
   (`factory/providers.py` and `compile-course-terrain.py --provider`).
   Provider discovery, independent registration validation and a retained
   per-facility source bundle remain the next scale-out layer.

## 9. Operating rules that bit people

- Never edit `src/` while a capture runs against :8768.
- Keep `output/` uncommitted; stage explicit paths; the factory never
  writes `src/` or `public/`; publishing and flags are PRs; production
  deploys are owner-run.
- Disk reserve 8 GB (`COURSE_FACTORY_DISK_RESERVE_GB`); a NAIP export or a
  3DEP tile is a few hundred MB; an S1M tile is 300–430 MB (range-read it,
  never download it).
- Python tests run from `scripts/golf/course-geometry`; from the repo root
  they fail to import.
- Doc paths under `memory/` are validated by `scripts/check-doc-path-drift.mjs`;
  write globs (`compiled-*/`), not angle-bracket placeholders.
- After editing a mapped feature doc: `npm run knowledge:doc-inventory`,
  then `npm run knowledge:check` and `npm run markdown:ratchet`.
