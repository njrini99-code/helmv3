<!-- markdownlint-disable MD013 MD060 -->
# Factory v2 — engineering review against the branch

Reviewed 2026-09-19 on `agent/golf-course-geometry` (head `036d55262`).
Subject: `docs/plans/2026-09-19-course-geometry-factory-v2.md` (the owner's
plan). Verdict first, then what the code confirms, what sharpens the plan,
the adjustments I would make, and the first slice ready to start.

## Verdict

Adopt it. It changes the unit of scale (facility → layout), the unit of
rebuild (fingerprinted tasks, per-hole impact), the unit of review
(risk-ranked exceptions) and the unit of "done" (capability tiers) while
keeping every evidentiary rule the Peek'n Peak build proved. The earlier
scale-out plan stays as the inventory it was: sources, tools, the 52-facility
audit and the per-course notes are the factory's input data, not a competing
architecture. `build-course.sh` is dropped as an objective.

## What the code confirms (§2.4 checked line by line)

- `src/lib/golf/one-tap/peek-n-peak-policy.ts` owns the only policy shape and the only approved hash (`PEEK_N_PEAK_ONE_TAP_V1`, one `courseId`, one `siteId`, one hash, empty `dbCourseIds`, a name regex).
- `src/components/golf/course-geometry/use-course-geometry.ts` takes a `policy` parameter, defaults to that singleton, and activates only when `productCourseIdForRound(round, policy) === policy.courseId`.
- `src/lib/golf/one-tap/course-assets.ts` imports the singleton and its type; `scripts/golf/course-geometry/publish-course-assets.mts` calls `courseIdForSite` from the pilot module.
- Eleven non-test modules and five test files import the policy (`course-package-manifest.ts`, `live-round-placement.ts`, `use-one-tap*.ts`, the continue/new round pages, `use-course-geometry.ts`, plus `course-assets.test.ts`, `live-round-placement.test.ts`, `peek-n-peak-policy.test.ts`, `use-course-geometry.test.tsx`, `use-one-tap-live-round.test.tsx`). That is the exact blast radius of PR A.
- Package v1 is `siteId` + name + features + holes; no facility, segment, layout or scorecard-profile notion (`src/lib/golf/course-geometry/schema.ts`).

## Facts that sharpen the plan

- **Asset size is real, and the nearer cliff is the repo, not Vercel.** The published Upper is 53 MB (`public/course-geometry/peek-n-peak-upper`: 52 MB per-hole terrain JSON, 1.2 MB package, 0.2 MB context). The tracked fixtures add 63 MB compiled meshes + 25 MB terrain source per course. Fifty courses on today's model ≈ 2.7 GB under `public/` and ≈ 4.4 GB more in fixtures. §17/§18 (objects out of the tree, class B cache) is needed before the fifth course, not the fiftieth.
- **The published manifest is already content-addressed.** `manifest.json` names `package-<hash12>.json`, `context-<hash12>.json` and `terrain/<slug>-NN-<hash12>.json`; the loader takes a `baseUrl`. §17.3's manifest is a URL change plus bytes/sha fields, not a format migration.
- **Impact-graph inputs already exist.** Every feature and every context zone carries `holeKeys`; compiled terrain is one file per hole with its own hash in `asset-manifest.json`. §10's hole sub-hashes are bookkeeping over data the compiler already has.
- **Truth classes exist; capabilities do not.** `course-truth-gate.py` already enforces `measured | derived | estimated | visual_only`; the package carries `reviewed` and `accuracyMeters`. §5 adds `source_observed`, the review-state axis and `allowedCapabilities` — a schema v2 with a v1 adapter, as the plan says.
- **Eligibility is already a reason list.** `OneTapIneligibility` enumerates `wrong_course | wrong_site | source_candidate_package | geometry_hash_not_approved | feature_flag_off | location_unavailable`; `capability_not_available` is one more reason, and the Upper's pilot exception maps to `pilotAcceptsSourceCandidate: true` at tier C2 with no behaviour change.
- **Flags are booleans only** (`config/feature-flags.yml`: "never a percentage/cohort"). §27's allow-list therefore lives in the registry (approved hashes + layout ids), with `course_geometry_v2` as the kill switch — which is what §27 already proposes as the fallback.
- **The facility model can be seeded from the audit.** `output/course-geometry/library-coverage/coverage.json` already groups 64 library rows into 52 facilities with `libraryIds` per facility (Bryan ×2, UK ×2, Landfall ×5 rows on one polygon each), the OSM anchor, feature counts and the DEM tile. Facility manifests are a generator over it plus the human pins.
- **Tools on this Mac:** GDAL, PDAL, DuckDB (CLI and Python 1.5.4) present; `osmium-tool` and `pyosmium` absent (`brew install osmium-tool` / `pip install osmium`); QGIS is the reviewer's app, not on PATH. Disk is 11–13 GB free with the guard at 8 GB — class B eviction is a day-one requirement for regional PBFs, not a later nicety.

## Adjustments I would make

1. **Verify S1M coverage before ordering it first.** The current selector reads the 3DEP ImageServer catalog and rejects tiles whose export is empty fill (the Upper's `PA_WesternPA` case). S1M arrives as COGs; the provider needs a windowed `/vsicurl` reader and the same empty-fill validation. Run `discover()` for the 26 source-complete facilities and let the numbers decide the default order.
2. **Retain the AOI extract, not the PBF.** A Geofabrik state extract is hundreds of MB; retain its identity (URL, date, md5) and the osmium AOI extract's sha, evict the PBF. Keep `fetch-osm-course.py` as the oracle: the first facility extracted both ways must produce identical feature sets.
3. **Branch placement.** PR A changes `src` on the pilot path. It must not land on `agent/golf-course-geometry` — #1939 is the production deploy PR and its whole-course signoff is on `983570c56`. Start PR A from `main` after #1939 lands (or as a stacked branch if the landing is far off) — owner's call.
4. **Upper behaviour is a fixed point of PR A.** The five coupled test files become the regression suite: the registry version must produce the same eligibility, the same 0-requests-on-other-courses result and the same asset URLs for the Upper.
5. **Review console stays in the lab.** Build §13's queue as a local route beside `?lab=1` (read-only over the same fixtures, no production surface); QGIS remains the editor. The kit's evidence layers (`--evidence`) are the first "machine evidence" inputs.
6. **Measure before promising 30–90 min.** Record §22's session metrics from the first Cacapon pass; the imagery dossier already yields per-bunker agreement, so the risk score's first version can be built from data the branch has today.
7. **Appendix C arrived truncated**; the reason-code list is complete enough to implement as an enum now.

## PR A — built 2026-09-19 on `agent/course-factory-a`

Owner go: "Do it." Stacked on `agent/golf-course-geometry` (`f21bbfed0`), the
same worktree; #1939 is untouched. No player behaviour changes: the Upper
resolves, gates and renders exactly as before, and every other course still
resolves to null and makes no geometry request.

What landed:

- `src/lib/golf/course-geometry/course-policy.ts` — `CourseGeometryPolicy` (`layoutId`, `facilityId`, `siteIds`, `geometryFeatureFlag`, nullable `syncFeatureFlag`, `approvedGeometryHashes`, `acceptedCapabilityTier`, `pilotAcceptsSourceCandidate`, `dbCourseIds`, `courseNamePatterns`, `renderWorld`), `resolveCoursePolicy` (dbCourseId → name pattern → null), `isCourseGeometryEligible` with the same reason order as before plus `capability_not_available` (checked before the flag, only when a caller asks for a tier), `tierAtLeast`.
- `src/lib/golf/course-geometry/course-registry.ts` — `PEEK_N_PEAK_UPPER_POLICY`, `COURSE_GEOMETRY_REGISTRY = [PEEK_N_PEAK_UPPER_POLICY]`, registry-defaulted `resolveCourseGeometryPolicy`, `productCourseIdForRound`, `courseGeometryPolicyForLayout/Site`, `courseIdForSite`, `courseGeometryEligibility`.
- `src/lib/golf/one-tap/peek-n-peak-policy.ts` is a compatibility shim (`PEEK_N_PEAK_ONE_TAP_V1 = PEEK_N_PEAK_UPPER_POLICY`, old names delegate). No production module imports it any more; its test still pins the Upper facts.
- `course-assets.ts`, `course-package-manifest.ts`, `live-round-placement.ts`, `use-course-geometry.ts`, `use-one-tap*.ts`, both round pages and `publish-course-assets.mts` resolve their policy from the registry (`policy` stays an explicit override for tests and the lab).
- `OneTapLiveStatusRow` carries copy for `capability_not_available`.
- Catalog: `course-geometry/catalog/{facilities,layouts,scorecards}/*.json` for Peek'n Peak / Upper (from `pilots/peek-n-peak-upper-scorecard.json`) and Cacapon (tier C0, from the 2026-09-19 audit row and the old library scorecard fixture). JSON, not YAML: `yaml` is a devDependency and the app never needs to read these. `src/lib/golf/course-geometry/catalog.ts` holds the zod schemas and `catalogProblems` (cross-file and registry consistency); `__tests__/catalog.test.ts` and `__tests__/course-registry.test.ts` pin them.

Still single-course on purpose:

- The round pages evaluate `PEEK_N_PEAK_UPPER_POLICY`'s two flags into the existing `oneTapFlagEnabled` / `oneTapSyncEnabled` booleans. A second drawn layout needs a per-layout flag map through `ContinueRoundClient` / `NewRoundClient` (PR B/C), not two more booleans.
- `dbCourseIds` stays empty in the registry even though the catalog binds the Upper's `golf_courses` row; binding by id would change how a renamed course resolves and belongs with the round-page work above.

## PR B — built 2026-09-19 on `agent/course-factory-b`

Owner's plan: `docs/plans/2026-09-19-course-geometry-factory-v2-next.md`
(kept verbatim). Stacked on `agent/course-factory-a` (#1949); #1939 untouched.
Owner redirection mid-build: *"I don't need Peek'n Peak. We're trying to
replicate how detailed Peek'n Peak was and scale it for the other courses"*
and *"Focus on highly played courses first and scale them quick"*. PR B
therefore stops at making the Upper the adopted reference and spends its live
runs on the cohort.

What landed (`scripts/golf/course-geometry/factory/`, CLI `course-factory.py`):

- Catalog read/validate (`catalog.py`, same wording as `catalog.ts`; both
  sides accept `retained: {kind: path}` on facilities and layouts).
- Graph (`graph.py`): facility → layout → hole DAG, fan-in `*`, optional `?`
  deps, cycle detection that names the stuck nodes, shared facility nodes.
- Fingerprints (`fingerprints.py`): direct inputs + task version + impl-file
  hashes; per-hole subhashes (`holeGolfGeometryHash`, `holeCanopyHash`,
  `holeContextHash`, `holeReviewHash`, `holeTerrainInputHash`,
  `holeDisplayInputHash`); `terrain_source_identity` = files + bounds + CRS.
- Planner (`planner.py`): states `ready / pending / cached / stale / blocked /
  failed / running`; order own blockers → ledger success + verified artifacts →
  adoption of retained evidence → blocked dependency (human blockers ranked
  first, root recorded) → pending dependency (an unfinished *optional* dep also
  waits, so a hole is never compiled without the context layer merely because
  the classifier has not run) → stale with the changed inputs.
- Ledger (`ledger.py`): `output/course-geometry/factory/state.sqlite`,
  runs / task runs / inputs / artifacts / manual invalidations, interrupted
  recovery by pid, disk accounting and eviction candidates.
- Runner (`runner.py`): topological, plans each node against what ran before
  it, re-evaluates a node's output identity after success so dependants judge
  the artifact, not the run; every attempt leaves a log and a ledger row.
- Adapters (`adapters.py`, 17 executors): AOI resolve (Overpass element →
  bbox), OSM + context snapshots, routes (`osm_ref_unique` or block),
  scorecard/candidates/package compose (`prepare-osm-course.py`), terrain
  acquire (`compile-course-terrain.py --acquire-only`), canopy
  (`derive-canopy-naip.py`), imagery audit, base compile, context classify,
  per-hole compile and world build, aggregates, review queue, capability
  report. Canary/player capture and publish verify stay
  `ADAPTER_NOT_IMPLEMENTED` (PR C).
- Intake (`intake.py`): cohort + coverage audit + library scorecards → C0
  manifests, most-played first, facility named by its OSM element, sibling
  polygon guard; wrote 10 facilities / 14 layouts / 14 scorecards.
- Compiler: `--acquire-only`; `asset-manifest.json` gains `sourceIdentity`
  and the output-directory guard compares it (the old full-manifest digest
  changed every time the raster served another package revision).
- Docs: README command sheet, `memory/features/shot-tracking.md` contract.

Acceptance answers (all from `plan`/`why`, no hand reasoning):

| question | answer |
| --- | --- |
| What does Cacapon need? | AOI → snapshots → routes (18 unique refs) → terrain x73y438 → canopy → package → 18 compiles/worlds; reached a cached fixed point live (57 cached, 40 blocked by design). |
| Why is it blocked? | 18 × `ADAPTER_NOT_IMPLEMENTED` (canary), `PUBLISH_NOT_APPROVED`; earned tier C1. |
| Which input made this stale? | `why` prints the changed input, previous/current hash and the upstream node that caused it. |
| Hole 7 geometry changes? | `hole.terrain.compile[07]`, `hole.world.build[07]`, the four aggregates; nothing else (test). |
| Renderer version bump? | Only `hole.visual.canary` × 18 and its aggregate (test). |
| Scorecard yardage changes? | No acquire, compile or world build; the package is re-prepared (test). |
| Hole 7 package hash only? | Hole 14 stays cached (test, per-hole subhashes). |
| Disk? | `status` prints free / reserve / retained by class and scope; the guard blocks the first heavy task under the reserve with eviction candidates (test). |

Deliberate deviation: the plan asked Cacapon to *block* on route identity.
The factory proposes when every played hole has exactly one numbered
`golf=hole` way inside the layout's own polygon (Cacapon: 18/18, no par
disagreement) and queues `route_confirmation`; it blocks with the candidate
list when a number is missing or repeated (the Upper's shared resort polygon
is the test). Guessing never happens; a person still confirms before C2.

Tests: 76 in `test_factory_*.py` (catalog 12, graph 9, osm 7, fingerprints 11,
ledger 8, cli 16, impact 13) + 20 compiler tests; all network-free; `ruff`
clean (no new findings). Catalog: `catalog.test.ts` (4).

Canopy output identity (found by the first classifier change, fixed): the
canopy node's identity was the NAIP raster hash, so a re-derivation that
changed the groups left the package merge and every compile cached with the
old woods. It is now the review minus its date/reviewer/packageHash
(`canopy_identity`); a changed classification reaches the package and, via
the per-hole subhashes, recompiles only the holes whose groups changed
(`test_a_changed_canopy_classification_reaches_the_package_and_every_hole`).

Retained evidence is read-only (review finding, fixed before merge): the
context now separates read locators (`compiled_dir`, `canopy_path`, `osm_dir`,
… answer "which artifact is current": built output first, then retained
evidence, then the path a build would create) from write locators (`*_out`,
always under the output root). Every executor and the test fakes write through
`*_out`; `safe_rmtree` refuses any path outside the output root; the runner
fails a task whose reported artifact lies outside the root
(`ARTIFACT_OUTSIDE_OUTPUT_ROOT`); `doctor` reports missing retained paths. A
per-hole read (`compiled_dir(layout, hole)`) lets a retained full compile keep
serving the holes a rebuild did not touch. Verified by
`RetainedSafetyTests`: adopt from retained → invalidate the OSM snapshot, the
context layer and one hole compile → rerun → retained tree byte-identical,
every artifact under the root, untouched holes still read from the retained
compile. Ledger timestamps carry microseconds so a rebuild finishing in the
same second as the `invalidate` that asked for it clears the invalidation.

Shared compiled directory vs per-hole isolation (found live on Grande Dunes,
fixed before merge): the compiler refuses an output directory whose
`asset-manifest.json` names another package hash, and the executor answered by
clearing the directory. With per-hole fingerprints that is wrong: when a
package edit touches hole 10 only, holes 1–9 are planned cached (their files
verified) before hole 10's compile wipes them, so the run ends with their
artifacts missing and the next run recompiles them with identical inputs
(Grande Dunes needed two runs). `prepare_compiled_dir` now relabels the
manifest for the new package hash — keeping every listed hole still in the
package whose file is present; holes that do need work overwrite their entry
when they compile — and clears the directory only when the terrain source
identity changed. A kept entry cannot fake a cache hit: the planner trusts the
ledger fingerprint and each `<hole>-report.json`, which still records the
package hash it was compiled under (so on a cold ledger a package change still
recompiles every hole; changing that means changing what the compiler writes,
outside PR B). The fake compiler now mirrors the real guard (raises on a
foreign manifest), and `test_one_hole_bunker_edit_rebuilds_that_hole_only`
asserts the manifest lists all 18 holes, the 17 cached holes' files are
byte-identical, and a third run executes nothing. Confirmed live on a scratch
copy of Winchester's output root and ledger (the four live courses are at
their fixed point, so a plain rerun proves only no regression): hole 10's
yardage edited in a copied catalog plus `invalidate hole.terrain.compile
--hole 10` → run `run-20260919T224410-16a92e` executed 17 nodes with
`hole.terrain.compile[winchester-cc:10]` the only hole compile, the manifest
relabelled to the new package hash with 18 holes listed and 17 entries
unchanged, every other hole's `.gz` and report byte-identical; the next run
executed 0 (57 cached, 40 blocked by design). Two things that run also showed,
both pre-existing and outside PR B: the ledger stores absolute artifact paths,
so a moved output root reads as `ARTIFACT_MISSING` everywhere (the copy needed
a path rewrite), and a scorecard-only edit still re-runs `layout.terrain.base`
(a full 18-hole compile, ≈ 50 s), `layout.canopy.derive`,
`layout.context.classify` and `layout.imagery.audit` because they key on the
package hash while the hole compiles stay cached.

Adoption survives a fingerprint move (found on the Upper's default-root plan,
fixed before merge): the planner adopted retained evidence only when the node
had no ledger success at all, so once a plan had recorded the Upper's 27
adoptions, the next implementation edit (the compiler, the canopy identity)
changed their fingerprints and every adopted node fell to `pending` on
`layout.routes.resolve` — work nobody asked for and the same on-disk state a
fresh ledger adopts outright (6 cached vs 30). Retained artifacts (outside the
output root) that still pass their content checks are now re-adopted when
their recorded success no longer matches, unless a manual invalidation asked
for the rebuild; built output under the root keeps rebuilding on such a change.
`test_retained_evidence_stays_adopted_when_only_its_fingerprint_moved` edits
the compiler and the world builder after adoption: the 18 retained compiles
and the base stay adopted, the 18 built world records rebuild, an invalidation
still marks its hole stale. The Upper's default-root plan is back to the
fresh-ledger shape (30 cached, 4 ready, 24 pending, 39 blocked by design).

Live results (scratch output root, nothing committed):

- Cacapon: four runs (the first three exposed real defects that are now
  fixed and tested: context outputs named after the package file, the
  compiler guard on the served-package list, the source manifest treated as an
  immutable artifact). Machine time ≈ 6 min for the full chain; per-hole
  compile 4–7 s, world build ≈ 2 s. **Canopy came back with 0 groups**: the
  2024-09-10 NAIP tile is bright (red mean 136 vs the Upper's 88; NDVI median
  0.16 vs 0.37), so the fixed `ndviMin 0.28` misses the forest. Surfaced as a
  `CANOPY_SHARE_SUSPECT` note on `layout.canopy.derive`; the fix (per-export
  threshold calibrated against OSM fairway pixels) is a geospatial change and
  belongs to PR C.
- Winchester CC (30 rounds): second live course. Three failed attempts
  taught the factory three things now in code and tests — Overpass 504s
  (bounded retry in the AOI adapter and both fetch scripts), an implementation
  change re-running a snapshot into its immutable directory (snapshot
  revisions: a complete extract for the same AOI is reused, a manual
  invalidation fetches `-r2`), and a course that straddles two tiles of one
  lidar project (`covering_tile_sets`: same project + same date may cover
  together; mixed sources still refused; an undated tile is never paired).
  The fourth run went clean: 49 executed, 0 failed, 57 cached, earned tier
  C1, canopy 236 groups (24 % of the 2025-06 export), 18 compiled holes at
  18–32 k triangles. The Overpass fetch → cached fixed point took 9 minutes
  of machine time. **Caveat for review**: the two tiles (x74y434 + x74y435,
  VA_NorthernShenandoah_2020_D20) are mosaicked by the export service and the
  compiler checks only that the union covers the request; nothing yet checks
  the seam for vertical continuity. A person looks at the seam (it crosses
  the course near 39.175 N) before Winchester goes past C1.
- After the retained-path fix both live layouts were re-run from their
  cached state: the compiler edit changed the impl hash of acquire, base and
  the 18 hole compiles, so each layout re-executed exactly those (rasters and
  extracts reused, 1 ms snapshots, no network) and the next run was the fixed
  point again (`executed 0, cached 57, blocked 40, failed 0`). One
  refinement for PR C: the base compile's output identity includes its
  manifest digest, so a base rebuild also re-runs `layout.context.classify`
  once even when the terrain is unchanged.

Cohort ranking (intake, 2026-09-13 usage): Bryan Park Champs 45 — **OSM
has no course geometry at all (see the night run below); imagery tracing,
not a pin**; Cacapon 36 (live, C1); The Cardinal 30 and Starmount Forest 23
— `TERRAIN_ADAPTER_MISSING` (NC OneMap DEM03, PR C); Winchester 30 (live,
C1); Big Blue UK 19, Landfall 24 across five layouts, Cutter Creek 8 —
`UTM_ZONE_UNSUPPORTED` (zone 16/18; PR C parameterises the five scripts that
hard-code 32617); Grande Dunes 13 (live, C1), Forsyth 7 (live, C1),
Boonsboro 7 (OSM-thin: blocks on routes), PGA National 2 (blocks on routes:
two unnamed 18-hole series, owner picks); River Landing 16, Pinehurst No. 8
7, Magnolia Greens 5, Forest Oaks 2 — need an OSM pin.

Cohort night run (2026-09-19, after the retained-path fix; scratch output
root, nothing committed), most-played first:

- **Grande Dunes Resort Club (13 rounds): clean on the first run** — 53
  executed, 0 failed, earned tier C1. Routes proposed uniquely from OSM
  relation 3973681 with one par disagreement queued for the person (hole
  16: OSM par 3, scorecard par 4, way 906844510). Terrain USGS 1 m
  `SC_2023Horry_Processing_D24` (single tile), NAIP 2025-04-17 (two
  quarter-quads), 18 holes at 12.5–37.6 k triangles. Review queue: 4
  low-sand bunkers, 18 holes over the uncertain gate, 110 unreviewed
  features.
- **Forsyth Country Club (7): clean on the first run** — C1, routes unique
  (way 31294445, no par disagreement), terrain USGS 1 m
  `NC_Phase4_2017_A17` (so this NC course never needed the OneMap adapter),
  NAIP 2025-06-27, 18 holes at 11.0–29.6 k triangles; 10 low-sand bunkers,
  72 unreviewed features.
- **Boonsboro CC (7): `ROUTE_WAY_IDS_REQUIRED`** — OSM inside way
  518032130 has 0 hole ways, 6 greens and 1 fairway. Not a pin problem: an
  OSM-thin course, i.e. the imagery-tracing case.
- **PGA National Champion (2): `ROUTE_WAY_IDS_REQUIRED`** — a multi-course
  resort, not duplicate data: one 901 ha polygon named "PGA National
  Resort" (way 1483954804) holds 48 hole ways (two complete 1–18 series,
  776369833–850 centred 26.8245 N 80.1470 W and 1458625172–189 centred
  26.8174 N 80.1433 W, plus 841003253–257 for holes 10–14 of a third),
  none named, no relations. The owner action is "which routing is the
  Champion" (the resort map answers it) plus a per-course site polygon;
  the same shape recurs on every multi-course facility (the Upper's resort
  polygon was the first). The rest is the Grande Dunes chain (OSM has 104
  greens and 285 bunkers here).
- **Bryan Park Champions (45, most played): not an OSM-pin problem.** OSM
  has Bryan Park only as park relation 3972771 with a single `golf=hole`
  way (1148941814, ref 1) and no course polygon, greens, fairways or
  bunkers (bounded Overpass lookups, 20 km / 12 km). The OSM-based chain
  cannot build it at any tier. With Boonsboro that is 52 rounds reachable
  only by imagery-traced geometry — the evidence now points at reading (a)
  of the owner's "lab generators based on map pics", and the mechanism
  exists for single features (`retained.imageryTraces`, `_prepare
  --traces`, Peek'n Peak hole 11 fairway); PR C scales it.

Canopy calibration evidence (for PR C). Band 4 of the FPAC `conus_naip`
export is real NIR on every course (water NDVI −0.21 … −0.52), and the
service applies no rendering rule (identical DNs with and without
`rasterFunction: None`). The exports differ radiometrically: median NDVI
sampled inside OSM classes —

| Course (NAIP date) | fairway | woods | water | canopy groups / share |
| --- | --- | --- | --- | --- |
| Winchester (2025-06-13) | +0.37 | +0.44 | −0.34 | 236 / 24 % |
| Forsyth (2025-06-27) | +0.12 | +0.33 | −0.21 | 29 / 0.6 % |
| Grande Dunes (2025-04-17) | +0.21 | +0.31 | −0.39 | 4 / 0.04 % |
| Cacapon (2024-09-10) | +0.16 | (no OSM woods) | −0.52 | 0 / 0 % |

A fixed `NDVI_MIN 0.28` therefore keeps Winchester and loses most of the
canopy on the three brighter exports (Forsyth's woods median sits at 0.33,
so half its forest pixels fall below the gate). The PR C change is a
per-export threshold from OSM-backed samples (between the fairway and woods
medians, or Otsu on the masked NDVI) plus a brightness flag in the review
note; no renderer or geometry change.

Honest scaling floor: machine ≈ 4–10 min per 18-hole course once the
source adapters exist (Grande Dunes and Forsyth each ran Overpass → C1 in
one pass); the human half-day per course is the route confirmation,
imagery/context review and the truth gate, which needs someone who knows the
course. Nothing here changes player behaviour or writes production.

Next PR boundary (PR C): NC OneMap DEM03 terrain adapter (unblocks 60+
rounds), UTM zone parameterisation (unblocks 50+), canopy threshold
calibration, the canary/player-capture adapters, and the answer to the
owner's "lab generators based on map pics" (imagery-traced geometry for
OSM-thin courses vs imagery-keyed render generators — asked in the session
report).

## PR C — started 2026-09-19 on `agent/course-factory-c` (→ `agent/course-factory-b`)

First item, chosen from the night run's evidence: the canopy gate.

- `derive-canopy-naip.py`: the NDVI gate is set per export at
  `fairway NDVI median + 0.06`, clamped to `[0.15, 0.28]` — never above the
  ceiling the Peek'n Peak Upper and Winchester reviews were made with, so
  those two do not move (Winchester re-derived to the same 236 groups and
  the package hash held; the Upper stays adopted). Texture (NIR std) stays
  fixed: it separates fairway from crowns by an order of magnitude on every
  export (fairway 1.6–3.3 vs woods 14.5–25). Everything sampled is recorded
  in `method.ndviCalibration`; `measure-canopy-rerun.py` replays a review
  with the gate it recorded. Tests: `test_derive_canopy_naip.py` (6).
- Factory note `CANOPY_EXPORT_COMPRESSED` when the fairway median is below
  0.25 (the gate was loosened; shadowed forest may still fall below it).
- Live effect, same rasters, no network: Forsyth 29 → 185 groups (0.6 % →
  24.8 % of the export), Cacapon 0 → 130 (0 % → 12.2 %), Grande Dunes 4 → 5
  (0.04 % → 0.07 %; a coastal residential course, mostly houses and
  lagoons), Winchester 236 → 236. Overlays (`forsyth-canopy-gate.jpg`,
  `cacapon-canopy-gate.jpg`, sent in the session) show the added pixels
  tracing tree masses and crowns, none on fairways, sand, roads or roofs.
  Honest limit: Cacapon's 2024-09-10 tile is hazy; its dark forest sits at
  NDVI 0.12–0.23 and roughly half of it stays below the 0.22 gate. Going
  lower would classify native rough (fairway median 0.16). The fix there is
  another NAIP year, an imagery-currency decision already on the review
  queue.
- Each course's package and the holes whose groups changed recompiled via
  the identity fix on PR B (Forsyth and Cacapon 47 executed, Grande Dunes
  25, Winchester 3 — canopy, package, validate — with every compile cached).

Remaining PR C items, unchanged: NC OneMap DEM03 terrain adapter (the USGS
1 m index has no tile over Greensboro — Starmount, the Cardinal/Sedgefield
Dye and Bryan Park return only 1/9 arc-second NED — so it is genuinely
needed; owner gates on the study script's license and vertical-datum notes),
UTM zone parameterisation, canary/player-capture adapters, and imagery
tracing at course scale (`retained.imageryTraces` + `_prepare --traces`
already carry single traced features; Bryan Park and Boonsboro, 52 rounds,
are reachable no other way).

## Not started

PR C onward (see the boundary above). Publishing, flags and production binding stay owner-gated.
