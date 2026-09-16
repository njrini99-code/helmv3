# Real-course source-study spike

This is an offline, bounded one-study pipeline. Geographic source data remains
the authority, the canonical local-metre JSON is the compiler input, and the
GLB is a replaceable static rendering product. Player shots, balls, cups,
labels, replay, and analytics are never written into the GLB.

## Cardinal green-complex study

The current Cardinal package is explicitly `source_candidate_partial`. It is
an OSM green/bunker complex with LiDAR terrain, not Cardinal Hole 1 and not a
playable course binding. It has no reviewed tee, fairway, route, pin, observed
ball coordinate, or historical shot coordinate. Do not serve its output from
the product or attach it to a round.

Acquire inputs into ignored local output:

```sh
python3 scripts/golf/course-geometry/fetch-nc-ortho-study.py \
  src/test/fixtures/course-geometry/cardinal-study.json cardinal-green-study \
  output/course-geometry/cardinal-ortho-native-v1

python3 scripts/golf/course-geometry/fetch-nc-lidar-study.py \
  src/test/fixtures/course-geometry/cardinal-study.json cardinal-green-study \
  output/course-geometry/cardinal-lidar-native-v1
```

The orthophoto tool requests native 0.5 US-survey-foot cells (about 0.1524m)
from NC OneMap with nearest-neighbour export and records exact bounds, pixel
dimensions, bands, selected source and hashes. It tries the four-band analysis
service first. A transparent raster fails the quality gate; the three-band
visual fallback is labelled `visual_rgb_only`, never NIR or analysis data.
Its PNG has no embedded CRS, so the immutable manifest/export metadata supplies
its source CRS and affine extent. Do not call it a GeoTIFF.

Normalize the source study into GolfHelm's invariant local frame:

```sh
python3 scripts/golf/course-geometry/normalize-study.py \
  src/test/fixtures/course-geometry/cardinal-study.json cardinal-green-study \
  output/course-geometry/cardinal-lidar-native-v1 \
  output/course-geometry/cardinal-ortho-native-v1 \
  output/course-geometry/cardinal-spike-v1/normalized.json
```

The result has `x=east`, `y=elevation up`, `z=north`; one world unit is one
metre. It retains source WGS84 geometries alongside derived positions and
rejects missing LiDAR samples rather than filling them.

Compile metric truth before creating a visual asset:

```sh
python3 scripts/golf/course-geometry/compile-physical-world.py \
  output/course-geometry/cardinal-spike-v1/normalized.json \
  output/course-geometry/cardinal-spike-v1/physical/world.json
```

`golfhelm-physical-world-v1` preserves the metric terrain field and every
semantic boundary, while attaching explicit claims each source supports. With
the current inputs, a bunker is a source-backed footprint rather than a
measured cavity, and a green is macro-terrain context rather than a
survey-grade putting surface. The compiler refuses to turn either limitation
into a depth, lip, break, or pin claim. Blender can read either the canonical
study or this physical world; new visual compilation should use the latter.
Every surface carries one of four truth classes: `measured`, `derived`,
`estimated`, or `visual_only`. All four can render. Only measured or derived
geometry with recorded boundary uncertainty and human review may drive
authoritative physical measurements; a renderer may add a smooth green mesh,
grass, or a conservative procedural bunker bowl for the other classes, but
those visual additions must never become course truth.

Run the source truth gate before considering a hole playable:

```sh
python3 scripts/golf/course-geometry/course-truth-gate.py \
  output/course-geometry/cardinal-spike-v1/normalized.json \
  output/course-geometry/cardinal-spike-v1/validation/course-truth.json \
  output/course-geometry/cardinal-spike-v1/validation/course-truth.md
```

It requires reviewed measured/derived tee, fairway, green, bunker, water, and
tee-to-green distance geometry. A failure blocks authoritative publication but
does not block a clearly non-authoritative visual review render.
Use `--require-pass` in a publishing/build job so a failed report exits
nonzero after persisting its evidence.

Compile and validate locally with the free Blender toolchain:

```sh
blender --background --python scripts/golf/course-geometry/blender/generate_hole.py -- \
  output/course-geometry/cardinal-spike-v1/physical/world.json \
  output/course-geometry/cardinal-lidar-native-v1/elevation.tiff \
  output/course-geometry/cardinal-spike-v1/rendering/cardinal-green-study.glb \
  output/course-geometry/cardinal-spike-v1/validation/blender-export.json \
  output/course-geometry/cardinal-spike-v1/rendering/cardinal-green-study-preview.png

blender --background --python scripts/golf/course-geometry/blender/validate_glb.py -- \
  output/course-geometry/cardinal-spike-v1/physical/world.json \
  output/course-geometry/cardinal-spike-v1/rendering/cardinal-green-study.glb \
  output/course-geometry/cardinal-spike-v1/validation/glb-roundtrip.json
```

`validate_glb.py` imports the GLB and fails if the terrain span differs from
canonical metres by more than 0.02m, catching unit scaling or axis changes.
This spike creates source-backed terrain plus the available green/bunker
surfaces only. Tree assets, fairways, tees, water, route ownership, visual
review edits, CDN storage, and app exposure wait for reviewed, licensed
full-hole geometry.

During compilation, every source polygon is tessellated and resampled from the
same terrain mesh at four-metre-or-finer horizontal edges. That prevents a
large planar fairway or green triangle from cutting through real terrain in a
static review render. Tee surfaces have their own material role. The bundled
camera is only an authored review default with an explicit far clip; it is not
the runtime interaction controller.

## Whole-course build (Peek'n Peak Upper)

The same chain runs for a full 18-hole OSM course. Every stage is
reproducible from retained evidence; nothing is fetched twice.

```sh
# 1. Retain the Overpass extract once (immutable gzip + manifest with hashes).
python3 scripts/golf/course-geometry/fetch-osm-course.py \
  scripts/golf/course-geometry/pilots/peek-n-peak-upper-scorecard.json \
  src/test/fixtures/course-geometry/sources/peek-n-peak-upper-osm

# 2. Build the geometry package and association report from that extract
#    (an output directory: normalized.json becomes the package fixture, the
#    association report merges into <course>-review.json with the retained
#    extract and scorecard sections).
python3 scripts/golf/course-geometry/prepare-osm-course.py \
  src/test/fixtures/course-geometry/sources/peek-n-peak-upper-osm/overpass.json.gz \
  scripts/golf/course-geometry/pilots/peek-n-peak-upper-scorecard.json \
  output/course-geometry/peek-n-peak-upper-package

# 3. Acquire one native-1m USGS tile and compile per-hole terrain meshes.
#    --context makes the reviewed ground ribbons (cart paths, service paths,
#    roads) breaklines: vertices along every ribbon edge and 4 m cells along
#    the ribbon within 60 m of the played hole. Heights stay source-sampled.
python3 scripts/golf/course-geometry/compile-course-terrain.py --holes all \
  --package src/test/fixtures/course-geometry/peek-n-peak-upper.json \
  --source src/test/fixtures/course-geometry/sources/peek-n-peak-upper-terrain \
  --output src/test/fixtures/course-geometry/compiled-peek-n-peak-upper \
  --context src/test/fixtures/course-geometry/peek-n-peak-upper-context.json

# 3b. Canopy groups from leaf-on NAIP (retained export in ignored output, review
#     JSON as the fixture), then re-run step 2 with --canopy-review and step 3
#     so the package carries reviewed woods features and the meshes tessellate
#     them as a material.
python3 scripts/golf/course-geometry/derive-canopy-naip.py \
  src/test/fixtures/course-geometry/peek-n-peak-upper.json \
  src/test/fixtures/course-geometry/sources/peek-n-peak-upper-terrain \
  output/course-geometry/peek-n-peak-upper-naip \
  src/test/fixtures/course-geometry/peek-n-peak-upper-canopy-review.json
python3 scripts/golf/course-geometry/prepare-osm-course.py \
  src/test/fixtures/course-geometry/sources/peek-n-peak-upper-osm/overpass.json.gz \
  scripts/golf/course-geometry/pilots/peek-n-peak-upper-scorecard.json \
  output/course-geometry/peek-n-peak-upper-package \
  --canopy-review src/test/fixtures/course-geometry/peek-n-peak-upper-canopy-review.json \
  --traces scripts/golf/course-geometry/pilots/peek-n-peak-upper-imagery-traces.json

# 3c. Imagery review dossier: OSM outlines over the retained NAIP export per
#     hole, a contact sheet, and bunker sand agreement (plan 6.3, 6.4, 13.7).
python3 scripts/golf/course-geometry/review-course-imagery.py \
  src/test/fixtures/course-geometry/peek-n-peak-upper.json \
  output/course-geometry/peek-n-peak-upper-naip \
  output/course-geometry/peek-n-peak-upper-imagery-review \
  src/test/fixtures/course-geometry/peek-n-peak-upper-imagery-review.json

# 4. Per hole: canonical study → physical world → truth gate → GLB → round trip.
python3 scripts/golf/course-geometry/build-course-world.py \
  src/test/fixtures/course-geometry/peek-n-peak-upper.json \
  src/test/fixtures/course-geometry/sources/peek-n-peak-upper-terrain \
  output/course-geometry/peek-n-peak-upper-world
```

Tile selection checks the export, not just the catalog footprint. A 3DEP
project tile advertises its full square even where it is clipped at a state
line: the newer `PA_WesternPA_2019_D20` tile covers this bbox on paper but
exports 61.5% empty fill because the course is in New York, so the compiler
records it under `rejectedCandidates` and retains `NY Southwest East 2017`
instead. Both `USGS 1 Meter …` and `USGS one meter …` product names are
native-1m 3DEP tiles. Rasters are decoded with GDAL; Pillow mis-decodes some
tiled Float32 exports and remains only a fallback that the manifest names.

`course-world-manifest.json` records the study, physical-world and GLB hashes
and each hole's truth-gate verdict. Unreviewed OSM boundaries fail the gate by
design; the GLBs and app previews are visual review products until a
course-familiar review records boundary uncertainty.

Canopy is decoration, never truth. `derive-canopy-naip.py` classifies
leaf-on NAIP four-band imagery (NDVI plus near-infrared texture) into canopy,
masks every OSM golf surface with a small buffer, closes gaps under 12 m and
drops strands under 4 m so each group reads as one forest mass, and clips
groups to each hole's compile context. The review JSON records the method,
thresholds, tiles, capture dates and raster hash. Merged woods features are
`reviewed: true` with the reviewer note naming the comparison performed;
they bound where crown artwork may render and carry no height, currentness
or obstruction claim. `normalize-study.py` never lets woods size the metric
grid. In the renderers, `canopySymbols` widens its pattern spacing rather
than truncating a large group, `allocateCrowns` shares the crown budget
across groups in proportion to their patterns (a small copse always keeps a
tree), the 3D landscape keeps the crowns nearest the played hole's own
surfaces, and near-detail crowns swap in only for the batch tiles around the
camera focus.

`--traces` merges surfaces traced from the retained orthophotography where
OSM has none (plan 6.2, source preference 3). Each trace records the imagery
tiles, capture dates, raster hash, tracer and a stated horizontal accuracy;
it enters the package as `reviewed: false` with that `accuracyMeters`, the
hole stays partial, and the truth gate still fails on it. Hole 11's fairway
is such a trace (±10 m): the mowed corridor is visible in NAIP but fairway
and first cut are not separable at 1 m. A revised package reuses the same
terrain source directory when the request bounds and every retained file
hash match; the source manifest records each package hash it has served and
the raster is never replaced. Compiled outputs are derived products and are
regenerated into an empty directory.

`review-course-imagery.py` draws every package feature over the NAIP export
per hole at 3×, writes a contact sheet, and scores each bunker polygon by the
share of bright, low-NDVI, warm pixels inside it and in a 6 m ring outside
it. Low inside shares flag shadowed, grass-faced or mis-traced polygons for a
course-familiar reviewer; unclaimed sand blobs inside the hole extent are
listed for the same purpose. Nothing in the dossier moves a polygon, passes a
gate or classifies a rules penalty area.

Every scene carries a restrained green-reference glyph when no estimated pin
exists: a flag at a roomy interior point of the green, labelled "Green", with
the accessible title stating that no pin or cup position is known. It is
layout only and feeds no distance, camera or reconstruction.

The browser fixture serves any compiled course: `?course=peek-n-peak-upper`
on the entry/review pages, `?matrix=1&course=peek-n-peak-upper&hole=N` for the
per-hole matrix, `?play=1&course=peek-n-peak-upper` for a local
play-through, and `COURSE=peek-n-peak-upper` for
`capture-course-matrix.cjs`. `render-top-courses.tsx` includes the course in
its shared-renderer previews and contact sheet.

Play mode drives the real `FairwayShotTracking` screen hole by hole with the
compiled terrain for the current and next hole resident. Shots, scores and the
current hole persist in this browser only (`localStorage`); nothing reaches
Supabase, a real round or statistics, positions remain estimates, and a
two-tap control clears the local round.

## Meridian visual system (September 16, 2026)

Master plan status: `docs/plans/2026-09-16-meridian-visual-master-plan-status.md`.
Visual language: `docs/design/meridian-visual-language.md`. Processes, checklist,
observability codes and risks: `docs/plans/2026-09-16-meridian-operations.md`.

```bash
# Visual canaries (§8): 8 holes × Top/Terrain/Side × 4 viewports + canaries.json
node scripts/golf/course-geometry/capture-visual-canaries.cjs --label=v1-perspective
python3 scripts/golf/course-geometry/build-canary-sheet.py \
  output/playwright/course-geometry/visual-system/canaries/v1-perspective 390x844 sheet.png
# Faceting debug views (§14) on the matrix page: ?matrix=1&course=peek-n-peak-upper&hole=7&debug=slope
node scripts/golf/course-geometry/capture-visual-canaries.cjs --label=debug-slope --holes=7 \
  --presets=Terrain --viewports=390x844 --debug=slope --out=output/playwright/course-geometry/visual-system/debug-meridian/slope
# Normal continuity audit (§16)
node scripts/golf/course-geometry/audit-normal-continuity.mjs \
  src/test/fixtures/course-geometry/compiled-peek-n-peak-upper/peek-n-peak-upper-07-terrain.json.gz --out report.json
# Render-quality lab (§94–95): http://127.0.0.1:8768/?lab=1&course=peek-n-peak-upper&hole=7
#   material layer multipliers: &macro=0&micro=0&mowing=4&boundary=0&context=0 (1 = style value)
#   vegetation budget scales:   &crowns=0&mass=0 (1 = style budget; 0 removes the layer)
#   atmosphere/water scales:    &water=0&haze=0&shade=0 (1 = style value; haze/sky only in perspective presets)
node scripts/golf/course-geometry/capture-lab.cjs --out=output/playwright/course-geometry/visual-system/lab/hole07.png \
  --params="course=peek-n-peak-upper&hole=7&preset=terrain&viewport=desktop&mowing=0"
# Bunker spike sheet (§122): before/after rows for two labels
python3 scripts/golf/course-geometry/build-spike-sheet.py output/playwright/course-geometry/visual-system/canaries 390x844 \
  spike.png v2-material,v3-bunkers 7,11 Terrain,Side
# Bunker bowl depth debug view (render-only): ?lab=1&course=peek-n-peak-upper&hole=7&area=green&debug=bunker-depth
# Visual artifact compiler (§96–102): one hash-gated artifact per hole + offline pack manifest
node_modules/.bin/tsx scripts/golf/course-geometry/compile-visual-artifacts.mts --course peek-n-peak-upper \
  [--holes 1,7,11] [--out output/course-geometry/visual]
```

Visual artifact cache layout (§101): `geometry/<siteId>/<packageHash>/visual/<styleHash>/<holeKey>.visual.json[.gz]`
with `pack-manifest.json` (§102) beside the holes. The runtime compiles the
artifact itself when none is supplied (`data-meridian-code="MERIDIAN_ARTIFACT_MISSING"`)
and refuses one whose package, terrain, hole, style or vertex layout disagree
(`MERIDIAN_ARTIFACT_MISMATCH`, static fallback).
