# Course factory authority hardening — implementation checkpoint

September 20, 2026. Worktree `golf-course-geometry`, branch
`agent/course-factory-c`, starting at `48e6a8d046c8e1dbbd282513b8d0e79ecd72d91d`.
This is an implementation checkpoint, not physical approval or deployment.

## Implemented

- **Python accepts cards TypeScript rejects.** Both support provenance notes
  through 4,096 characters; Python now enforces required source fields, URL,
  date shape, integer/bool distinction and handicap bounds. Evidence: Shared
  valid/invalid corpus plus real checked-in scorecards.
- **Prepared publication grants capabilities despite failed verification.**
  Capability evaluation depends on current successful publish verification and
  matching layout/package evidence. Evidence: Failed verification, stale
  evidence, C2 measurement denial and successful C3 tests.
- **C2 pilot could become the general measurement policy.** Live resolution
  explicitly requires C3; Upper exception is bound to its exact layout/hash.
  Evidence: Copied pilot policy cannot admit a different C2 layout.
- **Course identity can fall through to a name.** A nonempty unbound database
  course ID fails closed; Upper's catalog-backed database ID is explicitly
  registered. Evidence: Exact ID, renamed course and conflicting name tests.
- **Build tee leaks into round labels.** Live adapter receives selected tee
  and saved scorecard; explicit versioned hole crosswalk; live/review headers
  use round values. Evidence: Reversed hole order and White-tee card against
  different build values.
- **Autosave/recovery clears tee provenance.** Existing-round saves/submission
  read and preserve owned course/tee IDs; emergency/beacon payloads retain
  them; known tee ID constrains no-ID reuse. Evidence: Real server-action
  boundary tests, including omitted/different tee and no-ID recovery.
- **Resume reads current library yardages.** Continue loads saved hole
  yardage, then saved draft configuration; mutable course-hole read removed.
  Evidence: Existing round suites plus source-path inspection.
- **No OSM way/green prevents candidate import.** `retained.sourceGeometry`
  and `--source-geometry` assemble routes and surfaces before explicit green
  association. Evidence: Real Python preparer plus TypeScript parser on nine
  sparse-OSM holes; separate legacy traced-green test.
- **Traces are smoothed before canon.** Removed buffer/simplification;
  preserve original coordinate arrays and retained source artifact bytes.
  Evidence: Exact polygon coordinate equality tests.
- **Source edit can reuse stale import.** Source hash enters route/package
  inputs and implementation fingerprints; fresh-ledger adoption checks source
  metadata. Evidence: Changed retained source produces a different route
  resolution; invalid source remains blocked.
- **NC source frame is mislabeled.** EPSG:6543 native CRS, complete horizontal
  CRS check, catalog raster lock and item grid origin; separately verify item
  vertical CRS. Evidence: Focused compiler tests and retained tiny
  metadata/export probes.
- **Asset refresh evicts suspended round version.** Per-round cache lease plus
  a small independent browser binding; revocation fails closed;
  completion/deletion cleanup. Evidence: Resume after changed manifest,
  eviction, pruning and revocation tests.

Scoring and shot persistence remain in the existing round ledger. There is no
geometry-to-scorecard write path, no new paid API, and no production database,
flag or asset publication in this checkpoint.

## Import contract

`scripts/golf/course-geometry/source_geometry.py` validates
`golfhelm-source-geometry-v1`. Its retained input includes licensed source
metadata, snapshot hashes, extraction methods, raw Polygon/MultiPolygon vectors,
physical-hole keys, explicit route/green references and separate identity review.
The package stays `source_candidate`; all imported physical features remain
unreviewed. A numbering confirmation does not certify edge accuracy.

`prepare-osm-course.py` accepts `--source-geometry`; legacy NAIP surfaces retain
`--traces`. There is no promised-but-unimplemented `--routes` option. The original
input bytes, metadata hashes and association alternatives are retained. No
nearest-green snap, fake OSM feature or hole-length stretching was introduced.

## NC evidence and limitations

Live metadata probes are retained locally under
`output/course-geometry/factory/research/nc-dem-frame-audit-v1/` (not committed
large source artifacts). DEM03 horizontal metadata matches EPSG:6543; its native
spacing is 3.125 US survey feet, approximately 0.952502 m. A small locked export
confirmed the native frame. This is computational/source-frame evidence, not
independent field registration.

Guilford raster 1316 advertises vertical CRS EPSG:6360 (NAVD88, US survey foot)
in its item info. Tested Greene/New Hanover items did not provide an equivalent
verified vertical CRS. Unknown elevation units therefore block physical
acquisition. Explicit visual fallback keeps its unit assumption separate and
non-authoritative. A horizontal CRS foot unit is never reused as Z evidence.
No geoid-model assertion is made. Corrected acquisition uses a new
`nc-dem03-native-v2` directory/identity; old sources remain evidence.

## Verification

- Broad TypeScript run: 253 files, 2,267 passed and three skipped before the
  final no-ID tee-identity edge-case addition. Final persistence/schema run:
  44 tests passed.
- Focused runtime/cache tests: 36 passed.
- Final cache/hook regression after fail-closed persistent-storage handling:
  19 passed. Paginated library snapshot tests: three passed.
- Source/compiler/catalog/scorecard/provider tests: 59 passed.
- Python factory suite: 107 passed, including the real disk-reserve guard test.
- Changed TypeScript ESLint and changed core Python Ruff: passed.
- `typecheck` and `typecheck:fast`: passed.
- `docs:check` and `helm-os:check`: passed. Individual knowledge checks found
  `docs/generated/DOCUMENT_AUTHORITY_INVENTORY.md` and
  `docs/generated/WORLD_MODEL.json` stale. Regenerated with
  `knowledge:doc-inventory` and `knowledge:world-model`; no generated file was
  edited by hand.
- Production build: **not passed**. Stopped when build memory/swap pressure
  reduced free disk below the 8 GiB factory reserve; exit 137 after its process
  tree failed to stop on TERM. It never reported successful compilation or the
  route table. No production readiness claim depends on that attempt.

The fake-executor test harness models 100 GiB free space, independent of host
swap pressure. It still executes the real reserve guard and its explicit
low-space regression. The actual factory reserve stays at 8 GiB.

## Still required before wider runtime admission

1. **Physical source review:** Boonsboro needs real numbered routes/greens from
   retained ortho and course-issued identity evidence. Landfall needs reviewed
   shared physical-hole/ordered-nine crosswalks and alias resolution. Neither
   receives approval from the synthetic importer test.
2. **Admission completeness:** reviewed-absence semantics, per-feature/per-hole
   capability evidence, independent registration checkpoints and a field-test
   evidence contract for C4. C4 remains explicitly denied. C3 tests use synthetic
   reviewed evidence; no real course is promoted by them.
3. **Full immutable round binding:** server-synchronized geometry, admission and
   frame versions; importing every tee profile and explicit mixed-tee reference
   mappings. Existing factory intake/refresh still chooses a reference build
   card; that card has no authority over a player's round. The browser lease implemented
   here is not a cross-device migration protocol. Clearing all local storage
   still removes device-only bindings; raw observation versions are not rewritten.
4. **Factory decoupling:** scorecards still occur in compiler reference packages.
   Do not omit them from fingerprints until that ownership is separated. Add
   independent acquisition/geometry/display/admission hashes and a dev-only
   immutable bundle loader without editing static fixtures.
5. **Canaries and release:** actual Winchester/Boonsboro/Landfall review packages,
   staging tee selection → marks → suspend/resume → completion/review, mobile
   captures, completed production build, Review Gate and CodeQL. Current main's
   Git integration is the production deployment path; no CLI production deploy.

The existing candidate GLBs remain renderable without physical measurement
approval. Uncertainty, missing sources, bunker microgeometry, daily pin/tee marker
unknowns and unsupported putting-break inference remain visible and restricted.
