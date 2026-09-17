# Peek'n Peak Upper: how the course was built

Build log for the first whole-course run of the GolfHelm course-geometry
pipeline, September 15–16, 2026. Written by the Claude session that did the
work, for the owner. It records what was used, in what order, what broke, how
each break was fixed, and what is still not true about the result.

Branch: `agent/golf-course-geometry` (PR #1939), worktree
`/Users/ricknini/worktrees/helmv3/golf-course-geometry`. My commits on the
branch are `a263c3e10`, `4eb76aa40` and `95792455e`; everything before them
is Codex's earlier work that I built on.

---

## 1. What exists at the end

| Thing | Where | State |
| --- | --- | --- |
| Course package (18 holes, 300 features) | `src/test/fixtures/course-geometry/peek-n-peak-upper.json` | hash `fdec6ea8…`, status `source_candidate` |
| Preparation report | `…/peek-n-peak-upper-review.json` | association, canopy, traces, scorecard, limitations |
| Canopy review | `…/peek-n-peak-upper-canopy-review.json` | 144 groups, method and thresholds recorded |
| Imagery dossier | `…/peek-n-peak-upper-imagery-review.json` | 63 bunkers scored, per-hole route coverage |
| Terrain source | `…/sources/peek-n-peak-upper-terrain/` | USGS 3DEP 1 m export, manifest, per-hole display surfaces |
| Compiled meshes | `…/compiled-peek-n-peak-upper/` (90 MB) | 18 holes, JSON + gzip, per-hole reports |
| Blender world | `output/course-geometry/peek-n-peak-upper-world/` (164 MB, ignored) | GLB + preview per hole, truth-gate verdicts |
| Browser bundle | `output/course-geometry/browser-build/` (48 MB, ignored) | Vite build, ready for `vercel deploy` |
| Plan section | `docs/plans/2026-09-12-golfhelm-course-geometry.md` §26 | numbers, links, remaining gaps |
| Scripts README | `scripts/golf/course-geometry/README.md` | reproduction steps |

Both views work in the dev harness on a phone-sized viewport: the 2D entry
card (SVG) and the 3D terrain landscape with trees, for every hole, with a
"Green" flag on each green. Play mode (`?play=1&course=peek-n-peak-upper`)
drives the real `FairwayShotTracking` screen hole by hole with shots saved in
the browser only.

The live Vercel URL still serves Codex's old build. The deploy command is
denied for me by the session's permission classifier, so it needs you:

```
cd /Users/ricknini/worktrees/helmv3/golf-course-geometry/output/course-geometry/browser-build
../../../node_modules/.bin/vercel deploy --yes
```

---

## 2. Starting point and rules

I picked up Codex's worktree for PR #1939. It already had:

- the plan (`docs/plans/2026-09-12-golfhelm-course-geometry.md`, sections
  1–25) and the "Meridian" rules: evidence first, one canonical metric world,
  visuals decorate but never invent truth, provenance and uncertainty are
  shown before pretty pictures;
- the Cacapon Resort proof (a reviewed 18-hole SVG fixture), the NC lidar
  studies, the terrain compiler, the three.js landscape renderer, the shot
  overlay, the putting workspace and the Vite fixture harness;
- `fetch-osm-course.py`, `prepare-osm-course.py`, `compile-course-terrain.py`,
  `normalize-study.py`, `compile-physical-world.py`, `course-truth-gate.py`
  and the Blender scripts, all exercised on one or two holes.

Your direction was: build Peek'n Peak Upper end to end with the tools the plan
names (Blender, GDAL, PDAL, QGIS, mapshaper, NAIP), make the 2D card and the
3D landscape usable on your phone the next day, and treat this course as the
proof that the pipeline scales.

Repository rules I worked under (AGENTS.md): stage explicit paths, push with
`git push -u origin <branch>`, never deploy production without explicit
authorization, keep secrets out of output, keep `output/` uncommitted, retire
worktrees only through `npm run worktrees:*`.

---

## 3. Toolchain

Installed or verified on the build Mac, all free:

| Tool | Version | Used for |
| --- | --- | --- |
| Blender | 5.2.1 | GLB + preview per hole (`blender/generate_hole.py`, `validate_glb.py`) |
| GDAL + `osgeo` Python bindings | 3.13.3 | decoding the 3DEP Float32 GeoTIFF, polygonizing canopy masks, NAIP reads |
| PDAL | current | available for point clouds; not needed for this course (3DEP DEM sufficed) |
| PROJ | 9.9.0 | WGS84 ↔ EPSG:32617 (UTM 17N) via pyproj |
| QGIS | 4.2.2 | manual checks of exports; not in the scripted chain |
| mapshaper | 0.7.61 | available for vector simplification checks; shapely did the scripted simplification |
| ruff | 0.16.7 | Python lint for every script |
| Python libs | numpy 2.5.2, shapely 2.1.2 (GEOS 3.13.1), pyproj 3.7.2, Pillow 12.1.1, scipy, geopandas | classification, geometry, image overlays |
| Node | 22 (root env node, per your instruction) | Vite harness, vitest, eslint, tsc, playwright captures |
| three.js | r186 | 3D landscape in the browser |

The plan named the toolchain; the installs were done in this session because
you asked for it explicitly ("install all the tools the plan says to").

---

## 4. The pipeline, step by step

### 4.1 Identity and scorecard

Site identity comes before geometry. The course is OSM way `136097904`,
"Peek'n Peak Resort — Upper Course", Clymer NY, origin −79.744, 42.06.
The scorecard (pars and yards for 18 holes) lives in
`scripts/golf/course-geometry/pilots/` and is the scoring authority; OSM par
disagreements are kept as source conflicts, never resolved by the map.

### 4.2 OSM plan geometry

```
python3 scripts/golf/course-geometry/fetch-osm-course.py …   # once, retained as immutable gzip + manifest
python3 scripts/golf/course-geometry/prepare-osm-course.py <overpass.gz> <scorecard> <output_dir> [--canopy-review …] [--traces …]
```

Overpass returned 155 features: 18 routes, 36 tees, 16 fairways, 18 greens,
63 bunkers, 4 water. The preparer associates features to holes, builds the
package, and writes `normalized.json`, `association-report.json` and
`source-metadata.json`. Every OSM feature enters as `reviewed: false` with no
recorded horizontal uncertainty, which is why the package is a
`source_candidate` and why every hole fails the truth gate by design.

Two facts drove later work: hole 11 had no fairway way in OSM at all, and
holes 13 and 15 (par 3s) have no fairway polygon either, which is normal.

### 4.3 Terrain: USGS 3DEP one-metre DEM

`compile-course-terrain.py` queries the 3DEP ImageServer for native 1 m
products covering the course bbox, exports to EPSG:32617 on a fixed grid
(2279 × 2656 px, extent 602574–604853 E, 4655918–4658574 N), and retains the
export with a manifest (`source-manifest.json`) that records the selected
product, acquisition dates, vertical datum (NAVD88, metres), decoder, and the
hash of every retained file.

Selected: `USGS one meter x60y466 NY Southwest East 2017` (acquired
2017-04-18 to 2017-05-09). Rejected and recorded: `USGS 1 Meter 17 x60y466
PA_WesternPA_2019_D20`, because it exported 61.5% zero fill (the project
stops at the Pennsylvania line and the course is in New York). The compiler
now exports each candidate newest-first, measures the empty fraction, and
rejects anything above 0.1%.

Per hole, the compiler crops the DEM to the hole's features plus a 160 m
context margin, triangulates, tessellates woods as a material, and writes a
mesh (`peek-n-peak-upper-NN-terrain.json` + `.gz`) with a report. Results:
10,458–28,605 triangles per hole, zero omitted triangles, zero metric nodata
cells, height and normal duplicates in agreement.

### 4.4 Canopy: NAIP four-band imagery

```
python3 scripts/golf/course-geometry/derive-canopy-naip.py <package> <terrain_source> <naip_dir> <canopy-review.json>
```

USDA NAIP (0.6 m native, tiles captured 2024-05-24 and 2024-08-24) is
exported once at 1 m on exactly the terrain grid so every raster lines up
pixel for pixel. The classifier is intentionally simple and fully recorded:

- NDVI = (NIR − R) / (NIR + R) > 0.28 removes roofs, roads, sand and water;
- NIR standard deviation in a 7 px window > 10.5 separates textured crowns
  from smooth mowed turf;
- every OSM golf surface is masked with a 3 px buffer;
- morphology: open 3×3, close 5×5, drop blobs under 250 px;
- vectorize with GDAL Polygonize, then a 6 m closing and 2 m opening in
  vector space so speckle becomes forest mass;
- clip to each hole's 160 m compile context, simplify 2 m (4 m if a ring
  exceeds 400 vertices), keep parts ≥ 400 m².

Output: 144 per-hole canopy groups, 417 m² to 19.95 ha, 46.9% of the export
is canopy. `prepare-osm-course.py --canopy-review` merges them as reviewed
`woods` features. The reviewer note says exactly what the review was (my
visual comparison of the classification against the same imagery) and that
an independent course review is pending. Groups bound crown artwork only; no
tree height, currentness or obstruction claim.

### 4.5 Imagery review dossier

```
python3 scripts/golf/course-geometry/review-course-imagery.py <package> <naip_dir> <output_dir> <summary.json>
```

New in this build (plan 6.3, 6.4, 13.7). For each hole it draws every package
feature over the NAIP export at 3×, writes an overlay PNG and an 18-hole
contact sheet, and computes:

- per bunker: sand share inside the polygon and in a 6 px ring outside it,
  where "sand" = brightness > 140 and NDVI < 0.12 and (R − B) > 12;
- unclaimed sand blobs inside the hole extent that no bunker polygon covers;
- the share of the played route that crosses a mapped tee, fairway or green.

Bunkers under 0.35 sand share are flagged for a course-familiar reviewer (17
of 63). The thresholds were calibrated on the bunker set itself: bunker
median warmth 24 against pavement 8. Nothing in the dossier moves a polygon
or passes a gate; it is a review aid.

What it showed: OSM outlines register to the imagery within a metre or two
on every hole, OSM fairways stop well short of the mowed corridor on several
holes (7 and 16 clearly), and hole 11 has no fairway at all.

### 4.6 Hole 11 fairway trace

Because rough and fairway are not separable at 1 m by NDVI or texture
(automatic classification found nothing), I traced the mowed corridor by
eye at 3–4× in the NAIP export, anchored to the cart path, the five bunkers
and the green, and wrote the ring as raster pixel coordinates converted
through the NAIP geotransform (origin 602574, 4658574; 1 m pixels;
EPSG:32617) to WGS84. It lives in
`scripts/golf/course-geometry/pilots/peek-n-peak-upper-imagery-traces.json`
with `accuracyMeters: 10`, the tracer note, tile names, dates and raster
hash.

`prepare-osm-course.py --traces` validates the ring, smooths corners by 6 m
(buffer +6, −12, +6, simplify 0.4, reject if area changes more than 15%),
adds the feature as `reviewed: false` with its own source entry
(`naip-trace-2026-09-16`), attaches it to hole 11, and replaces the "No OSM
fairway" gap text. Hole 11 stays `partial` and still fails the truth gate.

### 4.7 Blender world and truth gate

```
python3 scripts/golf/course-geometry/build-course-world.py <package> <terrain_source> <output_dir>
```

For every hole, in order:

1. `normalize-study.py`: canonical local-metre study, 2 m grid, 60 m
   padding; woods are excluded from the crop footprint so canopy never grows
   the metric grid.
2. `compile-physical-world.py`: the physical world from the study.
3. `course-truth-gate.py`: reports each hole; all 18 fail because OSM
   boundaries are unreviewed with no recorded uncertainty and no reviewed
   tee/green endpoint pair backs the hole distance. This is the intended
   outcome for a source candidate.
4. Blender `generate_hole.py`: GLB plus a preview render.
5. `validate_glb.py`: span round trip must be ≤ 0.02 m; measured ≤ 3.5e-5 m.

`course-world-manifest.json` records every hash and verdict and states the
publication rule: GLBs are visual review products only until a hole passes
the gate.

### 4.8 Rendering changes for a whole forested course

The Cacapon proof had sparse trees. Peek'n Peak is 47% canopy, so the crown
system had to be rebalanced without moving any authored geometry:

- `canopySymbols` widens its pattern spacing for large groups (≤ 6,000
  cells, ≤ 600 crowns per group) instead of truncating in scan order.
- `allocateCrowns` shares one budget across groups by pattern size, giving
  leftover crowns first to groups the floor left empty, then by largest
  remainder.
- The 3D landscape keeps the 720 crowns nearest the played hole's surfaces
  (`TREE_LIMIT`); the SVG card keeps 240.
- Near-detail crowns swap in only for 64 m batch tiles within 150 m of the
  camera focus; the renderer re-evaluates when detail level changes or the
  focus moves more than 12 m.
- Palette: the forest floor under canopy groups is a quieter tint of the
  ground, water is muted toward the 2D palette.
- Green reference glyph: every scene now carries a layout-only interior point
  of the green (`greenReferencePoint`), drawn as a flag labelled "Green" with
  an accessible title stating no pin or cup position is known. The estimated
  pin stays gated to `reviewed_draft` packages, so the reference feeds no
  distance, camera or reconstruction.

### 4.9 Harness, captures, play mode, bundle

- Vite harness: `?course=peek-n-peak-upper`, `?matrix=1&hole=N`,
  `/entry?course=&case=around`, `/review?course=&hole=`, `?play=1`.
- `capture-course-matrix.cjs` with `COURSE=peek-n-peak-upper`: 18 holes × 4
  presets (Top, Terrain, Green, Profile) = 72 captures, no page errors, idle
  rendering stopped and canvas released on every hole. The report is copied
  to `docs/plans/assets/course-geometry-2026-09-15/course-matrix-report.json`.
- Play mode persists shots, scores and the current hole in `localStorage`
  for that browser only, keeps the current and next hole's terrain resident,
  and offers a two-tap "Clear round". A scripted run recorded a drive, an
  approach and a made putt on hole 1, advanced to hole 2 with terrain ready,
  and restored "Hole 2 / 18" after reload.
- Bundle: Vite build of the harness into `output/course-geometry/browser-build`
  (48 MB after removing uncompressed terrain JSON), with `vercel.json`
  rewriting every path to `index.html` and `.vercel/project.json` linking the
  side project `golfhelm-course-geometry-interactive`.

---

## 5. Per-hole results

Elevation range is the compile context (hole plus 160 m), not the hole
alone. "Route in mapped" is the share of the played route that crosses a
mapped tee, fairway or green. "Low-sand" counts bunkers flagged under 0.35
sand share. "Unclaimed sand" sums bright sand blobs inside the hole extent
that no bunker polygon covers.

| Hole | Par | Yds | OSM features (tee/fw/gr/bk/water/woods) | Mesh tris | Elev range (m) | Route in mapped | Low-sand | Unclaimed sand m² | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 4 | 409 | 2/1/1/2/2/13 | 21,141 | 497–549 | 0.53 | 0/2 | 640 | pond left of fairway renders well |
| 2 | 4 | 483 | 1/1/1/5/0/15 | 25,214 | 471–543 | 0.50 | 0/5 | 9,040 | large unclaimed sand: adjacent holes' bunkers in the extent |
| 3 | 3 | 201 | 4/1/1/2/1/7 | 15,600 | 463–533 | 0.26 | 0/2 | 1,388 | water carry; 4 tees |
| 4 | 5 | 563 | 2/1/1/4/0/7 | 25,792 | 478–533 | 0.42 | 1/4 | 6,314 | one bunker flagged |
| 5 | 3 | 200 | 1/1/1/1/0/1 | 10,458 | 472–524 | 0.23 | 0/1 | 288 | smallest mesh |
| 6 | 4 | 430 | 2/1/1/3/0/5 | 20,304 | 471–533 | 0.53 | 1/3 | 696 | near-crown Green preset asset |
| 7 | 4 | 400 | 2/1/1/6/0/9 | 21,565 | 453–533 | 0.47 | 0/6 | 519 | OSM fairway stops short of corridor |
| 8 | 5 | 555 | 3/1/1/6/0/15 | 28,605 | 462–543 | 0.42 | 0/6 | 3,385 | largest mesh |
| 9 | 4 | 398 | 2/1/1/2/1/16 | 20,535 | 473–540 | 0.74 | 2/2 | 680 | both bunkers flagged; highest Top draw calls (260) |
| 10 | 4 | 414 | 2/2/1/3/0/7 | 21,450 | 473–547 | 0.58 | 2/3 | 0 | two fairway polygons |
| 11 | 5 | 523 | 1/1*/1/7/0/3 | 27,402 | 481–547 | 0.88 | 4/7 | 28 | *fairway traced from NAIP, ±10 m, unreviewed |
| 12 | 4 | 345 | 2/1/1/3/0/9 | 18,773 | 449–531 | 0.48 | 0/3 | 643 | |
| 13 | 3 | 190 | 3/0/1/2/0/7 | 14,129 | 441–524 | 0.12 | 0/2 | 429 | no fairway (par 3); steepest context |
| 14 | 4 | 439 | 2/1/1/4/0/6 | 19,170 | 452–530 | 0.59 | 3/4 | 365 | three of four bunkers flagged |
| 15 | 3 | 200 | 4/0/1/0/0/6 | 10,791 | 483–537 | 0.15 | 0/0 | 0 | no fairway, no bunkers; 4 tees |
| 16 | 4 | 330 | 2/1/1/4/0/3 | 19,022 | 486–558 | 0.48 | 2/4 | 0 | OSM fairway stops short of corridor |
| 17 | 4 | 403 | 2/1/1/3/0/6 | 16,116 | 507–558 | 0.64 | 0/3 | 0 | most trees placed (578) |
| 18 | 5 | 575 | 1/1/1/6/0/9 | 27,404 | 508–558 | 0.60 | 2/6 | 694 | exceeded study budget until woods were excluded from crop |

Rendering budget across the matrix (package `fdec6ea8`): 311–578 trees per
hole; draw calls 38–260 Top, 36–204 Terrain, 126–309 Green; rendered
triangles ≤ 242k Top, ≤ 261k Terrain, ≤ 719k Green (930k before the focus
rule).

---

## 6. Problems I ran into, and what I did

In the order they happened.

1. **Disk space.** The machine had 24 worktrees and was close to full.
   You told me to free space. I retired parked worktrees through the
   sanctioned `npm run worktrees:*` scripts (raw `git worktree remove` is
   blocked), removed `.next` caches, and left a background guard running that
   deletes `.next` directories in worktrees when free space drops under 8 GB.
   It has to be re-armed every 30 minutes; it is armed now with 21 GB free.

2. **Node environment.** Worktree-local node was wrong; you told me to use
   the root env node. All builds and captures use it.

3. **Pillow mis-decoded the 3DEP GeoTIFF.** The tiled Float32 export came
   back with 3.4 M of 6.05 M pixels wrong (values up to 3e38). I added
   `elevation_raster.py`, which prefers GDAL and records the decoder name in
   the source manifest. GDAL and Pillow agree on the older Cacapon and New
   York exports, so those fixtures stayed byte-identical.

4. **Wrong DEM tile chosen by the catalog.** The newer Pennsylvania 2019
   tile "covers" the bbox on paper but is 61.5% zero fill. The compiler now
   measures empty fill per candidate and rejects above 0.1%, recording the
   rejection. Both "USGS 1 Meter" and "USGS one meter" product titles are
   accepted as native 1 m.

5. **Hole 18 exceeded the normalize-study budget.** Woods polygons were
   growing the crop footprint. `normalize-study.py` now excludes woods from
   the footprint.

6. **Crown allocation test mismatch.** My first allocator gave leftovers in
   index order; the test expected largest-remainder after zero-share groups.
   Fixed the ordering.

7. **Raising `CANOPY_TILE_M` from 64 to 96 broke the Cacapon spatial-batch
   test.** Reverted to 64; the near-detail radius does the work instead.

8. **tsc: `Point3M` passed where `PointM` was expected** in the renderer's
   focus handoff. Passed `[focusM[0], focusM[1]]`. An unused destructured
   `share` became `_`.

9. **Vite `--outDir` resolved relative to the fixture root**, leaving a
   stray `output/` directory under `src/test/fixtures/course-geometry/browser/`.
   Used an absolute path and removed the stray directory.

10. **`vercel deploy` is denied to me.** The permission classifier treats it
    as a production deploy. You also rejected a follow-up cleanup command
    and told me to stop and wait. The bundle is built; the deploy is yours.

11. **`prepare-osm-course.py` takes an output directory, not the package
    path** (FileExistsError when I passed the fixture file). The correct flow
    is to write to `output/course-geometry/peek-n-peak-upper-package` and copy
    `normalized.json` to the fixture, merging the report with the old
    review's `retainedExtract` and `scorecard` keys. The README now says so.

12. **Compiler refused the revised package:** "Output manifest belongs to a
    different package/source." The compiled directory must be emptied for a
    revised package, and the source directory's lock was too strict. The
    source dir now re-stamps `packageHash` when bounds and file hashes match
    and appends the old hash to `previousPackageHashes` (three recorded).

13. **Sand detection over-flagged.** Warmth threshold 22 flagged 38 of 63
    bunkers. Calibrated on the bunkers themselves (median warmth 24 vs.
    pavement 8): warmth 12, brightness 140, flag level 0.35 → 17 flagged,
    which match shadowed or grass-faced bunkers in the overlays.

14. **Automatic fairway classification for hole 11 found nothing.** Fairway
    and first cut are identical at 1 m. Manual trace instead.

15. **My first hole 11 trace was wrong.** You saw it: it started about 90 m
    past the tee and ran into trees. I re-read the imagery at higher zoom
    against the scorecard yardage and the cart path, re-traced from the tee,
    rebuilt package → meshes → world, and verified the Top and Terrain
    captures against the NAIP overlay before showing it again.

16. **Matrix capture waited on the wrong element.** The 3D canvas only
    exists after the "Expand course view" dialog opens; the capture must wait
    for `canvas[data-terrain-state=ready]` with the preset's pitch, as
    `capture-course-matrix.cjs` does.

17. **Two tsc errors in my new layout test** (`null` passed for an optional
    number). Fixed to `undefined`.

18. **"The holes and 3D look like they did before."** The deployed URL was
    Codex's old build; only the dev server had the new work. Same root cause
    as item 10.

19. **Context ran out twice.** The session was summarized and resumed; the
    build state survived because everything is on disk and hashed.

---

## 7. What is verified

- vitest course-geometry suites: 184 tests plus the new green-reference
  test, all passing.
- `tsc --noEmit`: clean. eslint: clean. ruff: clean on every script.
- Python unittests for the compiler, physical world, truth gate and study
  fetchers: 23 OK.
- Matrix capture: 18 holes, 72 captures, zero errors.
- Blender validation: span round trip ≤ 3.5e-5 m on every hole.
- Gitleaks on push: no leaks.
- Imagery overlays: OSM outlines register within a metre or two on every
  hole; hole 11 trace runs tee to green in Top, Terrain and Blender preview.
- Entry card widths 320, 375 and 430 px: no overflow.

Not verified: a real-device capture of play mode (I used a phone-sized
Chromium viewport), and any independent human review of the geometry.

---

## 8. What is still not true

None of these may be closed by drawing.

- No OSM feature has a course-familiar review or a recorded horizontal
  uncertainty. Package status stays `source_candidate`, every hole fails the
  truth gate, and no estimated pin or distance is derived from the geometry.
- No reviewed tee/green endpoint pair per hole.
- The 144 canopy groups and the hole 11 trace were reviewed only by me
  against the same imagery they came from.
- OSM fairways stop short of the mowed corridor on several holes (7, 16 and
  others). Tracing them the way hole 11 was traced is possible but each
  needs the same ±10 m honesty.
- 17 bunkers carry a low-sand flag for a reviewer.
- The Green flag is a layout reference, not a pin. Daily pin, daily tee
  markers and putting break need separate evidence (the terrain mesh is a
  2017 DEM at 1 m, which is not green-surface evidence).
- The Vercel URL is stale until you deploy.

---

## 9. What I learned about the pipeline

- **Retain every raster once, hash it, and align every later raster to the
  same grid.** The terrain export set the grid; NAIP was exported onto it;
  canopy, sand scoring and the trace all share one pixel space. Every
  downstream artifact carries the raster hash, so a stale input is caught,
  not guessed.
- **Catalog coverage is not data coverage.** Measure empty fill on every
  candidate; a tile can cover the bbox and contain nothing.
- **Decoder choice is provenance.** Pillow silently produced garbage
  heights. The manifest now names the decoder.
- **Package hashes ripple.** Any change to the package (one traced polygon)
  changes the hash, and the compiled directory, source manifest, world
  manifest and matrix report all need regenerating. That is correct, but it
  means the compile step must be cheap to rerun and the source lock must
  accept a revised package whose inputs did not change.
- **Rough vs. fairway is not classifiable at 1 m NAIP.** Canopy, sand and
  water are. Fairway extent needs a course-supplied vector, higher
  resolution imagery, or a human trace with a stated band.
- **Calibrate thresholds on the thing you are scoring.** The sand rule was
  wrong until it was tuned against the bunker set and pavement samples.
- **Show the trace against the imagery before showing it to the owner.**
  My first hole 11 trace failed a check you did in seconds by comparing the
  render with the photo and the scorecard yardage.
- **Whole-course forest needs a budget, not a cap.** Truncating crowns in
  scan order leaves straight seams; sharing a budget by group size and
  swapping detail near the camera focus keeps 18 holes under phone limits
  without moving a single authored crown.
- **The harness is the test.** Every visual claim in the plan has a capture
  behind it; the matrix report is the acceptance record.
- **Deploys are not mine to run.** Build the bundle, hand over the command.

---

## 10. Reproduction

From the worktree, in order (paths as used in this build):

```
# 1. Retain the Overpass extract once (immutable gzip + manifest)
python3 scripts/golf/course-geometry/fetch-osm-course.py \
  scripts/golf/course-geometry/pilots/peek-n-peak-upper-scorecard.json \
  src/test/fixtures/course-geometry/sources/peek-n-peak-upper-osm

# 2. Package + association report (output directory; normalized.json becomes
#    the package fixture, association-report.json merges into the review file)
python3 scripts/golf/course-geometry/prepare-osm-course.py \
  src/test/fixtures/course-geometry/sources/peek-n-peak-upper-osm/overpass.json.gz \
  scripts/golf/course-geometry/pilots/peek-n-peak-upper-scorecard.json \
  output/course-geometry/peek-n-peak-upper-package \
  --canopy-review src/test/fixtures/course-geometry/peek-n-peak-upper-canopy-review.json \
  --traces scripts/golf/course-geometry/pilots/peek-n-peak-upper-imagery-traces.json

# 3. Terrain meshes (empty the compiled dir first for a revised package)
python3 scripts/golf/course-geometry/compile-course-terrain.py --holes all \
  --package src/test/fixtures/course-geometry/peek-n-peak-upper.json \
  --source src/test/fixtures/course-geometry/sources/peek-n-peak-upper-terrain \
  --output src/test/fixtures/course-geometry/compiled-peek-n-peak-upper

# 3b. Canopy from NAIP (needs the terrain export grid; rerun 2 and 3 after)
python3 scripts/golf/course-geometry/derive-canopy-naip.py \
  src/test/fixtures/course-geometry/peek-n-peak-upper.json \
  src/test/fixtures/course-geometry/sources/peek-n-peak-upper-terrain \
  output/course-geometry/peek-n-peak-upper-naip \
  src/test/fixtures/course-geometry/peek-n-peak-upper-canopy-review.json

# 3c. Imagery dossier
python3 scripts/golf/course-geometry/review-course-imagery.py \
  src/test/fixtures/course-geometry/peek-n-peak-upper.json \
  output/course-geometry/peek-n-peak-upper-naip \
  output/course-geometry/peek-n-peak-upper-imagery-review \
  src/test/fixtures/course-geometry/peek-n-peak-upper-imagery-review.json

# 4. Blender world + truth gate
python3 scripts/golf/course-geometry/build-course-world.py \
  src/test/fixtures/course-geometry/peek-n-peak-upper.json \
  src/test/fixtures/course-geometry/sources/peek-n-peak-upper-terrain \
  output/course-geometry/peek-n-peak-upper-world

# 5. Harness, captures, bundle
npx vite --config scripts/golf/course-geometry/browser.config.ts        # dev on 127.0.0.1:8768
COURSE=peek-n-peak-upper node scripts/golf/course-geometry/capture-course-matrix.cjs
npx vite build --config scripts/golf/course-geometry/browser.config.ts \
  --outDir "$PWD/output/course-geometry/browser-build"
```

`scripts/golf/course-geometry/README.md` has the exact argument lists.

---

## 11. Commits

| Commit | Content |
| --- | --- |
| `a263c3e10` | Peek'n Peak Upper as a full 18-hole course fixture: OSM package, 3DEP terrain with candidate rejection, GDAL decoder, compiled meshes, harness course selection |
| `4eb76aa40` | NAIP canopy derivation, shared crown budget, focus-aware near detail, local play mode |
| `95792455e` | Imagery review dossier, traced hole 11 fairway, source-manifest re-stamp, green reference glyph, palette, docs and assets |

PR #1939 heads at `95792455e`. Nothing has been merged or deployed.
