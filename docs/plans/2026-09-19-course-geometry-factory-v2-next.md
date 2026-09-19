<!-- markdownlint-disable MD013 MD060 MD024 MD026 MD029 MD032 MD034 MD036 MD040 MD046 MD022 MD025 MD031 MD012 MD004 MD007 MD009 MD010 MD030 MD035 MD037 MD038 MD047 MD053 MD055 MD056 MD058 -->

GolfHelm Course Geometry Factory v2 - What Now After PR A

Date: 2026-09-19
Repository: njrini99-code/helmv3
Current stack:

• Production/deploy branch: agent/golf-course-geometry, PR #1939
• Factory PR A: agent/course-factory-a, PR #1949, stacked on #1939
• PR A purpose: generic course policy + registry + facility/layout/scorecard catalog
• Next recommended branch: agent/course-factory-b, stacked on PR A

Status: implementation plan for the next factory slices. This document starts from what PR A actually landed and replaces a vague “continue Factory v2” instruction with explicit PR boundaries, contracts, commands, gates, and stop conditions.

────────

0. Executive decision

PR A did the correct first thing: it separated “Peek’n Peak the pilot” from “course geometry the product capability” without changing player behavior.

Do not make PR B “add Cacapon to the registry and run the old pipeline again.”

That would prove the registry but fail to prove the factory.

The next work should be:

1. PR B - Factory runtime: build the declarative task graph, fingerprinting, local build ledger, resumability, per-hole invalidation, disk/cache accounting, and machine-readable blockers. It must be able to explain what it would do for Peek’n Peak and Cacapon before it is allowed to fetch or publish anything.
2. PR C - Source/provider layer: put OSM, terrain, imagery and context acquisition behind provider contracts; preserve the existing scripts as adapters/oracles; add source manifests and cache classes; benchmark S1M and regional OSM extraction instead of silently switching providers.
3. PR D - Cacapon vertical slice: use the factory, not hand-run commands, to rebuild Cacapon from C0 to a complete source-candidate package with current terrain/compiler contracts, review queue, metrics and deterministic QA. Cacapon remains unserved until its owner gates are explicitly satisfied.
4. PR E - Exception review + incremental rebuild: convert the existing imagery/context evidence into a ranked review queue, apply immutable review overlays, and prove that one Hole 7 edit only invalidates Hole 7 plus dependent aggregates.
5. PR F - Multi-layout release plumbing: remove the remaining round-page singleton booleans, resolve/evaluate flags per layout on the server, bind exact golf_courses ids, and prove two registered layouts can coexist while an unregistered course still makes zero geometry requests.
6. PR G - Asset publication at library scale: move large course assets out of the Git/Vercel source tree behind a publisher/storage abstraction, preserving content hashes and offline behavior.
7. PR H - Catalog scale-out: seed the 52-facility audit into the catalog, generate the live work queue, add the NC terrain provider, and start batch processing source-complete facilities.

The key ordering rule is:

> First make a factory that can explain and resume its work. Then make Cacapon prove it. Then optimize human review. Then activate the second production layout. Then scale the library.

────────

1. Current state - what PR A earned us

PR A is a real architectural boundary, not just a rename.

It now gives the codebase:

• CourseGeometryPolicy instead of a Peek’n Peak-only policy contract.
• COURSE_GEOMETRY_REGISTRY as the product resolver.
• resolveCoursePolicy with database-id-first identity and name-pattern fallback.
• capability_not_available as a first-class eligibility reason.
• Facility, layout and scorecard catalog schemas under course-geometry/catalog/.
• Cross-file catalog/registry validation.
• Peek’n Peak Upper represented as a catalogued layout at C2.
• Cacapon represented as a catalogued layout at C0.
• Production imports moved away from peek-n-peak-policy.ts; that file is now a compatibility shim.
• Existing asset/loading/live-round code able to accept a generic policy.
• A fixed-point regression baseline: Upper should behave exactly as it did before PR A.

That is enough to stop changing identity contracts and start building the execution layer.

1.1 What PR A deliberately did not solve

The remaining single-course coupling is now narrow and visible:

• Round pages still evaluate the Upper policy’s geometry and sync flags into the old booleans.
• The registry’s dbCourseIds for the Upper remain empty even though the catalog has the binding.
• Cacapon has no route ids in the new catalog, no current factory-built package, and no approved production policy.
• Build scripts still behave like individually invoked tools rather than nodes in a dependency graph.
• Retained source evidence, generated candidates, reviewer decisions and compiled products are not yet represented by one shared artifact contract.
• Rebuild scope is still primarily procedural rather than derived from changed inputs.
• Large source/output/cache files still rely on ad hoc directory conventions.
• Publication is still Git/Vercel-source-tree oriented.

Those gaps define the next PRs.

────────

2. Branch and merge strategy right now

2.1 Keep #1949 draft and stacked

Do not merge #1949 before #1939.

#1939 is still the production deployment boundary and contains owner-gated work. Factory changes should not get mixed into that release.

2.2 Start PR B now rather than waiting

Create:

```text
agent/golf-course-geometry      # PR 1939
          |
agent/course-factory-a          # PR 1949
          |
agent/course-factory-b          # PR B
```

PR B should target agent/course-factory-a while the stack is open.

This keeps the work moving but preserves reviewability. PR B should not touch the owner-gated #1939 items.

2.3 Landing order

When #1939 is approved:

1. Owner lands #1939 through the existing release path.
2. Update main locally/remotely.
3. Rebase agent/course-factory-a onto the new main.
4. Confirm #1949 contains only Factory PR A changes.
5. Retarget #1949 to main.
6. Run its full verification again.
7. Merge PR A.
8. Rebase/retarget PR B onto the merged PR A/main.
9. Continue down the stack in order.

Do not merge a lower PR by squashing away commits that an upper stacked PR still depends on without immediately rebasing the stack.

2.4 One housekeeping check

At the time this plan was prepared, the GitHub connector reported #1949’s remote head as 93497b721b72173055087cc5dc205044ca5c9410, while the owner update referred to an amended 3ab2501d0... head. Treat the remote PR head as authoritative for CI. If the amended commit is newer, verify it is pushed before relying on the watch result.

────────

PR B - Factory runtime and dependency graph

Recommended branch: agent/course-factory-b
Base while stacked: agent/course-factory-a
Behavior change: none
Network access in tests: none
Production writes: none
Course activation: none

3. PR B objective

Build the thing that makes the rest of the scale-out possible:

> A deterministic local course-geometry build engine that can read the catalog, construct a facility/layout/hole DAG, fingerprint each task from its direct inputs, persist task/artifact state, explain why work is dirty or blocked, resume safely, and invalidate only affected descendants.

PR B is complete when the factory can answer all of these without hand reasoning:

```text
What does Cacapon need?
Why is it blocked?
Which tasks are runnable now?
Which input made this task stale?
If Hole 7 geometry changes, which exact tasks rebuild?
If the renderer changes, which source tasks remain valid?
If scorecard yardage changes, does terrain redownload? (No.)
If the source package hash changes on Hole 7 only, does Hole 14 terrain rebuild? (No.)
How much local disk is retained and which files are evictable?
```

The engine is the product of PR B. It should wrap the existing scripts later, not rewrite their geospatial math in the same PR.

────────

4. PR B file layout

Recommended structure:

```text
scripts/golf/course-geometry/
  course-factory.py                  # tiny CLI entry point
  factory/
    __init__.py
    catalog.py                       # reads/validates checked-in catalog JSON
    model.py                         # TaskSpec, ArtifactRef, Fingerprint, Blocker
    graph.py                         # DAG construction and impact propagation
    fingerprints.py                  # canonical hashing rules
    ledger.py                        # SQLite state store
    planner.py                       # desired state -> task plan
    runner.py                        # bounded task execution
    reasons.py                       # stable blocker/rebuild reason codes
    disk.py                          # disk guard and cache accounting
    report.py                        # JSON + Markdown status outputs
    tasks/
      catalog_tasks.py
      facility_tasks.py
      layout_tasks.py
      hole_tasks.py
      qa_tasks.py
      publish_tasks.py
src/test/fixtures/course-geometry/factory/
  minimal-catalog/
  expected-plans/
scripts/golf/course-geometry/tests/
  test_factory_catalog.py
  test_factory_graph.py
  test_factory_fingerprints.py
  test_factory_ledger.py
  test_factory_impact.py
  test_factory_cli.py
```

Do not put the orchestrator in TypeScript just because the app is TypeScript. The geospatial build chain is already Python-heavy and the runtime needs SQLite, filesystem hashing, subprocess orchestration and existing Python functions. Keep app policy/registry code in TypeScript and build orchestration in Python.

────────

5. Factory CLI contract

The first version should have a small, stable interface.

5.1 doctor

```bash
python3 scripts/golf/course-geometry/course-factory.py doctor
```

Reports:

• Python version.
• GDAL availability/version.
• Shapely/pyproj/NumPy/SciPy availability.
• Node/tsx availability.
• Playwright availability.
• optional osmium availability.
• optional QGIS availability.
• free disk.
• disk-guard threshold.
• catalog parse/cross-reference result.
• presence of required source credentials only if a future provider needs them; public providers should not.

doctor is informational unless a dependency is required by the requested task.

5.2 plan

```bash
python3 scripts/golf/course-geometry/course-factory.py plan --layout cacapon
python3 scripts/golf/course-geometry/course-factory.py plan --facility peek-n-peak
python3 scripts/golf/course-geometry/course-factory.py plan --layout cacapon --json
```

Output per task:

```text
STATE       SCOPE                    TASK                         REASON
ready       facility:cacapon         osm.snapshot                 no successful fingerprint
blocked     layout:cacapon           route.resolve                ROUTE_WAY_IDS_REQUIRED
blocked     layout:cacapon           package.compose              dependency route.resolve blocked
cached      facility:cacapon         terrain.discover             fingerprint unchanged
stale       hole:cacapon:07          terrain.compile              package subhash changed
```

No command should force a human to infer why a task is waiting.

5.3 run

```bash
python3 scripts/golf/course-geometry/course-factory.py run --layout cacapon
python3 scripts/golf/course-geometry/course-factory.py run --layout cacapon --until imagery.audit
python3 scripts/golf/course-geometry/course-factory.py run --layout cacapon --task terrain.compile --holes 7,8
```

Properties:

• skips valid cached tasks;
• refuses blocked tasks;
• persists start/end/exit status;
• captures stdout/stderr path rather than flooding the console;
• stops descendants after failure;
• leaves successful siblings intact;
• safe to rerun after interruption;
• does not delete valid artifacts before the replacement is verified.

5.4 status

```bash
python3 scripts/golf/course-geometry/course-factory.py status --layout cacapon
```

Reports:

• current capability tier;
• task counts by state;
• blockers;
• source dates;
• package hash;
• review debt;
• QA state;
• publication state;
• last successful build;
• last failed task;
• disk retained by facility/layout.

5.5 why

```bash
python3 scripts/golf/course-geometry/course-factory.py why --layout cacapon --task terrain.compile --hole 7
```

Must produce a concrete causal chain, for example:

```text
terrain.compile[cacapon:07] is stale
  because input layout.package.holeSubHash changed
  previous: 92bb...
  current:  e103...
  caused by feature bunker/osm-way-1234 geometry change
  terrain source raster is unchanged and will be reused
```

This command is one of the most important scaling tools. Without it, a DAG becomes another opaque build system.

5.6 invalidate

Manual invalidation should exist only for exceptional cases:

```bash
python3 scripts/golf/course-geometry/course-factory.py invalidate --layout cacapon --task imagery.audit --reason "review algorithm changed"
```

It must record who/when/reason locally. Normal rebuilds should come from fingerprints, not manual invalidation.

────────

6. Task state model

Use explicit states:

```text
unknown   # no ledger record
ready     # dependencies satisfied; fingerprint needs execution
running   # active execution with run id
success   # outputs verified for current fingerprint
cached    # same as success for planning display; no work required
blocked   # a declared prerequisite/evidence/human decision is missing
failed    # task executed and failed
stale     # prior success exists but current fingerprint differs
skipped   # deliberately excluded by plan/capability
```

Do not use partial success as a generic state. Partialness belongs in the artifact/capability domain, not execution semantics.

────────

7. Stable blocker/reason codes

Create a code enum now. Human-readable text may change; codes should not.

Minimum initial set:

```text
CATALOG_INVALID
FACILITY_AOI_REQUIRED
LAYOUT_IDENTITY_AMBIGUOUS
ROUTE_WAY_IDS_REQUIRED
SCORECARD_REQUIRED
OSM_SOURCE_UNAVAILABLE
OSM_SOURCE_RETRYABLE
TERRAIN_PROVIDER_UNAVAILABLE
TERRAIN_NO_NATIVE_SOURCE
TERRAIN_EMPTY_FILL
IMAGERY_PROVIDER_UNAVAILABLE
IMAGERY_TOO_OLD_FOR_KNOWN_RENOVATION
SOURCE_HASH_MISMATCH
PACKAGE_PARTIAL
PACKAGE_HASH_NOT_APPROVED
HUMAN_IMAGERY_REVIEW_REQUIRED
HUMAN_CONTEXT_REVIEW_REQUIRED
HUMAN_BOUNDARY_REVIEW_REQUIRED
SHARED_GREEN_DECISION_REQUIRED
TRUTH_GATE_FAILED
CONTEXT_UNCERTAIN_SHARE_HIGH
VISUAL_BUDGET_BREACH
VISUAL_PAGE_ERROR
PLAYER_MATRIX_FAILED
PUBLISH_NOT_APPROVED
DISK_GUARD_BLOCKED
TOOL_MISSING
DEPENDENCY_BLOCKED
```

Every blocked task should expose at least one code plus evidence.

────────

8. DAG - facility, layout and hole scopes

The graph must model scope explicitly.

8.1 Facility tasks

```text
catalog.validate
facility.identity
facility.osm.snapshot
facility.terrain.discover
facility.terrain.acquire
facility.imagery.discover
facility.imagery.acquire
facility.context.snapshot
```

These belong to the physical property and should be reusable by all layouts at the facility.

8.2 Layout tasks

```text
layout.identity.resolve
layout.scorecard.validate
layout.routes.resolve
layout.candidates.compose
layout.canopy.derive
layout.imagery.audit
layout.context.classify
layout.review.compose
layout.package.compose
layout.package.validate
layout.capability.evaluate
```

8.3 Hole tasks

```text
hole.terrain.compile
hole.world.normalize
hole.world.compile
hole.truth_gate
hole.glb.export
hole.glb.roundtrip
hole.visual.canary
hole.player.capture
```

8.4 Aggregate tasks

```text
layout.context.report
layout.review.queue
layout.visual.aggregate
layout.player.aggregate
layout.publish.prepare
layout.publish.verify
```

A task’s scope is part of its identity. hole.terrain.compile[cacapon:07] and hole.terrain.compile[cacapon:08] are two independent nodes.

────────

9. Fingerprinting rules

Bad fingerprinting destroys the point of the factory.

9.1 Never fingerprint the whole Git commit

If every task includes HEAD, changing button copy would rebuild all terrain.

Do not do that.

9.2 Each task fingerprints only direct semantic inputs

Example:

```text
hole.terrain.compile fingerprint = sha256(
  task contract version,
  compiler implementation file hashes,
  terrain source manifest hash,
  hole package subhash,
  relevant context-zone subhash,
  compiler settings
)
```

Not included:

• unrelated holes;
• scorecard copy that does not affect geometry;
• renderer CSS;
• app policy flags;
• another facility.

9.3 Explicit task version

Every task implementation should have a small integer/string contract version:

```python
TaskSpec(
    id="hole.terrain.compile",
    version="4",
    ...
)
```

Bump it when semantics change in a way not captured by ordinary input hashes.

9.4 Hash implementation files, not directories

A task can list the implementation files that affect it. The fingerprint layer hashes those files directly.

That catches compiler changes without coupling the task to the entire repo.

9.5 Canonical JSON hashing

For structured inputs:

• UTF-8;
• sorted keys;
• fixed separators;
• no insignificant whitespace;
• normalize path separators;
• arrays retain semantic order unless the schema declares them sets.

The same logical object must hash identically across machines.

────────

10. Hole subhashes - the core of incremental rebuilds

PR B should introduce bookkeeping hashes even before the existing package schema changes.

For each hole derive:

```text
holeSourceHash
holeGolfGeometryHash
holeContextHash
holeReviewHash
holeTerrainInputHash
holeDisplayInputHash
```

These can be computed from existing featureIds, holeKeys, context zones and review overlays.

A full package still has one contentHash, but the factory can understand which holes actually changed.

Required regression test

Given a synthetic two-hole package:

1. compile plan is clean;
2. change one bunker coordinate assigned only to Hole 1;
3. recompute plan;
4. Hole 1 package/terrain/world/visual descendants become stale;
5. Hole 2 terrain/world/visual remain cached;
6. layout aggregate/publish nodes become stale because their inputs include Hole 1 outputs.

If this test does not pass, do not move to Cacapon.

────────

11. Local state ledger

Use SQLite under ignored output, for example:

```text
output/course-geometry/factory/state.sqlite
```

It is disposable orchestration state, not source truth.

11.1 Tables

Suggested minimum:

```sql
build_runs(
  id,
  started_at,
  finished_at,
  command,
  git_head,
  host,
  result
)

task_runs(
  id,
  build_run_id,
  task_key,
  scope_type,
  scope_id,
  fingerprint,
  state,
  started_at,
  finished_at,
  exit_code,
  blocker_code,
  log_path
)

artifacts(
  artifact_key,
  producer_task_key,
  path,
  sha256,
  bytes,
  retention_class,
  created_at,
  verified_at
)

task_inputs(
  task_key,
  fingerprint,
  input_key,
  input_hash
)

manual_invalidations(
  id,
  task_key,
  scope_id,
  reason,
  created_at
)
```

11.2 Ledger rules

• Never treat a ledger row as source truth.
• Before reusing a cached artifact, verify that the file exists and its hash matches the recorded artifact.
• Missing file means the producer is ready/stale again.
• A corrupt output cannot become cached simply because the prior task exited 0.
• Interrupted running tasks become unknown/ready on recovery after lock validation.

────────

12. Artifact contract

PR B should define one common metadata envelope without rewriting every existing artifact format.

Example:

```json
{
  "schema": "golfhelm-factory-artifact-v1",
  "artifactKey": "terrain-source:cacapon:v1",
  "kind": "source_evidence",
  "scope": { "facilityId": "cacapon" },
  "producer": {
    "task": "facility.terrain.acquire",
    "taskVersion": "1",
    "fingerprint": "..."
  },
  "content": {
    "path": ".../elevation.tiff",
    "sha256": "...",
    "bytes": 123456
  },
  "provenance": {
    "provider": "usgs_3dep_project_1m",
    "sourceId": "...",
    "retrievedAt": "...",
    "capturedAt": "...",
    "crs": "EPSG:...",
    "resolutionM": 1.0
  },
  "retentionClass": "A"
}
```

The envelope can point at the existing source manifest rather than duplicate all its fields. The purpose is to give the factory one way to reason about outputs.

────────

13. Retention and disk classes

The machine already has a real free-space constraint. Make it a first-class policy.

Recommended classes:

Class A - retained source truth

Examples:

• small OSM AOI extract;
• source manifest;
• scorecard source metadata;
• accepted review overlay;
• package fixture needed for deterministic tests.

Policy: do not evict automatically.

Class B - reacquirable heavy source cache

Examples:

• regional PBF download;
• NAIP raster;
• raw large DEM source window when safely reacquirable;
• temporary provider index.

Policy: LRU/age eviction allowed after source identity and derived retained outputs are verified.

Class C - derived reproducible outputs

Examples:

• compiled per-hole terrain;
• GLBs;
• visual artifacts;
• contact sheets;
• Playwright screenshots.

Policy: delete after sign-off when space is needed; rebuild from A/B.

Class D - published immutable assets

Local copy may be evicted only after remote/public verification if publication moves outside Git.

Disk guard

Keep the existing 8 GB safety threshold. The factory should refuse a heavy acquire task when projected output would cross the guard.

It should say:

```text
DISK_GUARD_BLOCKED
free: 9.1 GB
minimum reserve: 8.0 GB
estimated task need: 2.3 GB
suggested evictions: <paths and bytes>
```

Not simply No space left on device.

────────

14. PR B tests and acceptance gate

PR B must not need Cacapon source downloads to prove itself.

Unit tests

• catalog -> DAG construction;
• cycle detection;
• stable task identity;
• fingerprint stability;
• implementation-version invalidation;
• missing artifact invalidation;
• blocker propagation;
• per-hole impact isolation;
• aggregate invalidation;
• SQLite resume after interrupted run;
• disk guard;
• reason code serialization.

Golden plans

Commit small expected JSON plans for:

• Peek’n Peak Upper with existing artifacts;
• Cacapon C0 with missing route ids;
• synthetic multi-layout facility with shared facility-source tasks.

The multi-layout fixture is critical. It should prove two layouts share exactly one terrain/imagery/OSM facility acquisition node.

PR B done means

• plan --layout cacapon correctly blocks on route identity rather than guessing.
• plan --layout peek-n-peak-upper recognizes existing retained inputs where adapters are available or represents them as external/cached fixtures.
• one-hole changes invalidate one-hole descendants.
• scorecard-only changes do not invalidate source rasters.
• renderer-only task version changes do not invalidate acquisition/package tasks.
• no player code behavior changes.
• no source-provider switch yet.

────────

PR C - Provider contracts and facility source bundles

Recommended branch: agent/course-factory-c
Base: PR B
Behavior change: none
Production writes: none

15. PR C objective

Turn today’s source scripts into provider adapters under a common contract and make source acquisition facility-scoped.

The factory should stop knowing how USGS, NAIP, Overpass, NC OneMap or a future Canadian provider works. It should ask providers:

```text
discover(aoi)
select(candidates, policy)
acquire(candidate, destination)
validate(artifact)
```

────────

16. Provider interfaces

Suggested Python protocols:

```python
class TerrainProvider(Protocol):
    provider_id: str
    def discover(self, facility, aoi) -> list[TerrainCandidate]: ...
    def acquire(self, candidate, dest) -> SourceArtifact: ...
    def validate(self, artifact) -> ValidationResult: ...

class ImageryProvider(Protocol):
    ...

class VectorProvider(Protocol):
    ...
```

Provider selection comes from the facility catalog’s existing providerPolicy order.

A provider failing does not authorize the next provider to silently lower quality. The selection result must state what changed.

────────

17. Facility source bundle

One physical facility should produce:

```text
output/course-geometry/factory/facilities/<facilityId>/
  sources/
    osm/
      manifest.json
      aoi.osm.pbf or overpass.json.gz
    terrain/
      manifest.json
      elevation.tiff or provider-native window
    imagery/
      manifest.json
      ortho.tif
    context/
      manifest.json
      context.osm.pbf or overpass.json.gz
  facility-source-bundle.json
```

Layouts refer to this source bundle; they do not redownload it independently.

────────

18. OSM strategy - migrate safely, not ideologically

Long-term scale should not depend on repeated public Overpass queries.

But do not replace a proven source path with an unverified one in one jump.

Step C1 - wrap the current retained Overpass path

Make today’s fetch-osm-course.py and fetch-osm-context.py conform to the vector provider contract.

This becomes the oracle/fallback.

Step C2 - add regional extract support

Add an optional Geofabrik/osmium provider:

1. download the appropriate regional PBF to Class B cache;
2. record provider URL/date/checksum;
3. use osmium extract against the facility AOI;
4. retain only the small AOI extract as Class A;
5. evict the regional PBF when disk policy requires it.

Step C3 - parity test before making it default

For Peek’n Peak and Cacapon:

• run Overpass source extraction;
• run regional-PBF extraction for the same AOI and timestamp window where practical;
• normalize both;
• compare relevant golf feature ids/tags/geometries;
• investigate differences;
• only then choose the default batch provider.

If parity is not understood, keep Overpass as the source for that facility.

────────

19. Terrain strategy - benchmark S1M before changing defaults

The facility catalog already orders:

```text
usgs_s1m
usgs_3dep_project_1m
```

That should remain a policy intention, not an untested assumption.

C1 terrain work

Wrap the current 3DEP project selector/compiler acquisition as provider usgs_3dep_project_1m with no behavior change.

C2 S1M discovery spike

For the current source-complete cohort:

• call S1M discovery only;
• record coverage yes/no;
• record source date/resolution;
• attempt a small window on a sample;
• validate nodata/empty fill;
• compare elevations against the retained project tile at stable sample points;
• record acquisition latency and bytes.

Produce:

```text
output/course-geometry/factory/research/s1m-coverage.json
output/course-geometry/factory/research/s1m-coverage.md
```

Do not switch the compiler’s default provider until the report passes a written acceptance rule.

Acceptance rule example

Use S1M first for a facility only when:

• the entire required AOI has valid 1 m data;
• nodata percentage is under the existing threshold;
• CRS/grid metadata is retained;
• comparison to a known good 3DEP project tile is within expected source differences;
• capture/publication date is known enough to evaluate currency;
• the source manifest can reproduce the exact window.

Otherwise fall back explicitly to the current project tile provider.

────────

20. Imagery providers

Start with:

```text
naip_current
nc_onemap_ortho
```

Provider output must preserve:

• acquisition/capture date;
• native resolution;
• CRS;
• bands;
• bounds;
• source/service identity;
• export parameters;
• sha256;
• whether the raster is analysis-capable or visual-only.

Known renovation dates in the facility/layout catalog should be compared to imagery capture date and produce a blocker/warning rather than silently accepting stale imagery.

────────

21. PR C done means

• One facility source bundle contract.
• Existing Overpass/3DEP/NAIP scripts available through adapters.
• Source manifest hashes participate in factory fingerprints.
• Large reacquirable provider inputs are accounted for as Class B.
• S1M discovery produces a report but does not silently replace the current provider.
• Geofabrik/osmium path is optional until parity is demonstrated.
• No second production course activation.

────────

PR D - Cacapon as the first factory-built vertical slice

Recommended branch: agent/course-factory-d-cacapon
Base: PR C
Production activation: no
Primary purpose: prove the factory on a non-Upper layout

22. Why Cacapon remains the right second course

Cacapon is useful because it is not clean-room simple:

• 18 routes exist and historically matched the scorecard.
• 71 bunkers stress imagery review.
• the old fixture predates the current package preparation path.
• terrain exists but is course-terrain-v1 and must move to v4.
• the old raw source is not the current retained Overpass-manifest contract.
• holes 4/8 have a shared-green ambiguity that should become an explicit blocker/decision rather than tribal knowledge.

If the factory can migrate Cacapon cleanly, it proves more than a fresh easy course would.

────────

23. Cacapon Stage 0 - resolve only the facts machines cannot

Before the factory can pass layout.routes.resolve, update the catalog with:

• the 18 exact OSM route way ids in scorecard order;
• authoritative bbox derived from the selected facility/layout extent;
• scorecard source status;
• explicit shared-green 4/8 review requirement.

Do not let the factory infer route order from nearest-green geometry when the catalog’s design says route identity is human-pinned.

Once pinned, route identity becomes data and should never need repeated hand work unless the source changes.

────────

24. Run Cacapon through the factory

The operator experience should be roughly:

```bash
python3 scripts/golf/course-geometry/course-factory.py doctor
python3 scripts/golf/course-geometry/course-factory.py plan --layout cacapon
python3 scripts/golf/course-geometry/course-factory.py run --layout cacapon --until layout.review.queue
python3 scripts/golf/course-geometry/course-factory.py status --layout cacapon
```

The factory invokes existing geospatial implementations through task adapters.

Expected outputs:

1. retained current OSM snapshot/manifests;
2. normalized candidate layout package;
3. association report;
4. terrain source manifest;
5. 18 v4 terrain meshes;
6. current canopy candidate/review evidence;
7. imagery dossier;
8. context source/layer/report;
9. per-hole world/truth/GLB/round-trip artifacts;
10. review queue;
11. visual/player QA plan and results;
12. capability report;
13. factory metrics report.

────────

25. Do not make Cacapon production C3 by accident

Factory completion and truth capability are different.

Cacapon can have a successful machine build while still being:

• source-candidate;
• human-review incomplete;
• shared-green decision pending;
• truth-gate failing for authoritative surface use.

The factory should report the highest honestly earned capability.

Recommended target for this PR:

• machine-complete visual candidate;
• all uncertainty retained;
• no production registry entry unless/until owner separately approves a C2 pilot exception;
• no C3/C4 claims without the required human/field evidence.

Do not change the established tier definitions in the Cacapon PR. Apply them.

────────

26. Cacapon migration rule - old artifacts are comparison evidence, not authority

Keep old Cacapon fixtures while building the replacement.

Compare:

• hole count/order;
• route association;
• feature count by class;
• terrain elevation statistics;
• package extents;
• renderer captures;
• draw calls/triangles;
• old vs new hashes.

Only after the new chain is complete should the old fixture path be deleted or marked legacy.

One commit should switch consumers/tests from old to new so the repo never points at a half-migrated course.

────────

27. Capture factory performance metrics now

Do not wait until 20 courses to discover where time goes.

Per task record:

```text
wallClockMs
cpuMs where easy
bytesRead
bytesWritten
networkBytes where known
cacheHit boolean
peak temporary disk estimate where known
```

Per human review session later:

```text
layoutId
reviewType
startedAt
finishedAt
itemsPresented
itemsAccepted
itemsAdjusted
itemsRejected
itemsEscalated
```

This gives real evidence for whether the factory reaches the intended review-time reduction.

────────

PR E - Risk-ranked human review and immutable review overlays

Recommended branch: agent/course-factory-e-review
Base: Cacapon vertical slice

28. PR E objective

Stop treating every feature as equally suspicious.

The machine should inspect everything and rank what deserves attention. The human remains the authority for the decisions the evidence cannot safely make.

────────

29. Review item schema

Example:

```json
{
  "reviewId": "cacapon:bunker:osm-way-1234",
  "layoutId": "cacapon",
  "holeKeys": ["cacapon-07"],
  "featureId": "osm-way-1234",
  "kind": "bunker",
  "riskScore": 78,
  "severity": "high",
  "reasons": [
    "LOW_SAND_AGREEMENT",
    "IMAGERY_SOURCE_NEWER_THAN_OSM_SNAPSHOT"
  ],
  "evidence": {
    "insideSandShare": 0.18,
    "outsideRingSandShare": 0.43,
    "imageryDate": "...",
    "sourceReviewed": false
  },
  "recommendedAction": "inspect",
  "decision": null
}
```

Risk is triage, not truth.

────────

30. Initial risk scoring inputs

Use evidence already available before adding fancy ML.

Layout/route risk

• duplicate hole number;
• missing route;
• route/scorecard count mismatch;
• route length far from scorecard yardage after accounting for expected path differences;
• shared green;
• multiple plausible greens;
• multi-layout facility overlap.

Golf surface risk

• missing fairway/tee/green;
• polygon invalidity;
• self-intersection;
• tiny/huge area outlier compared with course peers;
• bunker sand agreement low;
• unclaimed sand blob nearby;
• source polygon crossing unrelated hole route;
• OSM feature newer/older than available imagery in a suspicious way;
• trace accuracy above threshold.

Context risk

• unexplained share above target;
• class overlap;
• water/road/path intersections with golf surfaces;
• canopy filling a large interior clearing;
• dark-class ambiguity;
• context feature touching multiple distant holes.

Terrain risk

• nodata near played surface;
• slope discontinuity;
• failed normal audit;
• T-junction > 0;
• breakline mismatch;
• extreme elevation delta vs neighbors.

────────

31. Review queue UI

Keep it out of production UI.

Add a local lab route or generated static review page with:

• facility/layout summary;
• capability state;
• source dates;
• package hash;
• risk histogram;
• holes ranked by total review risk;
• individual review cards with orthophoto overlay;
• deep link/open instruction for QGIS when geometry needs editing;
• accept/reject/escalate controls only if the decisions are written to a local sidecar, never production DB.

QGIS remains the geometry editor. The lab is triage and decision navigation.

────────

32. Review overlays, not source mutation

Use a checked-in/retained review file such as:

```text
course-geometry/reviews/<layoutId>/review-v1.json
```

or the existing fixture-sidecar convention if it better fits the repo.

It should contain decisions referencing stable source feature ids:

```json
{
  "sourcePackageHash": "...",
  "reviewedAt": "...",
  "reviewer": "owner",
  "decisions": [
    {
      "featureId": "...",
      "action": "accept"
    },
    {
      "featureId": "...",
      "action": "adjust",
      "replacementGeometry": {"...": "..."},
      "reason": "orthophoto boundary"
    }
  ]
}
```

Source evidence remains immutable.

────────

33. Prove incremental rebuild with a real Cacapon adjustment

Pick one reviewed Cacapon feature on one hole.

Before edit:

```bash
course-factory.py plan --layout cacapon --json > before.json
```

Apply review decision.

After edit:

```bash
course-factory.py plan --layout cacapon --json > after.json
```

Acceptance:

• package compose stale;
• affected hole terrain/world/truth/visual stale;
• unaffected hole terrain/world/visual cached;
• layout aggregate/publish stale;
• facility source tasks cached;
• imagery source cached;
• terrain raster cached.

This is the proof that Factory v2 is genuinely different from the original linear pipeline.

────────

PR F - Multi-layout app release plumbing

Recommended branch: agent/course-factory-f-multilayout
Base: reviewed factory runtime

34. PR F objective

Remove the last production assumption that the server evaluates one hard-coded layout’s flags.

Do this without sending the entire registry or flag set to the client.

────────

35. Prefer a resolved release object over a giant flag map

Instead of:

```text
oneTapFlagEnabled
oneTapSyncEnabled
```

and instead of passing an N-course boolean map to every client, create a server helper:

```ts
interface ResolvedCourseGeometryRelease {
  layoutId: string;
  geometryEnabled: boolean;
  syncEnabled: boolean;
  acceptedCapabilityTier: CapabilityTier;
}
```

Pseudo flow:

```ts
const policy = resolveCourseGeometryPolicy({ dbCourseId, courseName });
if (!policy) return null;

return {
  layoutId: policy.layoutId,
  geometryEnabled: await evaluateFlag(policy.geometryFeatureFlag),
  syncEnabled: policy.syncFeatureFlag
    ? await evaluateFlag(policy.syncFeatureFlag)
    : false,
  acceptedCapabilityTier: policy.acceptedCapabilityTier,
};
```

The round page passes the resolved object for the round being opened.

Benefits:

• evaluates only the relevant flags;
• no client-side feature-flag knowledge;
• no N-layout payload growth;
• no chance the wrong course’s boolean is accidentally reused;
• easy to unit test with two synthetic policies.

────────

36. Bind database course ids in this PR

Once the resolver path is generic and tested, copy catalog externalBindings.golfCourseIds into policy dbCourseIds for served layouts.

For Upper, add its exact bound row id and preserve the name regex as fallback during migration.

Tests must prove:

1. db id wins even if the display name changes;
2. a sister course sharing the facility/site cannot resolve by proximity;
3. an unknown db id with an Upper-looking unrelated name follows the documented fallback rules;
4. duplicate db ids across policies fail registry validation.

Longer term, generate the registry bindings from catalog data to avoid maintaining the same id twice.

────────

37. Flag strategy

Given the current flag system is boolean, use two layers:

Global emergency kill switch

Optional but recommended:

```text
course_geometry_v2
```

If off, no new geometry capability activates regardless of layout policy.

Per-layout geometry flag

Generated/named consistently:

```text
course_geometry_peek_n_peak_upper_v1
course_geometry_cacapon_v1
...
```

The existing Peek flag can remain aliased during migration to avoid changing the release contract in the same PR.

Per-layout sync flag only when needed

Sync should remain separate because it is gated by database migrations and write-path readiness.

Do not generate sync flags for layouts that are visual-only.

Registry/flag consistency test

For every served policy:

• geometry flag exists in config;
• sync flag exists if non-null;
• no duplicate flag ids;
• cleanup metadata is present according to repo conventions.

Generate repetitive rows if the current feature-flag toolchain supports it; do not hand-maintain 50 nearly identical rows forever.

────────

38. Multi-layout regression matrix

Use synthetic policies/assets first, then Cacapon if its package is owner-approved for a pilot.

Test:

|Round                      |Registry       |Flag|Assets       |Expected                     |
|---------------------------|---------------|----|-------------|-----------------------------|
|Upper                      |yes            |on  |approved     |Upper geometry               |
|Cacapon                    |yes            |on  |approved     |Cacapon geometry             |
|Cacapon                    |yes            |off |approved     |standard tracker / off reason|
|Cacapon                    |yes            |on  |wrong hash   |refused                      |
|Sister layout              |no             |n/a |n/a          |0 geometry requests          |
|Pebble                     |no             |n/a |n/a          |0 geometry requests          |
|Name changed, bound id     |yes            |on  |approved     |correct layout               |
|Same facility, wrong layout|no/other policy|on  |assets nearby|never activates by proximity |

This is the point where “multi-course” becomes a product fact rather than a type-system fact.

────────

PR G - Asset publication at library scale

Recommended branch: agent/course-factory-g-assets

39. Why this cannot wait for 50 courses

The current Upper published asset directory is already tens of megabytes and the retained fixture footprint is larger.

The source tree is an excellent pilot distribution mechanism but a poor permanent course CDN.

Solve this before many additional layouts are published.

────────

40. Publisher abstraction

Refactor publish-course-assets.mts behind a destination interface:

```ts
interface CourseAssetPublisher {
  putImmutable(path: string, bytes: Uint8Array, metadata: AssetMetadata): Promise<PublishedObject>;
  putPointer(path: string, bytes: Uint8Array, metadata: AssetMetadata): Promise<PublishedObject>;
  head(path: string): Promise<PublishedObject | null>;
}
```

Implementations:

```text
LocalPublicPublisher    # today's public/course-geometry behavior; test/dev
RemoteObjectPublisher   # production library target
```

Do not make the compiler care which backend is used.

────────

41. Remote object layout

Recommended shape:

```text
course-geometry/
  <layoutId>/
    versions/
      <geometryHash>/
        package.json
        context-<hash>.json
        terrain/
          <hole>-<hash>.json
        visual/
          ...
        manifest.json
    manifest.json        # small current approved pointer
```

Publication order:

1. upload immutable versioned objects;
2. verify remote bytes/hash/size;
3. upload version manifest;
4. only after everything verifies, update the small stable pointer manifest;
5. never mutate old hash-versioned objects in place.

Rollback becomes pointer reversal.

────────

42. Asset manifest evolution

Add optional fields while retaining the current loader shape:

```json
{
  "courseId": "cacapon",
  "geometryVersion": "...",
  "packageUrl": "https://...",
  "packageSha256": "...",
  "packageBytes": 123,
  "terrainByHole": {
    "cacapon-01": {
      "url": "https://...",
      "sha256": "...",
      "bytes": 123
    }
  }
}
```

If changing terrainByHole from string to object is too disruptive, add parallel metadata first and migrate the reader with a compatibility parser.

The loader should verify cryptographic hashes where practical, not only rely on JSON-level package content hashes.

────────

43. Offline behavior must remain a release gate

Remote storage cannot regress the strongest part of the current implementation.

For every activated course prove:

1. online first load succeeds;
2. manifest/package/current+next terrain cache;
3. kill connectivity;
4. reload/open round;
5. approved cached geometry still loads;
6. marks remain durable;
7. stale manifest cannot cause a mismatched package/terrain version to be combined.

────────

PR H - Scale the catalog and work queue

Recommended branch: agent/course-factory-h-scaleout

44. Seed catalog from the 52-facility audit

At this point the catalog stops being two hand-written examples.

Write a generator that reads the retained library coverage audit and produces candidate facility/layout manifests.

Generator output is proposal data, not automatically trusted identity.

Human pins remain required for:

• multi-layout facility identity;
• ambiguous OSM polygon;
• layout route ordering;
• missing facility polygon;
• external golf_courses binding conflicts.

────────

45. Factory work queue

Generate one status row per layout:

```text
layoutId
facilityId
completedRounds
capabilityTier
sourceReadiness
routeReadiness
terrainReadiness
imageryCurrency
reviewRisk
estimatedMachineCost
estimatedHumanItems
blockers
nextTask
```

Then calculate a priority score from transparent components, not a mysterious AI rank.

Example:

```text
priority =
  usageWeight
  * readinessWeight
  * businessPriorityWeight
  / max(reviewCostWeight, floor)
```

Show the component values so the owner can override intentionally.

────────

46. Initial rollout order after Cacapon

Do not lock a 50-course static wave forever. Use the live queue.

But the first likely source-complete layouts should still come from the known set because they prove different failure classes:

1. Winchester - another existing partial fixture and real usage.
2. Grande Dunes or Forsyth - cleaner full-chain proof.
3. UK Big Blue - multi-layout/facility route selection proof.
4. a Florida resort layout - dense overlapping facilities/water proof.
5. a high-bunker outlier later, not first.

Do not pick Whistling Straits as an early factory benchmark. Its 1,384 mapped bunker polygons will measure the outlier path, not the ordinary path.

────────

NC provider track

47. Add NC OneMap terrain as a provider, not a compiler special case

The old plan called this an “NC adapter in compile-course-terrain.py.”

Factory v2 should improve that design.

Implement:

```text
TerrainProvider: nc_onemap_dem03
```

It should produce the same normalized terrain source artifact contract as USGS providers.

Then the terrain compiler consumes a normalized source artifact and does not care whether it came from USGS project 1 m, S1M, or NC DEM03.

This prevents provider branching from spreading through the compiler.

Acceptance on one NC course:

• native source grid retained;
• no silent resampling claim;
• CRS and grid transform explicit;
• nodata handled;
• normals audit passes;
• v4 compile has zero T-junctions;
• elevation round-trip tolerance passes;
• provider identity appears in package/build provenance.

Once proven, the 14 NC terrain-blocked facilities move from provider-blocked to whatever their next real blocker is.

────────

Capability model enforcement

48. Keep capability separate from build completion

The factory should produce a capability-report.json for every layout.

Example structure:

```json
{
  "layoutId": "cacapon",
  "packageHash": "...",
  "earnedTier": "C2",
  "blockedHigherTiers": {
    "C3": [
      "HUMAN_BOUNDARY_REVIEW_REQUIRED",
      "SHARED_GREEN_DECISION_REQUIRED"
    ],
    "C4": [
      "FIELD_VERIFICATION_REQUIRED"
    ]
  },
  "capabilities": {
    "productionVisual": true,
    "tapToMeasure": true,
    "authoritativeLieClassification": false,
    "reviewShotResolution": false,
    "fieldVerified": false
  }
}
```

Exact capability names/tier semantics should match the existing Factory v2 definitions. The important rule is that capabilities are derived from evidence, not manually asserted because the build succeeded.

────────

QA redesign for scale

49. Stop running 132 captures after every tiny edit

Keep the full sign-off matrix for a release candidate. Add a pyramid for ordinary iteration.

Level 0 - structural tests, every relevant change

• schema validation;
• hashes;
• package/context binding;
• topology;
• T-junctions;
• normals;
• source coverage;
• truth gate;
• draw-call static estimates where available.

Level 1 - affected-hole canaries

On one-hole geometry/render changes:

• changed hole;
• previous hole if shared context can affect it;
• next hole if shared context can affect it;
• one stable golden canary hole.

Presets/viewports selected for the layer touched.

Level 2 - layout smoke

Before marking layout build complete:

• all 18 holes one canonical viewport/preset;
• no page errors;
• draw calls under budgets;
• camera fits;
• package/terrain loads.

Level 3 - full release sign-off

Before first publication or meaningful renderer/compiler revision:

• existing 96 lab canaries;
• 36 player captures;
• full diff against last approved label;
• offline/caching checks;
• required device class checks according to release policy.

The factory chooses the required QA level from the impact graph.

────────

Observability and reports

50. Every factory run should leave one human-readable report

Path example:

```text
output/course-geometry/factory/runs/<run-id>/report.md
output/course-geometry/factory/runs/<run-id>/report.json
```

Report sections:

1. command and git head;
2. target facilities/layouts;
3. executed/cached/blocked/failed task counts;
4. source versions/dates;
5. changed fingerprints;
6. artifacts created;
7. disk before/after;
8. blockers;
9. review queue summary;
10. capability change;
11. QA performed;
12. next runnable actions.

This becomes the handoff between agents/sessions. No more reconstructing a course’s state from 12 command histories.

────────

CI strategy

51. Keep heavy geospatial builds out of ordinary CI

Do not make every app PR download DEMs and NAIP.

Split gates:

Always in normal CI

• catalog schemas/invariants;
• registry consistency;
• factory unit tests;
• golden DAG plans;
• fingerprint/impact tests;
• small fixture compiler tests;
• existing app tests/typecheck/lint/build.

Dedicated course-artifact workflow

Triggered when:

• catalog/source/review files change;
• course compiler code changes;
• an owner explicitly dispatches a course build.

Uses retained/cached test sources or workflow artifacts where appropriate.

Release sign-off workflow

Runs visual matrices and publication verification for selected layouts.

This keeps Factory v2 from turning every unrelated app PR into a 45-minute GIS job.

────────

Concrete next 72 engineering steps

The following is intentionally executable. It is the recommended order for PR B through the first Cacapon proof.

PR B - runtime

1. Branch agent/course-factory-b from PR A.
2. Add factory/model.py task/artifact/reason dataclasses.
3. Add catalog reader that invokes/checks the same catalog invariants as the TS schema via fixture parity; do not create divergent semantic rules casually.
4. Define stable task ids and scopes.
5. Build DAG constructor for facility -> layout -> hole nodes.
6. Add cycle detection.
7. Add canonical fingerprint helper.
8. Add direct-input hash recording.
9. Add per-hole source/package/context subhash helpers over existing fixtures.
10. Add SQLite ledger schema/migrations local to the tool.
11. Add artifact existence/hash verification.
12. Add planner states.
13. Add blocker propagation.
14. Add doctor.
15. Add plan text output.
16. Add plan --json.
17. Add status.
18. Add why.
19. Add invalidate with recorded reason.
20. Add disk accounting and guard.
21. Add synthetic two-layout/one-facility fixture.
22. Prove shared facility acquisition nodes.
23. Add one-hole invalidation test.
24. Add scorecard-change non-terrain-invalidation test.
25. Add renderer-version non-source-invalidation test.
26. Add interrupted-run recovery test.
27. Add golden plan for Cacapon C0 blocker state.
28. Add docs/README command sheet.
29. Run Python lint/tests.
30. Run repo gates relevant to changed files.
31. Open PR B draft stacked on #1949.

PR C - providers

32. Define vector/terrain/imagery provider protocols.
33. Wrap current Overpass course fetch as vector provider.
34. Wrap current context fetch as vector/context provider.
35. Wrap current 3DEP project acquisition as terrain provider.
36. Wrap current NAIP export as imagery provider.
37. Define common source artifact manifest.
38. Define facility source bundle manifest.
39. Connect provider outputs to factory artifact ledger.
40. Add Class B cache directory/accounting.
41. Add optional osmium dependency detection.
42. Implement regional PBF -> AOI extraction path.
43. Run Upper Overpass/PBF parity comparison.
44. Run Cacapon Overpass/PBF parity comparison.
45. Implement S1M discovery only.
46. Run source-complete cohort S1M coverage audit.
47. Sample S1M vs current 3DEP elevation points.
48. Write provider-choice report.
49. Do not flip defaults until report acceptance criteria pass.
50. Open PR C.

PR D - Cacapon

51. Pin Cacapon’s 18 route way ids in catalog.
52. Record/resolve shared green 4/8 as an explicit review item.
53. Factory plan --layout cacapon should become runnable through acquisition.
54. Acquire/retain fresh source snapshot through provider layer.
55. Compose current package via current prepare path.
56. Compile all 18 holes with terrain v4.
57. Run T-junction and normal audits.
58. Re-derive canopy with current algorithm.
59. Generate imagery dossier.
60. Acquire/classify context.
61. Recompile affected terrain with context breaklines.
62. Build per-hole world/truth/GLB/round-trip artifacts.
63. Generate review queue.
64. Run layout smoke QA.
65. Run full first-release Cacapon visual/player matrices.
66. Compare old/new Cacapon artifacts.
67. Record machine timings and bytes.
68. Record initial human review item count.
69. Produce capability report.
70. Keep production registry/policy off unless explicitly approved.
71. Open PR D with machine evidence and blockers.

PR E proof

72. Make one real reviewed geometry adjustment and prove the factory rebuilds only its impacted hole descendants plus layout aggregates.

If step 72 works cleanly, the architecture has crossed the most important threshold: course N+1 is no longer “run the whole Peek’n Peak process again.”

────────

Decisions for the owner

52. Decisions needed now

Only a few decisions are actually needed before PR B starts.

Decision 1 - proceed with stacked PR B now?

Recommendation: yes. PR B has no production behavior and can be developed while #1939’s owner gates are pending.

Decision 2 - factory state store

Recommendation: local SQLite in ignored output/course-geometry/factory/state.sqlite.

Do not put build orchestration state in Supabase. Source truth remains in retained artifacts/catalog/review files; the ledger is disposable local execution state.

Decision 3 - keep Python as orchestration runtime?

Recommendation: yes. Existing geo chain is Python, and SQLite/filesystem/subprocess support is straightforward. Keep TypeScript at app/publication boundaries.

Decision 4 - Cacapon production activation in its build PR?

Recommendation: no. Build and review it first. Activation should be a separate explicit release decision after capability evidence exists.

Decision 5 - switch to S1M immediately?

Recommendation: no. Implement discovery/validation and compare first. Adopt it where it proves better coverage without weakening reproducibility.

Decision 6 - replace Overpass immediately?

Recommendation: no. Add regional extraction and prove parity. Keep retained Overpass as an oracle/fallback during transition.

Decision 7 - remote asset backend now?

Recommendation: do not block PR B-D on the provider choice. Build the publisher abstraction in PR G, then choose the backend with actual size/cache/access requirements in hand.

────────

Things explicitly not to do next

53. Anti-goals

Do not:

• add Cacapon to COURSE_GEOMETRY_REGISTRY with an approved hash just to prove multi-course;
• create 50 policy objects by hand;
• create 50 feature-flag rows by hand before the registry-generation path exists;
• turn build-course.sh into a 600-line orchestrator;
• fingerprint every task with the entire Git commit;
• re-download facility terrain once per layout;
• re-run all 18 holes after one feature adjustment when dependencies identify one affected hole;
• let AI/CV-derived geometry become reviewed truth automatically;
• treat a successful render as a passing truth gate;
• make public Overpass the only batch ingestion strategy;
• silently use coarser terrain when 1 m is unavailable;
• silently accept imagery older than a known renovation;
• publish large numbers of course assets permanently into Git because it is convenient for the pilot;
• put factory build state in production Supabase;
• make every normal CI run a network-heavy GIS pipeline;
• activate a course because it shares a facility geofence with an approved layout;
• let name matching remain the long-term identity when exact golf_courses ids are known.

────────

Definition of success for Factory v2

54. Technical success

The architecture is successful when:

1. adding a second layout at the same facility does not duplicate facility source acquisition;
2. the factory can resume after failure without restarting completed work;
3. the factory can explain every blocked/stale task;
4. one-hole review edits rebuild one-hole descendants;
5. provider changes are explicit and source-manifested;
6. source truth, review decisions and compiled products remain distinct;
7. capability level is derived from evidence;
8. unregistered/unapproved layouts still make zero geometry requests;
9. publication is content-addressed and rollbackable;
10. normal app CI does not become a GIS build farm.

55. Operational success

Measure rather than assume:

• median machine time per source-complete facility;
• median no-op rerun time;
• cache hit ratio;
• bytes downloaded per new layout at an existing facility;
• average affected holes per review adjustment;
• number of review items presented per 18-hole layout;
• reviewer minutes per course;
• percentage of layouts that require full QGIS escalation;
• visual QA failure rate;
• source-provider failure/retry rate;
• disk retained per facility after cleanup.

The target of 30-90 minutes human review for ordinary clean courses remains a target until Cacapon, Winchester and several clean courses produce real measurements.

────────

Recommended immediate prompt to the coding agent

Use this as the next-session implementation direction:

```text
We are continuing GolfHelm Course Geometry Factory v2.

Current state:
- #1939 agent/golf-course-geometry is the owner-gated production/deploy PR. Do not modify its release gates, flags, migration, device signoff, Sentry approval, context answers or canopy decision.
- Draft #1949 agent/course-factory-a is PR A and is stacked on #1939. It landed the generic CourseGeometryPolicy/registry, the Peek'n Peak compatibility shim, generic production importers, capability_not_available, and the facility/layout/scorecard catalog. Peek'n Peak Upper is C2; Cacapon is C0. Player behavior remains single-course because the round pages still evaluate Upper's flags into the existing booleans.

Build PR B on a new branch agent/course-factory-b from PR A.

PR B is ONLY the factory runtime. No Cacapon production activation. No new feature flags. No production writes. Do not rewrite geospatial algorithms.

Implement a Python course-factory orchestrator under scripts/golf/course-geometry/factory plus a thin course-factory.py CLI. It must:
1. read/validate the checked-in facility/layout/scorecard catalog;
2. construct explicit facility/layout/hole task DAGs;
3. fingerprint each task from only its direct semantic inputs, task version and relevant implementation-file hashes - never the whole git HEAD;
4. persist disposable build state in ignored SQLite under output/course-geometry/factory/state.sqlite;
5. verify artifact existence/hash before considering a task cached;
6. expose doctor, plan, plan --json, run, status, why and invalidate commands;
7. use stable blocker/reason codes;
8. model per-hole subhashes so one-hole geometry edits invalidate only that hole's terrain/world/visual descendants plus layout aggregates;
9. model facility acquisition nodes once so two layouts at one facility share source tasks;
10. model disk retention classes and enforce the existing 8 GB reserve guard;
11. write JSON + Markdown run reports;
12. make all tests network-free.

Required regression fixtures/tests:
- Peek'n Peak Upper plan;
- Cacapon C0 plan blocked explicitly on missing routeWayIds rather than guessing;
- synthetic two-layout/one-facility graph proving shared acquisition;
- one-hole bunker edit leaves an unrelated hole's terrain/world/visual tasks cached;
- scorecard-only edit does not invalidate terrain source/acquisition;
- renderer task-version change does not invalidate source/package acquisition;
- interrupted running task recovers safely;
- missing/corrupt artifact invalidates the producer despite a prior success row;
- DAG cycle detection and blocker propagation.

Do not add source-provider switches in PR B. The existing fetch/compile scripts become adapters in PR C. PR B's purpose is to make the execution model correct and inspectable before Cacapon is rebuilt.

Update docs/plans/2026-09-19-course-geometry-factory-v2-review.md with exactly what PR B lands, remaining blockers, test counts and the next PR boundary. Keep knowledge:check and the markdown ratchet clean. Use the same 8 GB Node heap required by the current branch for build/type verification.
```

────────

Final recommendation

PR A was the right first cut. The next highest-value work is not another course; it is the machinery that makes another course cheaper than the first one.

Start PR B immediately as a stacked draft. Make it prove four things before touching Cacapon source acquisition:

1. facility work is shared;
2. tasks are fingerprinted and resumable;
3. one-hole changes stay one-hole changes;
4. every blocked/stale decision is explainable.

Then make Cacapon break the abstraction on purpose. Fix the abstraction, not Cacapon with special cases.

If Cacapon can go from its current C0 catalog entry to a complete current-contract candidate through one factory command, and one later bunker correction only rebuilds that bunker’s hole, Factory v2 is real. At that point scaling from 2 layouts to 20 becomes an operations/review problem rather than repeating the architecture project 18 more times.

────────

Repository references checked for this plan

• PR #1939: https://github.com/njrini99-code/helmv3/pull/1939
• PR #1949: https://github.com/njrini99-code/helmv3/pull/1949
• src/lib/golf/course-geometry/course-policy.ts
• src/lib/golf/course-geometry/course-registry.ts
• src/lib/golf/course-geometry/catalog.ts
• docs/plans/2026-09-19-course-geometry-factory-v2.md
• docs/plans/2026-09-19-course-geometry-factory-v2-review.md
