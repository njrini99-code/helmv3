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

Tests: 70 in `test_factory_*.py` (catalog 12, graph 9, osm 7, fingerprints 11,
ledger 8, cli 14, impact 9) + 16 existing compiler tests; all network-free;
`ruff` clean. Catalog: `catalog.test.ts` (4).

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
  together; mixed sources still refused). The fourth run went clean: 49
  executed, 0 failed, 57 cached, earned tier C1, canopy 236 groups (24 % of
  the 2025-06 export), 18 compiled holes at 18–32 k triangles. The Overpass
  fetch → cached fixed point took 9 minutes of machine time.

Cohort ranking (intake, 2026-09-13 usage): Bryan Park Champs 45 — **no OSM
course polygon matched, needs a human pin** (the most-played course is
blocked on a two-minute action); Cacapon 36 (live); The Cardinal 30 and
Starmount Forest 23 — `TERRAIN_ADAPTER_MISSING` (NC OneMap DEM03, PR C);
Winchester 30 (live); Big Blue UK 19, Landfall 24 across five layouts, Cutter
Creek 8 — `UTM_ZONE_UNSUPPORTED` (zone 16/18; PR C parameterises the five
scripts that hard-code 32617); Grande Dunes 13, Forsyth 7, Boonsboro 7 (OSM
has no hole ways: will block on routes), PGA National 2 — ready for the same
chain as Cacapon; River Landing 16, Pinehurst No. 8 7, Magnolia Greens 5,
Forest Oaks 2 — need an OSM pin.

Honest scaling floor: machine ≈ 10 min per 18-hole course once the source
adapters exist; the human half-day per course is the route confirmation,
imagery/context review and the truth gate, which needs someone who knows the
course. Nothing here changes player behaviour or writes production.

Next PR boundary (PR C): NC OneMap DEM03 terrain adapter (unblocks 60+
rounds), UTM zone parameterisation (unblocks 50+), canopy threshold
calibration, the canary/player-capture adapters, and the answer to the
owner's "lab generators based on map pics" (imagery-traced geometry for
OSM-thin courses vs imagery-keyed render generators — asked in the session
report).

## Not started

PR C onward (see the boundary above). Publishing, flags and production binding stay owner-gated.
