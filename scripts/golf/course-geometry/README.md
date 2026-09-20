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
blender --background --python-exit-code 1 --python scripts/golf/course-geometry/blender/generate_hole.py -- \
  output/course-geometry/cardinal-spike-v1/physical/world.json \
  output/course-geometry/cardinal-lidar-native-v1/elevation.tiff \
  output/course-geometry/cardinal-spike-v1/rendering/cardinal-green-study.glb \
  output/course-geometry/cardinal-spike-v1/validation/blender-export.json \
  output/course-geometry/cardinal-spike-v1/rendering/cardinal-green-study-preview.png

blender --background --python-exit-code 1 --python scripts/golf/course-geometry/blender/validate_glb.py -- \
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

## Terrain providers at library scale

`compile-course-terrain.py` accepts an explicit provider selected from the
facility's ordered `providerPolicy.terrain` list by `factory/providers.py`.
The default is `usgs_3dep_project_1m`; `nc_onemap_dem03` is now supported for
North Carolina whole-course source candidates:

```sh
python3 scripts/golf/course-geometry/compile-course-terrain.py --acquire-only \
  --provider nc_onemap_dem03 --holes all --package <package.json> \
  --source <immutable-source-dir> --output <derived-output-dir>
```

The NC adapter preserves the native 3.125-US-survey-foot grid and raw F32
heights, converts Z only with the declared US-survey-foot factor, rejects a
resampled or empty export, and records unknown vertical datum and source terms
as unknown. It is valid for a clearly labelled source-candidate visual build;
it cannot make terrain, bunker depth, or green-break measurements authoritative
or clear a publication gate. `usgs_s1m` remains discovery-only until its
registration and acceptance rule are approved.

Every current terrain source uses `coverageMethod: perimeter-v1`: the compiler
samples each edge of the requested local-ENU bounds before projecting to the
provider CRS, then requests an eight-metre source guard. This prevents curved
projected edges from excluding a valid source polygon. Legacy four-corner
raster caches are preserved rather than edited, but the factory does not adopt
their derived terrain, canopy, context, world, or capture outputs. A route-
unresolved layout can still build a facility visual context package and GLB;
its `renderingContract` is `canRender: true`, `canMeasure: false`, and
`maySupplyHoleAssociation: false`, so it can never act as a playable hole.
If that facility cannot fit the NC provider's fixed native-pixel cap, the
factory retains a separate `*-visual-r<N>m-v1` raster. It records the original
`sourceNativeResolutionM`, its coarser actual raster resolution, and
`renderingOnly: true`; downstream terrain uses `truthClass: visual_only` and
may not provide elevation, slope, route, lie, or shot evidence.

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
#    course-terrain-v3 nodes every material piece into one planar arrangement
#    before triangulating, so neighbouring pieces share their boundary vertices
#    (report `noding.tJunctionVertices` must be 0: a T-junction is a hairline
#    crack that shows the sky through the terrain).
#    course-terrain-v4 stops emitting the per-vertex sourceNormals array by
#    default: the renderer shades every fragment from the metric grid's slope
#    (the same DEM gradient), and the array was 37 % of each hole's gzip.
#    Pass --source-normals to emit it for a legacy consumer.
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
the raster is never replaced. Compiled outputs are derived products: a new
terrain source clears the compiled directory, while a new package hash only
relabels its `asset-manifest.json` (the factory keeps every listed hole whose
file is present, and the holes whose own inputs changed overwrite their
entries when they recompile). Each `<hole>-report.json` still records the
package hash it was compiled under.

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
# §39 review prompt sheet: per-hole evidence + draft answers for the outside-world review pass
python3 scripts/golf/course-geometry/build-context-prompt-sheet.py \
  src/test/fixtures/course-geometry/peek-n-peak-upper.json \
  src/test/fixtures/course-geometry/peek-n-peak-upper-context.json \
  src/test/fixtures/course-geometry/peek-n-peak-upper-context-report.json \
  src/test/fixtures/course-geometry/compiled-peek-n-peak-upper \
  docs/plans/2026-09-16-outside-world-review-prompts.md \
  src/test/fixtures/course-geometry/peek-n-peak-upper-unexplained-naip.json
# (the last argument, the NAIP evidence JSON, is optional)
# What the unexplained context ground is in leaf-on NAIP. Report only: no
# zone, no hash change; it rebuilds the report's ground and refuses to run
# unless its share matches the retained report on every hole. Writes
# per-hole overlays, a contact sheet and JSON/markdown; --fixture= keeps
# the numbers for the prompt sheet above.
F=src/test/fixtures/course-geometry
python3 scripts/golf/course-geometry/report-unexplained-naip.py \
  $F/peek-n-peak-upper.json $F/peek-n-peak-upper-context.json \
  $F/peek-n-peak-upper-context-report.json $F/compiled-peek-n-peak-upper \
  $F/sources/peek-n-peak-upper-terrain \
  output/course-geometry/peek-n-peak-upper-naip \
  output/course-geometry/peek-n-peak-upper-unexplained \
  --fixture=$F/peek-n-peak-upper-unexplained-naip.json
# Measure (never apply) a canopy pass re-run out to the report's hole bounds:
# same raster and rules, only the clip box; replays the pass against the
# retained canopy review first, then recomputes every hole's uncertain share.
python3 scripts/golf/course-geometry/measure-canopy-rerun.py \
  $F/peek-n-peak-upper.json $F/peek-n-peak-upper-context.json \
  $F/peek-n-peak-upper-context-report.json \
  $F/peek-n-peak-upper-canopy-review.json $F/compiled-peek-n-peak-upper \
  $F/sources/peek-n-peak-upper-terrain \
  output/course-geometry/peek-n-peak-upper-naip \
  output/course-geometry/peek-n-peak-upper-unexplained \
  --fixture=$F/peek-n-peak-upper-canopy-rerun.json
# (the prompt sheet takes that fixture as its optional last argument)
# QGIS review kit with the NAIP evidence layers (classified raster + per-hole
# unexplained ground, read-only, under the zones):
python3 scripts/golf/course-geometry/build-qgis-review-kit.py \
  $F/peek-n-peak-upper.json output/course-geometry/peek-n-peak-upper-review-kit \
  --context=$F/peek-n-peak-upper-context.json \
  --imagery-review=$F/peek-n-peak-upper-imagery-review.json \
  --evidence=output/course-geometry/peek-n-peak-upper-unexplained
# Visual canaries (§8): 8 holes × Top/Terrain/Side × 4 viewports + canaries.json
# (each capture also carries the hole's unexplained-context share and its
# pass/fail against the outside-world uncertain gate, < 15 %, from the context report)
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
# Review flythrough (renderer redesign §18): one hole through tee → approach →
# green → putting in the lab with the camera transitions playing; writes the
# video, a still + telemetry per state and a four-frame strip.
node scripts/golf/course-geometry/capture-flythrough.cjs --hole=7 --viewport=phone \
  --out=output/playwright/course-geometry/visual-system/flythrough
```

Visual artifact cache layout (§101): `geometry/<siteId>/<packageHash>/visual/<styleHash>/<holeKey>.visual.json[.gz]`
with `pack-manifest.json` (§102) beside the holes. The runtime compiles the
artifact itself when none is supplied (`data-meridian-code="MERIDIAN_ARTIFACT_MISSING"`)
and refuses one whose package, terrain, hole, style or vertex layout disagree
(`MERIDIAN_ARTIFACT_MISMATCH`, static fallback).

## Course factory (Factory v2 PR B, September 19, 2026)

`course-factory.py` is the build engine over the scripts above: catalog →
facility/layout/hole DAG → fingerprints → ledger → bounded runs. It never
writes `public/`, flags, production or a retained (checked-in) path — every
executor writes under the output root, and `output/course-geometry/factory/`
is disposable. `python3 -m unittest discover -s scripts/golf/course-geometry -p 'test_factory_*.py'`
runs the network-free suite (fake executors, synthetic two-layout facility).

```bash
F=scripts/golf/course-geometry/course-factory.py
python3 $F doctor                                   # tools, disk reserve, catalog problems, missing retained paths
python3 $F plan                                      # every layout: state + reason per task
python3 $F plan --layout cacapon [--json|--golden|--notes]
python3 $F why  --layout cacapon --task hole.terrain.compile --hole 7   # causal chain
python3 $F run  --layout cacapon [--until layout.terrain.acquire] [--task hole.world.build --holes 7,8] [--dry-run]
python3 $F status --layout cacapon [--json]          # earned tier, blockers, disk, last run
python3 $F invalidate --layout cacapon --task facility.osm.snapshot --reason "OSM edit 2026-09-20"
python3 $F intake [--min-rounds 5] [--write]          # cohort → C0 manifests, most-played first
python3 $F batch --all-layouts --dry-run --json        # every catalogued 9–36-hole layout; no publish/capture work
python3 $F batch --all-layouts                         # serial world compilation plus an auditable route-review.json for every layout; never publish/capture
# --no-adopt-output ignores everything under output/ (what a fresh clone sees)
# COURSE_FACTORY_DISK_RESERVE_GB=8 is the guard heavy tasks must stay above
```

### Active-team school proximity cohort

The standard cohort ranks actual completed rounds. To scale a nearby-home-course
rollout without hard-coding course names, export the active GolfHelm schools
and live library first, then select courses within the stated school radius.
The selection is **only a build-priority signal**: its geocoded city/address
anchors never establish physical course coordinates, hole routing, yardage or
feature geometry.

```bash
ROOT=output/course-geometry/team-proximity
DOTENV_CONFIG_PATH=.env.local node_modules/.bin/tsx -r dotenv/config \
  scripts/golf/course-geometry/export-team-course-library-snapshot.mts \
  --out "$ROOT/library-snapshot.json"
python3 scripts/golf/course-geometry/build-team-nearby-course-cohort.py \
  "$ROOT/library-snapshot.json" "$ROOT" --max-miles 75
python3 scripts/golf/course-geometry/audit-library-coverage.py \
  "$ROOT/cohort.json" "$ROOT/coverage"
python3 $F intake --cohort "$ROOT/cohort.json" --coverage "$ROOT/coverage/coverage.json" \
  --scorecards "$ROOT/library-snapshot.json" --min-rounds 0 --write
```

`build-team-nearby-course-cohort.py` caches its bounded public Nominatim
geocodes under the output root and records `derived_address_geocode` versus
`estimated_city_anchor`. The factory still requires independently
source-confirmed routes for a physical hole world; route-blocked layouts build
only the non-measurable facility visual fallback.

### High-fidelity imagery preflight

The factory catalog has an ordered, region-specific imagery policy. Preflight
records a provider’s live ArcGIS metadata without treating a browser preview
as a source raster. It is a prerequisite for acquisition, not a geometry
approval: an AOI item query, native-resolution GeoTIFF, source hash, CRS,
bands, date, licensing, and imagery-quality checks remain mandatory.

```bash
python3 scripts/golf/course-geometry/preflight-imagery-sources.py \
  course-geometry/catalog/facilities/cape-fear-country-club-golf-course.json \
  output/course-geometry/factory/facilities/cape-fear-country-club-golf-course/imagery-source-preflight.json
```

`factory/source_registry.py` marks every provider as
`feature_extraction`, `visual_review_only`, or `discovery_only`. The latter
two can guide human review but cannot enter canonical geometry automatically.

For NC facilities, acquire analysis imagery with retained source bands rather
than a browser preview or `png32` cache. The v2 downloader writes independent
RGB and NIR GeoTIFFs for each native-grid tile and fails a tile unless both
exports pass. The optional sidecar identifies the single matching ImageServer
catalog item at each tile center; it preserves the provider catalog date as
metadata only, never as an asserted imagery-flight date. The NC adapter tries
the current 2024–2027 four-band analysis source first, then its 2020–2023
four-band analysis source only when the newer tile fails its quality gate;
tile-level selection and every rejection are retained. The batch command uses
the provider's live grid origin for its capacity estimate and stops before its
disk reserve. All outputs below are imagery evidence; segmentation and human
review still decide whether any vector can become canonical geometry.

For a facility without a stronger reproducible state adapter, the national
public fallback retains a four-band USGS NAIP Plus GeoTIFF at the selected
catalog item's actual density. It uses nearest-neighbor reprojection into the
course UTM frame and explicitly records that the raw source grid origin is not
known; this is `reprojected_native_density`, not a claim of raw-pixel alignment.

```bash
python3 scripts/golf/course-geometry/fetch-usgs-naip-facility-ortho.py \
  output/course-geometry/factory/facilities/winchester-country-club/aoi.json \
  output/course-geometry/factory/facilities/winchester-country-club/naip-plus-locked-v2
```

The v2 downloader locks each export to the selected catalog OBJECTID and
verifies the TIFF itself. It retains original pixels, dates, CRS, hashes and
all failed source-sheet coverage attempts. Sparse unknown pixels can remain
in review imagery only (at most 0.1%); they are never filled or admitted as
physical feature evidence. The source's native spacing and the reprojected
grid are recorded separately. Do not reuse the earlier unlocked v1 directory.

```bash
python3 scripts/golf/course-geometry/batch-usgs-naip-facility-ortho.py \
  course-geometry/catalog output/course-geometry/factory \
  output/course-geometry/factory/research/naip-source-locked-batch-v2.json --execute
```

This serial facility batch shares downloads across layouts, leaves NC on its
regional workflow, checkpoints individual tiles and resumes partial runs.
The national source is a public fallback, not an assertion that no better
county/state imagery exists. Requests remain bounded; the eight-GiB reserve
applies before each download. The per-facility cap is 256 tiles and 256 million
pixels, with a conservative whole-job disk estimate before execution; partition
larger sites instead of reducing native density silently.

```bash
A=output/course-geometry/factory/facilities/cape-fear-country-club-golf-course/aoi.json
I=output/course-geometry/factory/facilities/cape-fear-country-club-golf-course/native-ortho-nir-v2
python3 scripts/golf/course-geometry/fetch-nc-facility-ortho.py "$A" "$I"
python3 scripts/golf/course-geometry/annotate-nc-ortho-source-items.py "$I/index.json" "${I}-source-items-v1"
python3 scripts/golf/course-geometry/batch-nc-facility-ortho.py \
  course-geometry/catalog output/course-geometry/factory \
  output/course-geometry/factory/research/nc-ortho-batch-plan.json
```

Complete native imagery can next produce a **review kit**, not new course
geometry. The review compiler reads retained GeoTIFFs in place, bounds scans
to an existing route candidate only as a non-canonical crop aid, and emits
overlays plus derived prompts. Its strict contract is: native pixels are
`measured` source evidence; every prompt is `derived`, requires review, and
cannot measure physical geometry. Large or elongated spectral regions stay
`visual_only`; the scan records its effective GSD and is capped at four
million pixels per hole.

```bash
python3 scripts/golf/course-geometry/batch-native-ortho-review.py \
  course-geometry/catalog output/course-geometry/factory \
  output/course-geometry/factory/research/native-ortho-hole-review-batch-v1.json \
  --execute
```

This batch requires a route candidate package plus either a complete NC index
with matching source-item sidecar, or a complete locked national v2 index with
verified raster and metadata hashes. National imagery uses its actual 0.3/0.6-m
spacing, never the NC six-inch label. Outputs use `native-imagery-review-v2`.
It never edits
canonical geometry, admits a route, or supplies physical measurements.

When a locked national cache is complete, `layout.canopy.derive` automatically
uses it offline through `indexed_naip.py`. Direct invocation adds
`--imagery-index <facility>/naip-plus-locked-v2/index.json` to
`derive-canopy-naip.py`. The resulting terrain-aligned raster is a derived
classification input, with its actual coverage and spacing recorded. Its cache
key includes source pixel/provenance identity; unknown areas stay excluded.
Canopy regions remain approximate artwork placement, never measured trees or
obstruction heights. No renderer or shot-coordinate contract changes.

Large physical terrain requests are partitioned into aligned native-resolution
parts (eight-million-pixel request cap; 32-million-pixel total cap). The compiler
retains and checks every part, selected source IDs, reference frame and datum,
then mosaics without resampling. Native geometry is not downgraded to fit one
HTTP request.

The terrain renderer keeps its 40,000-triangle cap. After the existing 32-m
outer-context fallback, an over-budget hole may omit only decorative edge-band
subdivisions. The profile records this choice; canonical boundaries, source
heights, tactical/detail sampling and the metric grid remain unchanged. An
over-budget mesh still fails after that cosmetic reduction.

States: `ready`, `pending` (waiting on upstream, root named), `cached`
(`FINGERPRINT_UNCHANGED` / `ADOPTED_EXTERNAL` / `INLINE_VALIDATED`), `stale`
(`FINGERPRINT_CHANGED` with the changed inputs, `ARTIFACT_MISSING`,
`ARTIFACT_CORRUPT`, `MANUAL_INVALIDATION`, `INTERRUPTED_RUN_RECOVERED`),
`blocked` (own code, or `DEPENDENCY_BLOCKED` with the root code), `failed`.
Reason codes and their meaning: `factory/reasons.py`. Runs leave
`runs/<id>/report.{json,md}` and one log per task.

Sign-off captures (`hole.visual.canary`, `hole.player.capture`, the two
layout aggregates) need the lab listening (`npx vite --config
scripts/golf/course-geometry/browser.config.ts`, port 8768) and a course the
lab serves: its compiled fixture under `src/test/fixtures/course-geometry/`
hash-locked to the factory's package. Otherwise the plan says
`LAB_NOT_LISTENING` (the node stays ready) or `LAB_COURSE_NOT_SERVED` (with
both hashes). Captures land under
`layouts/<layout>/{visual,player}/holes/<hole>/`; the aggregates write
`visual/canaries.json` + `sheet-<viewport>.png` + `visual-summary.json` and
`player/player-summary.json` + `sheet-<viewport>.png`
(`build-player-sheet.py`). Draw-call breaches and uncertain-gate failures are
findings for `visual_signoff` on the review queue, never a failed capture; a
page error, a missing image or a mesh other than the node's is.

Imagery currency: a catalog `knownRenovationAfter` (layout over facility)
against the retained imagery's capture dates. Imagery flown before it blocks
`layout.imagery.audit` with `IMAGERY_TOO_OLD_FOR_KNOWN_RENOVATION`, notes the
canopy node, and puts an `imagery_currency` item on the review queue; a later
capture or a lifted date clears it (`factory/imagery.py`).

### S1M discovery spike (read-only research)

```bash
python3 scripts/golf/course-geometry/research-s1m-coverage.py \
  [--root output/course-geometry/factory]... [--facility <id>]...
```

Plan §19 C2: for every catalog facility, one TNM catalog query for the USGS
Seamless 1 m DEM (`Seamless 1-m DEM (S1M)`), one ScienceBase read per tile
for the source flight window, a range read of each tile's `s1m_source_inputs`
GeoPackage (the work unit under each part of the tile with its data type,
source resolution, flight window and share of the tile and of the AOI), an
HTTP range read of the AOI window from the COGs (never a whole 300–430 MB
tile), and — where a retained project export exists under a root — a
comparison every 25 m plus a ±2 m best-fit shift, reported as a measurement
(the cause of the constant ~1 m offset is not established).
Writes `research/s1m-coverage.{json,md}` under the first root, nothing else;
`providerPolicy` and the compiler's provider do not move. `--facility` runs
refresh those rows and keep the rest of the previous report. Tests:
`test_research_s1m_coverage.py` (offline).
