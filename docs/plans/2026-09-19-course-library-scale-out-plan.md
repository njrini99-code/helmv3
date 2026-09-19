<!-- markdownlint-disable MD013 MD060 -->
# Course library scale-out: bringing every course to Peek'n Peak level

Written 2026-09-19 on `agent/golf-course-geometry` (head `0bf36b548`, PR #1939).
Status: **proposal for the owner** — nothing in it is started. Every number
comes from a retained artefact in this branch (named inline); every estimate
is marked as one.

## 0. Where we are in one paragraph

One course is at the bar: **Peek'n Peak Upper** (NY, OSM `way/136097904`).
The library holds **64 `golf_courses` rows = 52 facilities**
(`audit-library-coverage.py`, 2026-09-18, `output/course-geometry/library-coverage/coverage.json`).
Of those, **26** have the sources the pipeline needs (OSM holes/greens/fairways
inside the course's own polygon plus a USGS 3DEP native 1 m tile), **15** are
mapped but have no 1 m tile (14 in North Carolina, 1 in Ontario), **8** are
in OSM without hole features, **2** are partial, **1** is absent from OSM.
Only **Cacapon** is past the package stage besides the Upper (18-hole package,
whole-course terrain, 18 compiled meshes, canopy review — compiled with
`course-terrain-v1`, so it must be recompiled). The cost that scales is human
review, not machine time.

## 1. What "Peek'n Peak level" means — definition of done per course

A course is at the bar when every line below is true and the artefact named
exists in the repo (fixtures) or under `public/` (published):

| # | Done means | Artefact |
|---|---|---|
| 1 | The OSM extract is retained once, immutable, with hashes | `src/test/fixtures/course-geometry/sources/<slug>-osm/{overpass.json.gz,manifest.json}` |
| 2 | A `source_candidate` geometry package: 18 routes, tees, fairways, greens, bunkers, water; every feature carries provenance and a truth class (`measured` / `derived` / `estimated` / `visual_only`) | `<slug>.json` (+ `<slug>-review.json` association report merged with the scorecard) |
| 3 | One native 1 m 3DEP tile locked by hash, per-hole terrain meshes compiled by `course-terrain-v4` with ribbon breaklines, 0 T-junction vertices | `sources/<slug>-terrain/{catalog.json,export.json,elevation.tiff,source-manifest.json}`, `compiled-<slug>/` + `asset-manifest.json` (`geometryHash` = package `contentHash`) |
| 4 | Canopy groups derived from leaf-on NAIP with the recorded method, merged as `woods` features; canopy is decoration, never truth | `<slug>-canopy-review.json`, NAIP export in ignored `output/course-geometry/<slug>-naip/` |
| 5 | Imagery review dossier: every feature drawn over NAIP per hole, bunker sand agreement, unclaimed sand listed | `<slug>-imagery-review.json`, dossier PNGs in `output/` |
| 6 | Outside world: context extract retained, context layer classified and locked to the package hash, context report with the per-hole uncertain share | `sources/<slug>-osm-context/`, `<slug>-context.json`, `<slug>-context-report.json` |
| 7 | Per-hole metric chain: canonical study → physical world → truth gate → GLB → round trip, verdict recorded per hole | `output/course-geometry/<slug>-world/course-world-manifest.json` |
| 8 | Human passes recorded: imagery/boundary review (QGIS sidecar applied), context §39 answers, layout identity, package hash approved by the owner | sidecar JSON applied by `apply-review-adjustments.py`; `<slug>-context.json` marked `partial`/`reviewed`; hash in the app policy |
| 9 | Whole-course sign-off: lab canary matrix (8 holes × Top/Terrain/Side × 4 viewports = 96 captures, 0 errors, every capture within its draw-call budget) and player matrix (18 holes × Terrain + Green, phone = 36 captures, 0 page errors), both diffed against the previous label | `output/playwright/course-geometry/visual-system/canaries/<label>/`, `output/.../player/<label>/`, `diff-*.json` |
| 10 | Published and bound: hash-named package, context and per-hole terrain under `public/course-geometry/<slug>/` with `manifest.json`; the app resolves the course to the package; flag rows exist | `public/course-geometry/<slug>/`, policy entry, `config/feature-flags.yml` rows |

Peek'n Peak Upper meets 1–7, 9 and 10 (published, bound, on preview); line 8
is partly open on the Upper too (the §39 context pass and the on-course truth
walk are yours). Its package is still `source_candidate` — no OSM feature has
been reviewed by a person — and it runs under an owner-approved pilot
exception (`approvedGeometryHashes` in `peek-n-peak-policy.ts`). Every other
course will face the same choice: approve the hash knowingly, or review the
OSM features first.

## 2. Sources — what we read, from where, and what it is good for

Everything is public, read-only, fetched once and retained with a sha256 so a
build can be reproduced without a second fetch. Nothing is guessed to fill a
gap: where a source has nothing, the package stays partial and the renderer
paints nothing there ("uncertain").

| Source | Endpoint | Gives | Resolution / currency | Limits we hit |
|---|---|---|---|---|
| OpenStreetMap via Overpass | `https://overpass-api.de/api/interpreter` | Golf surfaces (`golf=hole/tee/fairway/green/bunker/water_hazard`), cart paths; the outside world (buildings, woods, wetlands, streams, roads, service roads, paths, parking, fences, walls, bridges, lifts, recreation, landuse) | Whatever mappers drew; no accuracy claim; every feature enters as `source_candidate` | Rate limits and timeouts (a `remark` in the answer means retry, not "absent"); multi-course facilities share one polygon; some courses have greens only |
| Nominatim | `https://nominatim.openstreetmap.org/search` | City geocode to anchor the library matcher | — | Name collisions ("Forest Oaks" ≠ "Starmount Forest"); human pins (`osm` field) override |
| USGS 3DEP | `https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer` (catalog `query` + `exportImage`) | Native 1 m lidar DEM, one project tile per course | 1 m; project dates 2017–2023 in our set | A footprint is a claim, not evidence: tiles clipped at state lines export empty fill (`rejectedCandidates`); no 1 m product over 14 NC courses and Ontario; no automatic fallback to coarser or mixed-date tiles |
| USDA NAIP | `https://apps.geo.fpac.usda.gov/geo-imagery/rest/services/naip/conus_naip/ImageServer` | Four-band (R, G, B, NIR) leaf-on orthoimagery, exported at 1 m in the tile's UTM zone | 0.6–1 m native; flights every 2–3 years (Upper: 2024-05-24 / 2024-08-24) | Leaf-on only; fairway vs first cut not separable at 1 m; sand and shadow confuse each other |
| NC OneMap | `https://services.nconemap.gov/secure/rest/services/Elevation/DEM03/ImageServer`, `.../Imagery/Orthoimagery_Latest[_Analysis]/ImageServer` | State lidar DEM (DEM03, 3 ft ≈ 0.9 m) and 0.15 m orthophotos for NC | Ortho 2022 at the Bryan/Cardinal study points | The "2024–2027" service returned blank crops; 2022 was rejected as current for a course reporting bunker renovations; the DEM03 adapter exists only as a study fetch, not in the whole-course compiler |
| USGS NAIPPlus WMS | `https://imagery.nationalmap.gov/arcgis/services/USGSNAIPPlus/ImageServer/WMSServer` | Basemap in the QGIS review kit | — | Reviewer context only |
| Official scorecard | Course website (Upper: `pknpk.com`), retrieved date recorded | Pars, yardages, hole order; the route way ids are pinned against it | — | Must be transcribed by hand into `pilots/<slug>-scorecard.json` |
| Helm `golf_courses` + rounds | Supabase (read-only aggregates) | The library rows and the usage cohort that decides order | Cohort snapshot 2026-09-13: 380 completed rounds, 105 unlinked names | Unlinked course names have to be resolved to library rows first |

Retention discipline: extracts are gzipped once with a manifest (query, tag
counts, sha256); the terrain source directory records every package hash it
has served and its raster is never replaced; compiled outputs are derived
products regenerated into an empty directory; every downstream file is locked
to the package `contentHash` and refuses to run against another revision.

## 3. Tools — every script in the chain and what it is for

Runtime: Python 3 with Shapely 2.1, pyproj, NumPy, SciPy (`ndimage`), GDAL,
Pillow; Node 22 with `tsx` for the TypeScript compilers; Playwright (Chromium
and WebKit) against the Next dev server on `127.0.0.1:8768` for every capture;
QGIS (PyQGIS loader) for the human review; `gh` for PRs; the repo-local
Supabase and Vercel CLIs for flags, migrations and previews (owner-gated).

### 3.1 Acquisition and packaging (`scripts/golf/course-geometry/`)

| Script | Does | In → out |
|---|---|---|
| `audit-library-coverage.py` | Library-wide "can the pipeline even start" inventory: OSM features near the city, 3DEP 1 m tile presence, verdict per facility | `courses.json` (library rows) → `coverage.json` + `coverage.md` |
| `audit-course-cohort.py` | Bounded, cached public-source discovery for the non-demo usage cohort | cohort → per-course source notes |
| `fetch-osm-course.py` | Retain one bounded Overpass extract for a whole course (golf features, holes, water, cart paths) | scorecard JSON → `sources/<slug>-osm/` |
| `prepare-osm-course.py` | Build the `source_candidate` package and association report from the retained extract; `--canopy-review` merges woods, `--traces` merges imagery traces with a stated accuracy | extract + scorecard → `normalized.json` (becomes `<slug>.json`) + review report |
| `compile-course-terrain.py` | Select the newest native 1 m 3DEP tile whose export is not empty fill, lock it, compile per-hole meshes (`course-terrain-v4`), `--context` turns reviewed ribbons into breaklines | package + source dir (+ context) → `compiled-<slug>/` |
| `elevation_raster.py` | GDAL decode of the immutable GeoTIFF with its nodata mask (Pillow only as a named fallback) | — |
| `derive-canopy-naip.py` | NAIP export, NDVI > .28 and 7×7 NIR texture std > 10.5, golf surfaces masked ± 3 px, open 3×3 / close 5×5, groups ≥ 400 m², vector close 6 m / open 2 m, simplify 2 m (4 m past 400 vertices), clipped to hole features ± 160 m | package + terrain dir → `<slug>-canopy-review.json` (+ NAIP export in `output/`) |
| `review-course-imagery.py` | Per-hole dossier at 3×: every feature over NAIP, contact sheet, bunker sand agreement inside vs a 6 m ring, unclaimed sand blobs | package + NAIP dir → `<slug>-imagery-review.json` + PNGs |
| `fetch-osm-context.py` | Retain the outside-world extract, 250 m margin, with tag counts and sha256 | course bbox → `sources/<slug>-osm-context/` |
| `prepare-context-layer.py` | Classify both extracts with `OSM_CONTEXT_RULES` into the context layer (locked to the package hash) and write the context report (per-hole class areas, uncertain share, worst-first ranking) | extracts + compiled dir → `<slug>-context.json`, `<slug>-context-report.json` |
| `build-course-world.py`, `normalize-study.py`, `compile-physical-world.py`, `course-truth-gate.py` | Per hole: canonical local-metre study → physical world → truth gate → GLB → round trip; the gate rejects unreviewed OSM boundaries by design | package + terrain → `output/course-geometry/<slug>-world/` + `course-world-manifest.json` |
| `fetch-nc-lidar-study.py`, `fetch-nc-ortho-study.py`, `prepare-nc-studies.py` | The NC OneMap study fetches (DEM03, native-GSD ortho) used for the Bryan/Cardinal green studies | bounded study crops |
| `audit-terrain-normals.py`, `audit-normal-continuity.mjs`, `vectorize-terrain.py` | Terrain correctness audits (normals vs the DEM gradient, continuity, exact depth ordering) | compiled mesh → report |

### 3.2 Review tooling (human passes)

| Script | Does |
|---|---|
| `build-qgis-review-kit.py` | QGIS project + PyQGIS loader: the package, the context layer (`--context`), the imagery-review flags (`--imagery-review`), the NAIP evidence layers (`--evidence`: classified unexplained ground raster + per-hole polygons), NAIPPlus basemap; a README telling the reviewer what each layer may and may not do |
| `apply-review-adjustments.py` | Applies the reviewer's sidecar (`accepted` / `adjust` / `reject` per zone or feature) to the canonical package/context; derived zones are added by hand per design step 4 |
| `build-context-prompt-sheet.py` | The §39 review sheet: per hole, the evidence and a data-derived draft answer beside every prompt, marking which only a reviewer can answer; carries the NAIP class mix, honest woods cover and canopy re-run figures |
| `report-unexplained-naip.py` | What the unexplained context ground is in NAIP (canopy / meadow / mown turf / bare / dark) with thresholds measured on the package's own surfaces; overlays, contact sheet, JSON, two QGIS layers; refuses to run unless it reproduces the retained report on every hole |
| `measure-canopy-rerun.py` | Measures (never applies) a canopy pass re-run out to the hole bounds; tallies the clearings the exterior-ring output fills |
| `render-source-review.py`, `source-overlay.py`, `review-report.tsx`, `render-top-courses.tsx` | Offline orthophoto + overlay renders and deterministic SVG reports for human comparison |

### 3.3 Renderer, captures and sign-off

| Script | Does |
|---|---|
| Lab / fixture pages on `:8768` | `?course=<slug>` entry/review, `?matrix=1&course=<slug>&hole=N`, `?play=1&course=<slug>` local play-through, `?lab=1&course=<slug>&hole=N` render-quality lab with layer multipliers, `?onetap=1` One-Tap fixture |
| `capture-visual-canaries.cjs` + `build-canary-sheet.py` + `diff-visual-canaries.py` | The 96-capture lab matrix with `canaries.json` (draw calls, triangles, the hole's uncertain share and gate), contact sheet, pixel diff against the previous label (fails on a draw-budget breach) |
| `capture-player-view.cjs` | The production player view, phone, Terrain + Green on all 18 holes (36 captures, page errors, draw calls, chrome identity) |
| `capture-one-tap.cjs`, `capture-one-tap-motion.cjs`, `capture-flythrough.cjs`, `capture-lab.cjs`, `probe-overlay-still.cjs` | One-Tap production-mode audit (`--world=v2`), gesture/motion recordings, review flythrough per hole, single lab frames, the still-frame overlay probe |
| `compile-visual-artifacts.mts`, `compile-visual-artifacts-v2.mts`, `compile-display-lods.mts`, `validate-v2-budgets.mts`, `compare-canaries.mts`, `export-v2-glb.mts`, `report-structure-glb.mts` | Meridian visual artifact compilers, LODs, budget validators and GLB exports |
| `publish-course-assets.mts` | Copies the approved package, context layer and per-hole terrain into `public/course-geometry/<slug>/` under hash-named files with a manifest, re-verifying every hash; reaches players only through a deploy |

### 3.4 App binding (the part that is single-course today)

- `src/lib/golf/one-tap/peek-n-peak-policy.ts` — `PEEK_N_PEAK_ONE_TAP_V1`: `courseId 'peek-n-peak-upper'`, `siteId 'osm-way-136097904'`, projection `wgs84-local-enu-v1`, flag `peek_n_peak_one_tap_v1`, sync flag `peek_n_peak_one_tap_sync_v1`, `approvedGeometryHashes` (one hash), `dbCourseIds` (empty) and a `courseNamePattern` regex that matches the round's course name. Eligibility reasons, in order: `wrong_course`, `wrong_site`, `source_candidate_package`, `geometry_hash_not_approved`, `feature_flag_off`, `location_unavailable`.
- `src/components/golf/course-geometry/use-course-geometry.ts` — the standard tracker, the new-round tracker and the review page load the package when `productCourseIdForRound(round)` equals the policy's course; every other course makes 0 geometry requests (pinned by tests).
- `src/lib/golf/one-tap/course-assets.ts` — preflight and load from `/course-geometry/<courseId>/manifest.json` with the offline cache.
- `config/feature-flags.yml` — `peek_n_peak_one_tap_v1` (row 158); the sync flag needs `supabase/migrations/20260916_peek_n_peak_one_tap.sql` (`golf_shot_anchors` & co.) applied through `db-apply.yml` first — branch-only today.

### 3.5 Gates that every change passes

`npm run knowledge:check` (registry + document inventory), the markdown lint
ratchet (no new violations), Review Gate (ruff/pylint on changed Python,
eslint/tsc), CodeQL, unit tests, Next build, Supabase lint + RLS tests,
Playwright smoke, Sentry snapshots (owner approval). CI on the PR is the merge
gate; `npm run pr:land -- <n>` is the merge, and merging #1939 is the
production deploy.

## 4. The process for one course, stage by stage

Times are estimates from the Upper build (its stages landed 2026-09-15 → 17
while the tooling was being written; a second course reuses all of it).
"Machine" runs unattended; "Human" is a person looking at imagery, QGIS or the
course itself.

### Stage 0 — Intake (human, 30–60 min)

1. Resolve the library row(s): which `golf_courses` ids, which facility, which
   layout (Champions vs Players, Big Blue vs Wildcat, the Landfall nines).
2. Transcribe the official scorecard into `pilots/<slug>-scorecard.json`
   (`siteId`, `name`, `slug`, `originWgs84`, `scorecardYards[18]`, `pars[18]`,
   `routeWayIds[18]`, `officialScorecardUrl`, `retrievedAt`, `bboxWgs84`).
   The route way ids are the 18 OSM `golf=hole` ways in scorecard order — the
   one place a person pins routing to the card.
3. Confirm the OSM site id from the coverage audit (`osmCourse` or the human
   pin) and note anything odd (shared greens, missing tees, a relation that
   spans two courses).

### Stage 1 — Retain the OSM extract (machine, minutes)

`fetch-osm-course.py pilots/<slug>-scorecard.json sources/<slug>-osm` — one
bounded Overpass call, gzipped, manifest with query, tag counts, sha256.
Overpass timeouts are retried, never read as "nothing there".

### Stage 2 — Build the package (machine, seconds; re-run after 3b and every review)

`prepare-osm-course.py sources/<slug>-osm/overpass.json.gz pilots/<slug>-scorecard.json output/course-geometry/<slug>-package`
→ `normalized.json` becomes `<slug>.json`; the association report (routes ↔
scorecard, tees ↔ holes, shared greens, unmatched features) merges into
`<slug>-review.json`. Everything is `source_candidate`, truth class from
provenance, `reviewed: false`. What OSM lacks stays missing: a hole without a
fairway is a partial hole, not a drawn one; a trace from retained orthophoto
(`--traces`) enters with its tiles, dates, raster hash, tracer and stated
`accuracyMeters`, and the truth gate still fails on it.

### Stage 3 — Terrain (machine, ~10–30 min incl. the USGS export)

`compile-course-terrain.py --holes all --package <slug>.json --source sources/<slug>-terrain --output compiled-<slug> [--context <slug>-context.json]`
selects the newest 3DEP native 1 m tile whose export is not empty fill, locks
its hash, compiles per-hole meshes (`course-terrain-v4`: noded planar
arrangement, `noding.tJunctionVertices` must be 0, no per-vertex normals).
Re-run once more after Stage 4 with `--context` so cart paths, service paths
and roads become breaklines (vertices along every ribbon edge, 4 m cells within
60 m of the hole). Courses with no 1 m tile stop here until the NC adapter
exists (§5).

### Stage 3b — Canopy (machine, ~10 min; the 7×7 texture filter is the slow step and is cached)

`derive-canopy-naip.py <slug>.json sources/<slug>-terrain output/course-geometry/<slug>-naip <slug>-canopy-review.json`
then Stage 2 again with `--canopy-review` and Stage 3 again, so woods are
package features and the meshes tessellate them as a material. Check the
thresholds against the course's own surfaces (mown fairway NDVI at the Upper
was .14–.31, so low NDVI is grass, not bare ground). Known limitation to
record per course: the pass writes exterior rings only, so clearings a group
encloses are carried as woods (Upper: 3.5 ha today).

### Stage 3c — Imagery review dossier (machine minutes; human 2–3 h per course)

`review-course-imagery.py <slug>.json output/.../<slug>-naip output/.../<slug>-imagery-review <slug>-imagery-review.json`
draws every feature over NAIP per hole at 3× and scores every bunker's sand
agreement. The human pass: walk the contact sheet, flag mis-traced or
grass-faced bunkers, decide whether NAIP is current enough for this course
(renovations, new tees), list surfaces that need a trace. Nothing in the
dossier moves a polygon; the reviewer records decisions in the QGIS sidecar.

### Stage 4 — Outside world (machine minutes; human §39 pass 2–4 h)

1. `fetch-osm-context.py` → `sources/<slug>-osm-context/` (250 m margin).
2. `prepare-context-layer.py` → `<slug>-context.json` + `<slug>-context-report.json`
   (zones attached to holes by compiled-terrain context bounds; the uncertain
   share per hole; gate < 15 %).
3. `build-context-prompt-sheet.py` → the per-hole §39 sheet;
   `report-unexplained-naip.py` → what the unexplained ground is; both feed the
   QGIS kit (`--evidence`).
4. The reviewer answers the prompts per hole in QGIS: correct classes, accept
   or reject zones (sidecar), add `derived` terrain-context zones by hand where
   the DEM and imagery justify them, mark the layer `partial` or `reviewed`.
   Nothing is added because a space looks empty.
5. Stage 3 again with `--context` (breaklines), Stage 2 if the sidecar touched
   golf features.

### Stage 5 — Per-hole metric chain and truth gates (machine, minutes)

`build-course-world.py <slug>.json sources/<slug>-terrain output/course-geometry/<slug>-world`
→ per hole: canonical study, physical world, truth gate, GLB, round trip;
`course-world-manifest.json` records hashes and verdicts. Unreviewed OSM
boundaries fail by design; a passing gate needs a course-familiar review that
records boundary uncertainty (or a walk of the course).

### Stage 6 — Boundary and package review (human, 2–6 h; scales with bunker count)

`build-qgis-review-kit.py <slug>.json output/course-geometry/<slug>-review-kit --context=… --imagery-review=… --evidence=…`
→ the reviewer accepts/adjusts/rejects features and zones; the sidecar is
applied with `apply-review-adjustments.py`; Stages 2 → 3 → 4.2 re-run
(new package hash, every downstream file re-locks). The owner then either
approves the resulting hash (pilot exception, as for the Upper) or the review
lifts `source_candidate` on the reviewed features.

### Stage 7 — Sign-off matrices (machine, ~45 min on this Mac)

With the dev server on `:8768` and no `src` edits while it runs:
`capture-visual-canaries.cjs --label=<slug>-v1` (96 captures; 0 errors; every
capture within its draw-call budget; `canaries.json` carries the uncertain
share and gate per hole), `capture-player-view.cjs` (36 captures, 0 page
errors, identical chrome on every hole), `diff-visual-canaries.py` against the
previous label, `build-canary-sheet.py` for the sheet that goes to the owner
with the screenshots. Any draw-budget breach or page error is a stop.

### Stage 8 — Publish and bind (machine minutes; then a normal PR)

`publish-course-assets.mts --course=<slug>` → `public/course-geometry/<slug>/`
(hash-named files + manifest, every hash re-verified). Add the course to the
app's course registry (§5.2) with its approved hash, matchers (`dbCourseIds`
and/or a name pattern) and flag ids. Verify on the Vercel preview: the course
frame, 3D on expand, tap-to-measure, terrain for the hole on screen + next,
and 0 geometry requests on every other course (`upper-only-package-report.md`
is the template).

### Stage 9 — Flags, migration, deploy (owner)

Flag rows in `config/feature-flags.yml`; the sync flag only after the
migration is applied through `db-apply.yml`; production deploy is
`npm run pr:land -- <n>` / `scripts/deploy-prod.sh`, owner-only, capped by
`config/release-policy.yml`.

### Rules that hold at every stage

- Never invent: source preference is reviewed OSM → traced from retained
  orthophoto with a stated accuracy → derived (buffers, DEM-derived classes) →
  uncertain, which paints nothing. No fairway, tee or bunker is drawn because
  it "should" be there.
- Retained evidence and hash locks at every hop; a mismatch is a refusal.
- Canopy bounds crown artwork only; no height, currentness or obstruction claim.
- `output/` is never committed; fixtures and `public/` are.
- No production writes; flags, migrations and deploys are the owner's.

## 5. Tooling to build before the second course (enabling work, agent)

| # | Work | Why | Estimate |
|---|---|---|---|
| 5.1 | `scripts/golf/course-geometry/build-course.sh <slug>` — Stages 1 → 5 and 7 in order with the hash checks between them, resumable per stage, writing a per-course build log; a per-course checklist in the README (scorecard, site id, DEM candidate check, NAIP dates, canopy threshold review, dossier, corridor traces, boundary review, truth gate, matrix capture) | Today each course is ~a dozen hand-run commands with hand-checked hashes | 1 day; proven on Cacapon |
| 5.2 | Multi-course registry in `src`: replace the single `PEEK_N_PEAK_ONE_TAP_V1` with a list of course policies (courseId, siteId, approved hashes, `dbCourseIds`, name pattern, flag ids); `productCourseIdForRound`, `useCourseGeometry`, `preflightCourseAssets`/`loadCoursePackage` and `publish-course-assets.mts` take the resolved policy; tests pin that unlisted courses still make 0 requests | The app can bind exactly one course today | 1 day incl. tests and a build |
| 5.3 | Per-course flag scheme: either one flag per course (`<slug>_course_geometry_v1`) or one library flag with a course allow-list — owner's pick; registry generation (`src/lib/flags/registry.generated.ts`) follows | Rollout per course without a deploy | ½ day after the pick |
| 5.4 | NC OneMap DEM03 adapter in `compile-course-terrain.py` (the study fetch exists: `fetch-nc-lidar-study.py`): same source-manifest contract, native grid, no resampling to 1 m unless recorded | Unlocks 14 NC courses (Bryan ×2, Cardinal, Starmount, Sedgefield, Cutter Creek, Duke, Pinehurst No. 2, Forest Creek, Forest Oaks, Alamance, Benvenue, Eagle Point, Magnolia Greens) | 1–2 days incl. a compile of one NC course and the normals audit |
| 5.5 | Cacapon recompile: `course-terrain-v1` → `v4` with context breaklines, canopy re-derived with the current thresholds, association report refreshed against the retained extract | Its meshes predate every renderer contract | part of the Cacapon run |
| 5.6 | Cohort refresh + unlinked-name resolution (`audit-course-cohort.py`; 105 completed-round names are unlinked) | Order by real usage | ½ day machine + owner answers |
| 5.7 | Capture matrices parameterised by course (`capture-visual-canaries.cjs`, `capture-player-view.cjs` already take `COURSE`/`--course`; the diff and sheet scripts need the label convention `<slug>-vN`) | Sign-off per course | ½ day |

## 6. Per-course plan

Cohort rounds are completed rounds in the non-demo cohort of 2026-09-13
(`course-cohort-2026-09-13.json`); "—" means the course is in the library
but not in that cohort. OSM ids and feature counts are the audit's
(`h` holes, `g` greens, `f` fairways, `b` bunkers, `t` tees inside the course
polygon unless the basis says `around`). DEM is the 3DEP project tile the
compiler would lock.

### Wave 0 — Peek'n Peak Upper (NY) — at the bar; owner items remain

`way/136097904`, h18 g19 f22 b57 t27, DEM `PA_WesternPA` rejected → `NY Southwest East 2017` retained.
Open: §39 per-hole answers + item-10 sign-off; the canopy re-run decision
(measured: gate 1 → 4 of 18, woods 120.6 → 162.1 ha, new package hash);
device runs §103/§104; Sentry snapshot approval; flag rows; migration before
the sync flag; `pr:land 1939`.

### Wave 1 — Cacapon State Park (WV), 36 rounds — the second course

`way/223477412`, h18 g18 f18 b71 t22, DEM `USGS 1 Meter 17 x73y438 MD_Western`.
Have: `cacapon.json` (151 features, built by the older `prepare-pilot.py`
path), `cacapon-source.json` (an OSM API map extract of 156 elements retrieved
2026-09-12 with a raw-XML sha — not a retained Overpass gzip with a manifest),
`cacapon-scorecard.json` in the old shape (`source`, `teeName`, `holes` — not
the pilot schema), `cacapon-associations.json`, `cacapon-quality.json`,
`cacapon-canopy-review.json`, `sources/cacapon-course-terrain` (tile
`USGS 1 Meter 17 x73y438 MD_Western_2021_D21`, acquired 2021-12-04),
`compiled-cacapon` (18 holes, `course-terrain-v1`).
Audit note: 18 uniquely numbered routes matching the scorecard pars; **shared
green 4/8** (review whether OSM merged two greens or the course really shares
one).
Plan: Stage 0 writes `pilots/cacapon-scorecard.json` in the pilot schema
(pars and yards carried over from the old scorecard fixture, the 18 route way
ids pinned by hand, `bboxWgs84`, `originWgs84`) → Stage 1 retains a fresh
Overpass extract (there is none) → 2 (the current chain, not `prepare-pilot.py`)
→ 3 with `course-terrain-v4` (the existing terrain directory is reused only if
its request bounds and every file hash match the new package; otherwise a new
acquisition of the same tile) → 3b → 3c → 4 → 5 → 7 → 8, with
`build-course.sh` written against it. The old fixtures stay until the new
package replaces them in one commit, so the fixture harness never points at a
half-built course.
Machine: one night. Human: the route pinning at Stage 0 (~1 h), imagery pass
(71 bunkers, ~2–3 h), §39 pass, the 4/8 green decision, hash approval.

### Wave 2 — Winchester CC (VA), 30 rounds

`way/800486466`, h18 g18 f19 b45 t39, DEM `VA_Northern`. Have: `winchester.json`
(160 features), `winchester-review.json`, hole-7 terrain study only. Audit:
"18 routes and greens; not reviewed per hole". Plan: full chain from Stage 1
(the package predates the current `prepare-osm-course.py`), whole-course
terrain, then everything after. Machine: one night. Human: as Cacapon (45 bunkers).

### Wave 3 — source-complete courses (24 more), by usage then alphabetically

Each runs the whole chain unchanged; the per-course notes are the review risks.

| Course | State | OSM | Features (h/g/f/b/t) | DEM tile | Rounds | Notes for review |
|---|---|---|---|---|---|---|
| Big Blue Course (UK) / UK Blue Course | KY | `way/258229089` (pin) | 36/37/43/79/129 | KY_Central | 19 | One polygon holds Big Blue and Wildcat: Stage 0 must pick the 18 routes per layout; two library rows, one facility |
| Grande Dunes Resort Club | SC | `relation/3973681` | 18/19/23/42/67 | SC_2023 | 13 | Clean |
| Forsyth Country Club | NC | `way/31294445` | 18/21/23/27/19 | NC_Phase4 | 7 | One of four NC courses with a 1 m tile |
| PGA National – Champion | FL | `way/1483954804` | 41/88/67/191/243 | FL_Peninsula | 2 | Resort polygon spans several courses: route selection by scorecard is the whole job |
| Pebble Beach Golf Club | CA | `relation/3741806` | 18/18/26/120/70 | CA_AZ_FEMA | — | 120 bunkers → long imagery pass; coastal NAIP glare |
| Isleworth G&CC | FL | `relation/21236557` | 18/30/20/77/76 | FL_Peninsula | — | 30 greens for 18 holes: practice greens to exclude |
| Sawgrass Country Club | FL | `relation/1783026` | 27/29/33/146/113 | FL_Peninsula | — | 27 holes: layout pick |
| TPC Sawgrass | FL | `relation/1783123` | 36/60/50/155/117 | FL_Peninsula | — | Stadium vs Dye's Valley: layout pick; water everywhere (dark-class thresholds) |
| World Golf Village – King & Bear | FL | `way/678136658` | 18/20/22/70/75 | FL_Peninsula | — | Clean |
| Club at Savannah Harbor | GA | `way/31468114` | 18/21/19/88/65 | GA_Statewide | — | Marsh edges: wetland zones matter in Stage 4 |
| Pine Lakes Jekyll Island | GA | `way/133692507` | 63/66/71/132/50 | GA_Statewide | — | Polygon covers Jekyll's three-plus courses: layout pick |
| Reynolds Lake Oconee – Great Waters | GA | `way/776584699` | 18/19/21/51/57 | GA_Central | — | Lake shoreline water zones |
| Pilot Knob | NC | `way/352559788` | 18/19/23/45/47 | NC_Phase_4 | — | Clean |
| Statesville Country Club | NC | `way/351674356` | 18/20/17/53/55 | NC_Phase4 | — | 17 fairways: one hole partial |
| Bethpage Black | NY | `way/29468839` | 90/96/110/272/214 | NY_LongIsland | — | Five courses in one polygon: the Black's 18 routes by scorecard |
| Denison Golf Club | OH | `relation/20395689` | 18/20/19/60/55 | OH_Statewide | — | Clean |
| Harbour Town Golf Links | SC | `relation/4813858` | 18/31/31/75/38 | SC_Savannah | — | 31 greens/fairways: neighbouring courses inside the relation |
| Kiawah Island – Ocean Course | SC | `relation/17647608` | 18/21/22/78/68 | SC_Savannah | — | Dunes and marsh: canopy thresholds need a re-check (little forest) |
| Blue Ridge Shadows GC | VA | `way/298698170` | 18/18/22/42/74 | VA_Northern | — | Clean |
| Golden Horseshoe Gold Course | VA | `way/242651981` | 18/21/17/52/49 | VA_Hampton | — | 17 fairways: one hole partial |
| Shenandoah Valley GC | VA | `way/298698194` | 19/27/30/48/74 | VA_Northern | — | 27 holes (three nines): layout pick |
| Whistling Straits | WI | `way/205111637` | 18/39/64/1384/121 | WI_2County | — | 1384 bunker polygons: the imagery pass is days, not hours; consider a bunker-cluster review mode first |

### Wave 4 — mapped, no 1 m 3DEP tile (needs the NC adapter, §5.4)

| Course | OSM | Features | Rounds | Notes |
|---|---|---|---|---|
| Bryan Park Champions / Players (Greensboro) | none matched; `around_2500m` 1/23/22/87/79 | — | 45 (Champs) | No `golf_course` polygon in OSM for the facility; one hole route mapped; two layouts share the crop; 2022 ortho (0.15 m) rejected as current after reported bunker renovations. Needs: an OSM pin or polygon, the layout pick, the NC DEM adapter, a currency decision on imagery |
| The Cardinal (Greensboro) | `relation/6542700` (pin; now "Sedgefield CC, Dye Course") | 0/20/0/52/0 | 30 | Greens and bunkers only: **no routes, fairways or tees in OSM** — someone maps them (or traces from retained ortho with a stated accuracy) before a package exists; NC DEM |
| Starmount Forest (Greensboro) | `way/570398442` | 18/23/19/84/63 | 23 | Complete in OSM; NC DEM only |
| Cutter Creek (Snow Hill) | `way/1545511574` | 18/20/22/60/91 | 8 | Complete; NC DEM |
| Magnolia Greens (Leland) | none matched; `around_2500m` 18/19/0/8/9 | 5 | Three nines; **no fairways, 8 bunkers, 9 tees** mapped; NC DEM |
| Forest Oaks (Greensboro) | none matched; `around_2500m` 18/19/20/62/69 | 2 | Complete features, no facility polygon: pin needed; NC DEM |
| Sedgefield CC (Greensboro) | `relation/12580941` (pin) | 18/27/24/59/66 | — | The Ross course; NC DEM |
| Duke University Golf Club | `way/32921522` | 18/33/19/75/66 | — | 33 greens: exclude practice; NC DEM |
| Pinehurst No. 2 | `way/1358696570` | 19/24/35/126/4 | — | **4 tees mapped**; NC DEM |
| Eagle Point (Wilmington) | `way/1509573612` | 27/30/22/74/69 | — | 27 holes: layout pick; NC DEM |
| Forest Creek (Pinehurst) | `relation/6384809` | 18/7/9/8/30 | — | 7 greens, 9 fairways: mostly unmapped; NC DEM |
| Alamance CC (Burlington) | `relation/6411268` | 0/18/18/61/69 | — | **No hole routes**: routes must be mapped or pinned; NC DEM |
| Benvenue CC (Rocky Mount) | `way/227971180` | 18/21/22/42/55 | — | Complete; NC DEM |
| Oviinbyrd Golf Club (ON) | `way/246479522` | 18/21/23/37/81 | — | Outside USGS 3DEP; no Canadian terrain source is wired — parked |

### Wave 5 — in OSM without hole features, partial, or absent (mapping first)

| Course | OSM | Features | Rounds | What has to happen first |
|---|---|---|---|---|
| CC of Landfall (Marsh 9 / Ocean 9 / Nick nines) | `way/524540524` | 0/0/0/0/0 | 7 + 5 + 3 + 3 + 2 | Nothing mapped: the five nine-hole combinations in the cohort need the 45 holes mapped and the combos defined at Stage 0 |
| Cape Fear CC (Wilmington) | `way/479644879` | 1/1/1/3/4 | — | Mapping |
| Hendersonville CC | `way/439392038` | 0/0/0/0/0 | — | Mapping (1 m tile exists) |
| Boonsboro CC (Lynchburg) | `way/518032130` | 0/6/7/0/25 | 7 | Mapping (1 m tile exists) |
| Danville Golf Club | `way/1125732485` | 0/0/0/0/0 | — | Mapping (1 m tile exists) |
| Lakeview Golf Club (Harrisonburg) | `relation/15101713` | 0/0/0/0/0 | — | Mapping (1 m tile exists) |
| Poplar Grove (Amherst) | `relation/17240231` (pin) | 0/1/1/2/5 | — | Mapping (1 m tile exists) |
| The Manor (Farmville) | `way/187885811` | 0/0/0/0/0 | — | Mapping (1 m tile exists) |
| Sea Island – Seaside (partial) | `way/301551447` | 17/18/21/66/71 | — | One hole line missing in OSM: a small fix, then Wave 3 |
| Marsh Landing CC (partial) | none matched; `around_2500m` 44/36/36/171/98 | — | No facility polygon; neighbouring courses in the crop: pin + layout pick, then Wave 3 |
| River Landing (River / Landing), Wallace NC | not found | — | 9 + 7 | No golf feature within 3 km in OSM: mapping from zero (and NC DEM) |

Cohort courses not in the library audit (name resolution needed at Stage 0):
Pinehurst No. 8 (7 rounds). "PGA National – Champ" (2 rounds) is the
library's PGA National row.

Mapping means someone adds the features to OpenStreetMap (or we trace them
from retained orthophoto with a recorded accuracy, in which case the hole is
partial and the truth gate fails until reviewed). We do not draw a course from
memory.

## 7. Effort and cadence (estimates)

Per course, after §5: machine ≈ 1 h unattended (extract, package, terrain,
canopy, dossier, context, world, matrices), plus the USGS/NAIP export waits.
Human ≈ ½–1 day: intake 0.5–1 h, imagery pass 2–3 h (scales with bunkers;
Whistling Straits is an outlier), §39 context pass 2–4 h, boundary review
2–6 h, hash approval minutes; the on-course truth walk is a round of golf and
is the only way a truth gate passes.

Cadence: tooling (§5.1–5.3, 5.7) ≈ 3 agent-days; Cacapon end to end in the
first night after it, Winchester the next; then 2–4 courses per week bounded
by review time, machine runs in parallel overnight. The NC adapter (§5.4)
≈ 2 days opens Wave 4; Wave 5 has no machine path until the mapping exists.

Disk: each course keeps ~0.3–0.6 GB of retained rasters and captures under
`output/`; this Mac has 11–13 GB free with the disk guard armed at 8 GB, so
`output/` for finished courses is cleared after their fixtures are committed.

## 8. Risks and non-negotiables

- **Invented geometry.** The largest risk at scale is a pipeline that fills
  gaps. Every stage refuses; keep it that way (truth classes, `reviewed`
  flags, uncertain paints nothing).
- **Layout identity.** Multi-course facilities (Bethpage 90 holes, PGA
  National 41, Pine Lakes 63, TPC/Sawgrass, UK, Landfall, Shenandoah) are a
  human decision at Stage 0; a wrong pick renders a real course wrongly.
- **Imagery currency.** NAIP is 1–3 years old and leaf-on; bunker renovations
  and new tees will be wrong until a newer source is accepted, and the dossier
  says so per bunker.
- **Terrain gaps.** 14 NC courses and Ontario have no 1 m 3DEP; never
  substitute coarse terrain silently.
- **Production.** Publishing to `public/` is a source change that ships only
  through a deploy; flags, the sync migration (RLS, shared database with
  Baseball and Lift Lab) and deploys stay owner-only.
- **Rate limits.** Overpass and Nominatim are throttled; the audits sleep
  between calls and cache; batch fetches overnight.
- **Review debt.** Publishing under the pilot exception for every course
  accumulates unreviewed `source_candidate` packages; decide per course.

## 9. Decisions needed from the owner

1. Go/no-go on the enabling tooling (§5.1–5.3, 5.7) and Cacapon as the second course.
2. Flag scheme: one flag per course or one library flag with an allow-list.
3. Whether the NC adapter (§5.4) is worth 2 days now (it unlocks Bryan Park,
   the Cardinal's greens study, Starmount, Cutter Creek — 4 of the 6 most-played
   cohort courses are in NC).
4. Per course: layout pick, hash approval (pilot exception or reviewed
   package), imagery-currency acceptance.
5. Who does the human passes (imagery, §39, boundary) and on what cadence;
   whether course-familiar players walk the truth gates.
6. Priority: usage order (Cacapon, Winchester, UK, Grande Dunes, Forsyth …) or
   marquee courses first (Pebble, Bethpage, Kiawah, Whistling Straits, TPC).

## 10. Appendix — command sheet for one course (Cacapon), in order

```bash
S=scripts/golf/course-geometry; F=src/test/fixtures/course-geometry; O=output/course-geometry; C=cacapon
# Stage 0 first: write $S/pilots/$C-scorecard.json in the pilot schema (it does not exist yet; the fixture $F/$C-scorecard.json is the old shape)
python3 $S/fetch-osm-course.py $S/pilots/$C-scorecard.json $F/sources/$C-osm
python3 $S/prepare-osm-course.py $F/sources/$C-osm/overpass.json.gz $S/pilots/$C-scorecard.json $O/$C-package
cp $O/$C-package/normalized.json $F/$C.json          # + merge the association report into $F/$C-review.json
python3 $S/compile-course-terrain.py --holes all --package $F/$C.json --source $F/sources/$C-terrain --output $F/compiled-$C
python3 $S/derive-canopy-naip.py $F/$C.json $F/sources/$C-terrain $O/$C-naip $F/$C-canopy-review.json
python3 $S/prepare-osm-course.py $F/sources/$C-osm/overpass.json.gz $S/pilots/$C-scorecard.json $O/$C-package --canopy-review $F/$C-canopy-review.json
cp $O/$C-package/normalized.json $F/$C.json
python3 $S/compile-course-terrain.py --holes all --package $F/$C.json --source $F/sources/$C-terrain --output $F/compiled-$C
python3 $S/review-course-imagery.py $F/$C.json $O/$C-naip $O/$C-imagery-review $F/$C-imagery-review.json
python3 $S/fetch-osm-context.py $S/pilots/$C-scorecard.json $F/sources/$C-osm-context      # --margin-m 250 default
python3 $S/prepare-context-layer.py $F/$C.json $F/sources/$C-osm/overpass.json.gz $F/sources/$C-osm-context/overpass.json.gz $F/compiled-$C $F   # writes $F/$C-context.json + $F/$C-context-report.json
python3 $S/compile-course-terrain.py --holes all --package $F/$C.json --source $F/sources/$C-terrain --output $F/compiled-$C --context $F/$C-context.json
python3 $S/build-context-prompt-sheet.py $F/$C.json $F/$C-context.json $F/$C-context-report.json $F/compiled-$C docs/plans/<date>-$C-review-prompts.md
python3 $S/report-unexplained-naip.py $F/$C.json $F/$C-context.json $F/$C-context-report.json $F/compiled-$C $F/sources/$C-terrain $O/$C-naip $O/$C-unexplained --fixture=$F/$C-unexplained-naip.json
python3 $S/build-qgis-review-kit.py $F/$C.json $O/$C-review-kit --context=$F/$C-context.json --imagery-review=$F/$C-imagery-review.json --evidence=$O/$C-unexplained
python3 $S/build-course-world.py $F/$C.json $F/sources/$C-terrain $O/$C-world
# human passes → sidecar → python3 $S/apply-review-adjustments.py … → re-run package, terrain, context
node $S/capture-visual-canaries.cjs --label=$C-v1 --course=$C
node $S/capture-player-view.cjs --course=$C --out=output/playwright/course-geometry/visual-system/player/$C-v1
python3 $S/build-canary-sheet.py output/playwright/course-geometry/visual-system/canaries/$C-v1 390x844 sheet.png
node_modules/.bin/tsx --tsconfig tsconfig.json $S/publish-course-assets.mts --course=$C
```

Every argument order above is the script's `--help` today; `build-course.sh`
(§5.1) will encode the sequence and the hash checks between the steps.
