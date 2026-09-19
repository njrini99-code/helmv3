<!-- markdownlint-disable MD013 MD060 MD024 MD026 MD029 MD032 MD034 MD036 MD040 MD046 MD022 MD025 MD031 MD012 MD004 MD007 MD009 MD010 MD030 MD035 MD037 MD038 MD047 MD053 MD055 MD056 MD058 -->
# GolfHelm Course Geometry Factory v2

> Provenance: the owner's architecture plan, received in chat on 2026-09-19
> and stored here verbatim (only this note and the lint header were added).
> Appendix C arrived truncated after "A human should never have to infer
> 'why this cours". The engineering review against the code on
> `agent/golf-course-geometry` is `docs/plans/2026-09-19-course-geometry-factory-v2-review.md`;
> the source/tool inventory and the per-facility audit tables it builds on
> are in `docs/plans/2026-09-19-course-library-scale-out-plan.md`.

A scalable plan to bring the course library to Peek’n Peak quality without rebuilding Peek’n Peak 52 times

Date: 2026-09-19
Target branch: agent/golf-course-geometry
Starting point: PR #1939 / head described by the owner plan
Status: replacement architecture and implementation plan

────────

Executive summary

The current plan is technically disciplined and unusually strong on provenance, reproducibility, truth boundaries, and rendering quality. Its weakness is not correctness. Its weakness is unit of scale.

Right now the system effectively treats every 18-hole course as an independent mini-project:

1. discover it,
2. fetch its sources,
3. normalize it,
4. compile it,
5. inspect imagery hole by hole,
6. review context hole by hole,
7. review boundaries hole by hole,
8. build 18 worlds,
9. run 132 screenshots,
10. publish a new static asset tree,
11. add a new app policy,
12. repeat.

That worked for Peek’n Peak because the pipeline itself was being invented while one course was being built. It is the wrong shape for a library.

The replacement should be a Course Geometry Factory with five central ideas:

1. Facility is the source-acquisition unit; layout is the product unit.
Bethpage, TPC Sawgrass, UK, Pine Lakes, Bryan Park, Landfall, and other multi-layout properties should acquire terrain, imagery, OSM/context, and buildings once. Individual 18-hole layouts then reference subsets of the same facility evidence.
2. Use a declarative DAG with content fingerprints, not a linear shell script.
Every stage knows its inputs, outputs, hash, dependencies, and invalidation scope. A bunker adjustment on Hole 7 should rebuild Hole 7 and the artifacts that depend on it, not the whole facility.
3. Separate evidence, review decisions, and compiled products.
OSM, imagery candidates, canopy candidates, authoritative scorecard facts, reviewer edits, terrain, and render artifacts should not keep being merged into one file and re-hashed through the whole chain. Compose the canonical layout package from immutable layers only when needed.
4. Replace one binary definition of “done” with capability tiers.
A course can be safe to render before it is safe for authoritative lie classification, and it can be safe for reviewed shot placement before anyone has walked it on-site. The product should enable only the capabilities that the evidence supports.
5. Make humans review exceptions, not pixels.
Machine QA should rank suspicious features, stale imagery, unmatched sand, topology failures, route ambiguity, unusual greens, missing fairways, and context gaps. A reviewer should spend most of their time on the 10–30 questionable items, not manually re-inspecting every ordinary polygon on every course.

The current plan estimates roughly 6.5–14 human hours per course before an on-course truth walk. Across 52 facilities that is approximately 338–728 human hours, plus field verification. That is the main scaling wall. The factory should target ordinary source-complete courses at 30–90 minutes of human review, with outliers escalating into a full QGIS session. That is a target, not a promise; the system must measure actual reviewer minutes per course and learn from them.

The final model is:

```text
                 LIBRARY CATALOG
                      |
          +-----------+------------+
          |                        |
      FACILITY A                FACILITY B
   shared source bundle      shared source bundle
          |                        |
   +------+------+           +-----+------+
   |             |           |            |
LAYOUT 1      LAYOUT 2     LAYOUT 1    LAYOUT 2
   |             |           |            |
review overlay  review     review       review
   |             |           |            |
canonical package + per-hole derived artifacts
   |
capability gates
   |
published content-addressed assets
   |
course registry / app resolver
```

The most important practical change is this:

> **Do not build `build-course.sh` as the final scaling architecture.**
>
> A small convenience wrapper is fine, but the real enabling work should be a stateful, declarative `course-factory` command with a dependency graph, batch mode, incremental rebuilds, source-provider adapters, a review queue, and a library status database.

────────

1. What is already right and should not be weakened

The replacement architecture must preserve the best parts of the current system.

1.1 Keep the anti-invention rule

The core rule remains:

```text
reviewed source
    > trace from retained orthophoto with explicit accuracy
    > derived geometry with an explicit derivation
    > uncertain / absent
```

No missing fairway becomes a guessed fairway. No bunker becomes a procedural hole in the ground and then quietly leaks into shot classification. No decorative tree becomes an obstruction claim. No imagery-derived polygon becomes measured truth.

1.2 Keep content-addressed evidence

Every acquired source should continue to have:

• provider,
• source identifier,
• acquisition time,
• capture/publication time where available,
• exact spatial bounds,
• CRS,
• pixel/grid resolution,
• request parameters,
• source URL or provider locator,
• SHA-256,
• license/attribution,
• validation result.

The change is that these fields become part of a common source artifact contract instead of being implemented separately by every fetch script.

1.3 Keep immutable source evidence

Reviewer changes should never mutate the original source extract. The factory should retain:

```text
source snapshot -> candidate layer -> review overlay -> canonical package
```

not:

```text
source file -> edited source file -> edited again -> unclear provenance
```

1.4 Keep truth and rendering separate

The existing separation between physical truth, display estimates, illustrative trajectories, decorative vegetation, and actual shot evidence is exactly right.

Do not weaken it for scale.

Scale should come from orchestration, shared source acquisition, better review tooling, incremental builds, and more selective QA—not from lowering evidentiary standards.

────────

2. What is wrong with the current scale-out plan

2.1 It duplicates work at the wrong level

Several library entries are layouts inside one physical property. The current plan still mostly describes them as individual course builds.

Examples:

• Bethpage facility -> several courses inside one OSM polygon.
• TPC Sawgrass -> Stadium + Dye’s Valley.
• PGA National -> multiple courses inside a resort polygon.
• UK -> Big Blue + Wildcat.
• Pine Lakes/Jekyll -> multiple courses.
• Bryan Park -> Champions + Players.
• Landfall -> reusable nines and multiple 18-hole combinations.
• Shenandoah Valley -> three nines.

The expensive source layers are spatial, not scorecard-specific:

• terrain,
• orthophoto,
• context roads,
• buildings,
• water,
• canopy evidence,
• source OSM snapshot.

Those should be retained once per facility source extent, then sliced into layouts.

2.2 It forces too much re-computation

The current flow intentionally re-runs package preparation and terrain compilation after canopy, context, and reviewer changes. That is safe but expensive.

The pipeline needs dependency-aware invalidation.

Examples:

• changing a scorecard yardage should not cause a DEM re-download;
• accepting an existing bunker boundary should not rebuild terrain if geometry did not change;
• editing Hole 7 should not regenerate Hole 14 terrain;
• changing a context classification outside Hole 3 should not invalidate Hole 12;
• a new OSM snapshot should first produce a diff, not automatically replace the approved package;
• a renderer-only change should not touch source packages at all.

2.3 The schema is still single-site / single-layout oriented

The current CourseGeometryPackage v1 has a siteId, a course name, features, and holes. It does not represent the distinction between:

• physical facility,
• playable layout,
• reusable nine,
• scorecard/tee profile,
• external database course identity.

That becomes painful exactly where the current audit already shows the largest ambiguity.

2.4 The app is still structurally single-course

I checked the current branch implementation.

Today:

• peek-n-peak-policy.ts owns the policy contract and the only approved package.
• use-course-geometry.ts accepts a policy parameter but defaults to the Peek’n Peak singleton and evaluates one resolved course against one policy.
• course-assets.ts directly imports the Peek’n Peak policy type/default.
• publish-course-assets.mts imports courseIdForSite from the Peek’n Peak policy module.
• package approval, source-candidate exception, course identity, and asset parsing are all coupled to the same one-course policy shape.

This is not a reason to bolt an array onto PEEK_N_PEAK_ONE_TAP_V1. It is the point where the policy layer should be generalized.

2.5 public/course-geometry will become an asset-storage cliff

The current publication model is perfect for one pilot course: source-controlled, previewable, deploy-gated, and easy to reason about.

It is not the right permanent home for a large terrain library.

If an average 18-hole course eventually ships even 20–40 MB of package + terrain + context + visual data, 50 courses becomes roughly 1–2 GB of static assets before normal app code and build products.

Vercel currently documents a 1 GB static-source upload ceiling for Pro deployments. Therefore the long-term architecture should treat generated course geometry as versioned object assets, not normal application source.

Keep tiny manifests and test fixtures in Git. Put large content-addressed course payloads behind a public object store/CDN.

2.6 Every course gets too much QA every time

The 96-capture canary matrix plus 36 player captures is excellent for:

• a new renderer,
• the first reference course,
• a new course’s first release,
• a risky geometry change.

It is wasteful as the default response to every local change on every course.

The QA strategy needs change-aware scope.

2.7 The current review model treats all features as equally expensive

A clean 18/18/18 course with recent imagery and no disagreements should not get the same review effort as:

• 1,384 Whistling Straits bunkers,
• a five-course resort polygon,
• a course with shared greens,
• stale orthophoto after a renovation,
• a missing route set,
• a facility with only greens and bunkers mapped.

The review queue should be risk-ranked.

────────

3. New domain model: facility -> segments -> layout -> scorecard profile

This is the foundation.

3.1 Facility

A facility is the physical property whose source data can be acquired together.

Examples:

```text
bethpage-state-park
peek-n-peak
bryan-park
landfall
pga-national
uk-golf
```

A facility owns:

• source extent / AOI,
• source-site identifiers,
• source snapshots,
• imagery bundle,
• terrain bundle,
• outside-world context,
• all candidate golf features found inside the AOI.

Suggested manifest:

```yaml
schema: golfhelm-facility-v1
facilityId: bethpage-state-park
name: Bethpage State Park
country: US
region: NY
originWgs84: [-73.x, 40.x]
aoi:
  kind: osm
  id: way/...
  marginM: 300
sourcePins:
  osm:
    - way/...
providerPolicy:
  terrain:
    - usgs_s1m
    - usgs_3dep_project_1m
  imagery:
    - naip_current
  context:
    - osm
    - overture_buildings
    - usgs_3dhp
```

3.2 Segment

A segment is a reusable physical hole sequence, usually 9 or 18 holes.

This matters most for properties with interchangeable nines.

Example:

```yaml
segments:
  marsh-nine:
    holes: [marsh-01, ..., marsh-09]
  ocean-nine:
    holes: [ocean-01, ..., ocean-09]
  nicklaus-nine:
    holes: [nicklaus-01, ..., nicklaus-09]
```

3.3 Layout

A layout is the product-facing played course.

```yaml
schema: golfhelm-layout-v1
layoutId: landfall-marsh-ocean
facilityId: landfall
name: Country Club of Landfall - Marsh/Ocean
segments:
  - marsh-nine
  - ocean-nine
holeOrder:
  - marsh-01
  - marsh-02
  # ...
  - ocean-09
externalBindings:
  golfCourseIds: []
```

This allows one physical hole to participate in multiple named 18-hole products without duplicating its terrain, imagery review, and geometry.

3.4 Scorecard profile

Do not make a new geometry layout just because the player chose a different tee color.

A scorecard profile owns:

• tee set,
• par,
• yardage,
• handicap index,
• official source,
• retrieved date.

The physical layout owns geometry.

Example:

```yaml
schema: golfhelm-scorecard-profile-v1
layoutId: cacapon
profileId: blue
source:
  provider: official_course_site
  retrievedAt: 2026-09-19
holes:
  - hole: 1
    par: 4
    yards: 401
```

3.5 Why this matters immediately

With this model:

• Bethpage imagery is acquired once.
• Bethpage terrain is acquired once.
• Bethpage’s 90 routes can be normalized once.
• Black’s route set is a layout selection problem, not a new data-acquisition problem.
• Landfall’s nines can be reviewed once each and composed into multiple 18-hole products.
• Bryan Park can share one orthophoto/DEM bundle while Champions and Players get separate route mappings.

────────

4. Replace “done/not done” with capability tiers

The current definition of done is too binary for a library.

A course can safely support some product capabilities before others.

Tier C0 — catalogued

The system knows:

• facility identity,
• layout identity,
• library row bindings,
• official scorecard source,
• source availability,
• route ambiguity,
• expected provider coverage.

No player geometry is served.

Tier C1 — visual candidate

Requirements:

• layout route identity resolved,
• source package reproducible,
• terrain available or explicitly absent,
• geometry topology valid,
• source provenance complete,
• no invented surfaces.

Permitted:

• internal lab,
• review screenshots,
• visual candidate preview.

Not permitted:

• authoritative lie classification,
• shot reconstruction based on surface boundaries,
• live tracking claims.

Tier C2 — visual production

Requirements:

• imagery review completed,
• gross geometry mismatches addressed,
• layout identity human-confirmed,
• context is acceptable for rendering,
• approved package hash.

Permitted:

• production course rendering,
• terrain views,
• visual shot display,
• clear uncertainty labels.

Still not permitted where evidence is insufficient:

• authoritative surface inference.

Tier C3 — tracking-safe

Requirements should be feature/capability specific rather than “every polygon perfect.”

At minimum:

• route ordering reviewed,
• played tee/landing/green corridor coverage reviewed,
• green boundaries reviewed,
• hazard/water boundaries used by classification reviewed,
• boundary uncertainty recorded,
• package passes metric truth gate for the features consumed by tracking.

Permitted:

• surface-aware shot placement,
• lie classification where source supports it,
• Meridian live geometry features.

Tier C4 — field-verified

Adds:

• course-familiar review or on-course walk,
• known remodel differences resolved,
• problematic boundaries measured or explicitly accepted,
• package signed as field-verified.

This is the highest confidence tier.

Why tiers are essential

If an on-course walk is required before anything can ship, scaling the library is dominated by physical travel.

Instead:

• C2 can ship a beautiful, provenance-honest course.
• C3 unlocks tracking capabilities.
• C4 represents the highest ground-truth standard.

The UI and algorithms gate by capability, not by a single status string.

────────

5. Schema v2: stop overloading reviewed

The current reviewed: boolean does too much work.

A canopy polygon can be valid decoration while being inappropriate as physical truth. An OSM green can be human-inspected but still carry several metres of boundary uncertainty. A traced bunker can be carefully reviewed yet still be derived from imagery.

Use independent axes.

5.1 Proposed feature contract

```ts
type EvidenceClass =
  | 'measured'
  | 'source_observed'
  | 'derived'
  | 'estimated'
  | 'visual_only';

type ReviewState =
  | 'unreviewed'
  | 'machine_checked'
  | 'human_accepted'
  | 'human_adjusted'
  | 'human_rejected';

type FeatureCapability =
  | 'render'
  | 'distance_reference'
  | 'surface_classification'
  | 'shot_reconstruction';

interface GeometryFeatureV2 {
  id: string;
  facilityId: string;
  layoutIds: string[];
  holeKeys: string[];
  kind: SurfaceKind | 'route';
  geometryWgs84: Geometry;
  provenance: {
    sourceArtifactIds: string[];
    derivation?: string;
    accuracyMeters?: number | null;
  };
  evidenceClass: EvidenceClass;
  review: {
    state: ReviewState;
    reviewer?: string;
    reviewedAt?: string;
    sourceEpoch?: string;
    uncertaintyMeters?: number | null;
    note?: string;
  };
  allowedCapabilities: FeatureCapability[];
}
```

5.2 Package v2

```ts
interface CourseGeometryPackageV2 {
  schemaVersion: 2;
  facilityId: string;
  layoutId: string;
  sourceBundleHash: string;
  reviewBundleHash: string;
  contentHash: string;
  originWgs84: PositionWgs84;
  projection: 'wgs84-local-enu-v1';
  capabilityTier: 'C1' | 'C2' | 'C3' | 'C4';
  features: GeometryFeatureV2[];
  holes: PhysicalHoleV2[];
  sourceArtifacts: SourceArtifactRef[];
}
```

The existing v1 parser can remain for Peek’n Peak while v2 lands behind a compatibility adapter.

────────

6. Source architecture: provider adapters instead of special-case fetchers

The current fetch scripts encode provider logic directly into course workflows. Scale that by introducing provider interfaces.

6.1 Common source artifact contract

Every provider returns the same metadata shape.

```json
{
  "schema": "golfhelm-source-artifact-v1",
  "id": "sha256:...",
  "provider": "usgs_s1m",
  "role": "terrain",
  "facilityId": "cacapon",
  "bboxWgs84": [-78.4, 39.4, -78.3, 39.5],
  "capturedAt": null,
  "publishedAt": "2026-...",
  "retrievedAt": "2026-09-19T...Z",
  "resolutionM": 1.0,
  "crs": "...",
  "sha256": "...",
  "bytes": 12345678,
  "licenseId": "public-domain",
  "locator": {
    "collection": "...",
    "item": "...",
    "asset": "..."
  },
  "validation": {
    "validPixelShare": 1.0,
    "nodataShare": 0.0,
    "status": "accepted"
  }
}
```

6.2 Terrain provider order

Use a provider chain, not if NC then ....

Recommended order:

```text
1. USGS Seamless 1 m DEM (S1M), when coverage exists
2. USGS project-based native 1 m 3DEP
3. state/local authoritative ~1 m terrain provider
   - NC OneMap DEM03 first adapter
4. national non-US provider
   - NRCan HRDEM for Canada
5. STOP
```

Do not silently fall to 10 m or 30 m for a product claiming Peek’n Peak-level terrain.

Why S1M should be first

USGS began producing the Seamless 1 m DEM in 2025. It is explicitly designed to merge project data into standardized 10 km x 10 km 1 m tiles and reduce project boundary gaps/slivers and datum inconsistencies.

This may remove some of the failure modes your current project-tile selector works around. Coverage is still in progress, so it is a preferred provider, not an assumption of universal availability.

NC change

Do not build “the NC adapter” as a permanent special case.

Build:

```python
class TerrainProvider(Protocol):
    def discover(aoi) -> list[TerrainCandidate]: ...
    def acquire(candidate, aoi) -> SourceArtifact: ...
    def validate(artifact) -> TerrainValidation: ...
```

Then implement:

```text
USGSS1MProvider
USGSProject1MProvider
NCOneMapDEM03Provider
NRCanHRDEMProvider
```

This makes Ontario a normal provider problem rather than a parked exception.

6.3 Imagery provider order

Recommended:

```text
1. most recent authoritative state/local orthophoto with derivative rights
2. USDA NAIP current service / downloadable source
3. older authoritative imagery for historical comparison only
4. STOP / mark stale
```

For North Carolina, 0.15 m orthophoto is extremely valuable for review and tracing when current enough.

NAIP remains an excellent national default because it is public-domain aerial imagery and typically 0.3–1.0 m resolution. The open AWS collection can be useful for bulk/cached access, but the factory should select the newest authoritative imagery source rather than hardcode one distribution channel. Your own Upper evidence already shows imagery dates newer than the range described by one AWS catalog snapshot.

6.4 OSM acquisition at library scale

For individual experiments, public Overpass is convenient.

For a maintained 52-facility library, use:

```text
regional OSM PBF snapshot
    -> local facility extract
    -> local golf/context tag filter
    -> retained facility source bundle
```

Recommended implementation:

1. download one dated regional/state PBF per needed region from Geofabrik;
2. hash and retain its snapshot metadata;
3. use osmium extract for facility AOIs;
4. use osmium tags-filter for golf/context subsets;
5. preserve OSM IDs and timestamps;
6. use Overpass only for a targeted refresh or a course where a newer OSM edit matters before the next regional snapshot.

Advantages:

• no 52-course rate-limit choreography,
• reproducible batch intake,
• one regional source snapshot can feed many facilities,
• easy OSM-diff reporting later,
• facility extraction becomes seconds and local.

6.5 Outside-world providers

Keep OSM as the semantic primary source, then allow explicit supplemental layers.

Overture buildings

Overture’s building theme can provide missing building footprints and height/level attributes where available. It is published as GeoParquet and can be bbox-extracted. It combines OSM with other open sources, so its licensing and attribution need to remain explicit.

Use it for:

• visual clubhouse/housing context,
• building footprints missing from local OSM,
• optional building heights where source metadata supports them.

Never let it silently overwrite a higher-priority OSM footprint.

USGS 3DHP

Use 3D Hydrography Program data as a supplementary water/stream context source in the United States.

It is useful for:

• streams,
• waterbody context,
• drainage-oriented terrain interpretation.

It must not automatically become a golf rules hazard. A stream is a physical water feature; “penalty area” remains a golf-course rules designation unless explicitly sourced.

6.6 Optional LiDAR point-cloud forensic mode

Do not add raw point-cloud processing to every course.

Add it as a forensic tool for:

• green-complex validation,
• bunker lip/depth studies,
• ambiguous earthwork,
• terrain anomalies.

PDAL already supports clipping, indexing, ground processing, raster generation, and large point collections. USGS also exposes 3DEP point-cloud access. This should be an escalation path, not the default course build.

────────

7. Use STAC ideas internally even when the provider is not STAC

Do not rebuild a custom metadata language for every raster provider.

Adopt the useful concepts of STAC:

• Item = one source artifact,
• Collection = provider/source family,
• geometry/bbox,
• datetime,
• assets,
• links,
• provider metadata.

You do not need to deploy a STAC server.

A static internal catalog is enough:

```text
src/test/fixtures/course-geometry/catalog/
  facilities/
  layouts/
  sources/
  builds/
```

This makes source discovery and provenance consistent while keeping the project local and simple.

────────

8. The Course Factory DAG

8.1 One command surface

Replace the mental model of a dozen scripts with a small number of commands.

```bash
npm run course:factory -- audit
npm run course:factory -- plan --layout=cacapon
npm run course:factory -- build --layout=cacapon --through=review-ready
npm run course:factory -- review-queue --layout=cacapon
npm run course:factory -- apply-review --layout=cacapon
npm run course:factory -- validate --layout=cacapon
npm run course:factory -- publish --layout=cacapon
npm run course:factory -- batch --wave=source-complete --jobs=3
```

The CLI can be TypeScript calling Python tools, or Python calling the Node compilers. The language is less important than the manifest model.

8.2 Task contract

Every task declares:

```ts
interface FactoryTask {
  id: string;
  version: string;
  inputs: ArtifactRef[];
  outputKinds: string[];
  fingerprint: string;
  scope: {
    facilityId: string;
    layoutId?: string;
    holeKeys?: string[];
  };
}
```

The fingerprint is SHA-256 over:

```text
task version
+ normalized configuration
+ input artifact hashes
+ relevant code version
```

If the fingerprint already exists and outputs verify, skip the task.

8.3 DAG

```text
CATALOG
  |
  +--> source discovery
  |       |
  |       +--> OSM facility snapshot
  |       +--> imagery bundle
  |       +--> terrain bundle
  |       +--> context supplements
  |
  +--> facility normalization
          |
          +--> route/layout resolver
          |       |
          |       +--> layout candidate package
          |
          +--> machine evidence
                  |
                  +--> imagery disagreement
                  +--> canopy candidate
                  +--> topology QA
                  +--> context classification
                  +--> source freshness
                  +--> review-risk score
                          |
                          +--> human review overlay
                                  |
                                  +--> canonical layout package
                                          |
                                          +--> per-hole terrain/scene
                                          +--> truth/capability gates
                                          +--> visual QA
                                          +--> publish
```

8.4 State store

Keep machine state out of Markdown.

Use a local SQLite database or generated DuckDB file:

```text
output/course-geometry/factory.db
```

Tables:

```text
facilities
layouts
source_artifacts
source_candidates
build_tasks
build_outputs
review_items
review_sessions
package_versions
published_versions
usage_snapshots
qa_runs
```

The source-of-truth configuration remains checked-in YAML/JSON manifests. The database is a query/index layer and build cache.

Useful queries:

```sql
-- What can ship next with < 60 min estimated review?
select ...

-- What layouts are blocked only on terrain?
select ...

-- Which approved packages use imagery older than 3 years?
select ...

-- Which facility source bundle feeds more than one layout?
select ...
```

────────

9. Stop repeatedly merging the package during intermediate stages

The current sequence repeatedly rebuilds the package after canopy/review and then recompiles downstream products.

Use immutable layers.

9.1 Base source layer

```text
facility-osm-base.json
```

Contains only normalized source-backed golf features and provenance.

9.2 Machine evidence layer

```text
facility-machine-evidence.json
```

Contains:

• canopy candidates,
• imagery segmentation candidates,
• unclaimed sand candidates,
• context classes,
• topology flags,
• feature imagery-agreement metrics.

Nothing here is authoritative.

9.3 Human review overlay

```text
layout-review-v3.json
```

Contains decisions against stable source/candidate feature IDs:

```json
{
  "featureId": "osm-way-123",
  "decision": "accept",
  "reviewedAgainst": ["naip:sha256:..."],
  "uncertaintyMeters": 2.5,
  "note": "Boundary matches current ortho"
}
```

or:

```json
{
  "featureId": "osm-way-456",
  "decision": "adjust",
  "replacementGeometryArtifact": "sha256:...",
  "basis": "state_ortho_2025",
  "accuracyMeters": 0.5
}
```

9.4 Canonical composition

Only the compose-layout-package task creates the canonical package:

```text
base source
+ selected layout routes
+ accepted machine candidates
+ human review overlay
+ scorecard profile
= package v2
```

This dramatically improves reasoning about hash changes.

────────

10. Build an impact graph so one edit does not rebuild 18 holes

Each feature already knows which holes it belongs to. Use that.

10.1 Impact rules

Examples:

```text
scorecard yardage change
  -> layout metadata
  -> distance QA
  -> no terrain rebuild

Hole 7 bunker geometry adjustment
  -> package hash changes
  -> Hole 7 semantic mesh / world
  -> Hole 7 visual canaries
  -> neighboring context only if overlap says so

facility imagery refresh
  -> imagery disagreement reports
  -> review queue
  -> no canonical package until approved changes exist

renderer code change
  -> visual artifacts / screenshots
  -> no source or package rebuild

context path geometry change on Holes 3 and 4
  -> structural terrain layer for 3/4
  -> scene 3/4
  -> canaries 3/4
```

10.2 Package hash versus sub-hashes

The package can retain an overall contentHash, but also record:

```json
{
  "holeHashes": {
    "01": "...",
    "02": "..."
  },
  "featureLayerHash": "...",
  "scorecardHash": "...",
  "reviewHash": "..."
}
```

Then the compiler can skip unchanged holes even when the top-level package hash changes.

────────

11. Split terrain truth from semantic rendering where practical

The current v4 terrain arrangement intentionally nodes material pieces together and uses context ribbons as breaklines. That is excellent for avoiding cracks and for visual fidelity.

At scale, distinguish three artifacts.

11.1 Base elevation field

Keyed only by:

• terrain source hash,
• clip extent,
• projection,
• grid/mesh compiler version.

It should not care whether a fairway polygon changed by 2 m.

11.2 Structural terrain mesh

Includes geometry that truly needs to influence triangulation:

• hard path/road ribbons,
• terrain discontinuity rules,
• selected bunker/green structural treatment if the renderer genuinely requires it.

11.3 Semantic drape layer

Fairway, green, rough, visual canopy, etc. can often be represented as surface overlays/material masks sampled against the same elevation field.

Do not rewrite the existing renderer immediately. First instrument the current v4 compiler to measure where semantic edits actually force expensive re-triangulation. Then decide which layers can safely separate.

The goal is:

> **A color/material boundary edit should not automatically invalidate the expensive metric terrain unless its geometry affects the physical mesh.**

────────

12. Automate Stage 0 instead of accepting 30–60 minutes forever

Stage 0 should become a resolver with human confirmation.

12.1 Scorecard ingestion

Create:

```text
fetch-scorecard-source
parse-scorecard
confirm-scorecard
```

Retain:

• official source URL,
• retrieval time,
• extracted hole table,
• extraction method,
• source hash or source snapshot metadata when permitted,
• confirmation state.

The human should confirm an 18-row table, not manually type it from scratch.

12.2 Route resolver

Use an assignment model to rank route-to-hole mappings.

For route candidate r and official hole h:

```text
cost(r, h) =
    wy * normalized_length_error
  + wo * order_continuity_penalty
  + wn * number/name_penalty
  + wg * green_endpoint_penalty
  + wt * tee_endpoint_penalty
  + wx * cross-layout_penalty
```

Then solve the minimum-cost one-to-one assignment for a candidate route set.

For a resort with multiple courses, first cluster route candidates by:

• spatial adjacency,
• shared tee/green neighborhoods,
• route numbering/name tags,
• path continuity,
• official layout yardage fit.

The output is not truth. It is a ranked suggestion:

```text
Candidate A: 97.4% route identity fit
Candidate B: 82.1%
Candidate C: 61.3%
```

The reviewer confirms the correct one.

This turns Big Blue, Bethpage, PGA National, Pine Lakes, TPC Sawgrass, and Shenandoah from hand-assembly exercises into confirmation tasks.

12.3 Shared-green resolver

Automatically flag:

• one green assigned to two route endpoints,
• route endpoint > threshold from assigned green,
• missing green,
• practice green inside corridor,
• green with implausible route ownership.

Cacapon 4/8 becomes a first-class review item rather than a note buried in a plan.

────────

13. Human review should be a queue, not a 3-hour contact sheet ritual

The largest opportunity is the review UX.

13.1 Build a review-risk score

Do not use a score to claim truth.

Use it only to decide what the human sees first.

For feature f:

```text
risk(f) =
    importance_weight(kind)
  * source_uncertainty
  * imagery_disagreement
  * freshness_penalty
  * topology_penalty
  * association_ambiguity
  * source_conflict_penalty
```

Suggested importance multipliers:

```text
green      3.0
tee        2.2
water      2.2
bunker     1.8
fairway    1.5
route      3.0
path       1.0
woods      0.5
building   0.4
```

Again: these are review-priority weights, not accuracy scores.

13.2 Mandatory review items

Always show:

• 18 route identities,
• greens,
• missing/partial fairways,
• shared greens,
• tees if used for tracking,
• hazards used by classification,
• all features with imagery disagreement above threshold,
• all topology errors,
• all features sourced from stale imagery after known renovation,
• all manual traces.

13.3 Low-risk bulk confirmation

A reviewer should be able to inspect a screen like:

```text
CACAPON — 151 source features

Mandatory:            31
High risk:             12
Medium risk:           18
Low risk:              90

[A] Accept displayed feature
[E] Edit in QGIS
[R] Reject
[D] Defer
[Shift+A] Accept visible low-risk group
```

Bulk acceptance still records a human decision and the evidence viewed.

13.4 QGIS only when geometry needs editing

Use the browser/local review console for triage and acceptance.

Open QGIS for:

• boundary adjustment,
• complex shared features,
• manual tracing,
• topology repair,
• derived terrain zones.

QGIS’s geometry and topology checkers can enforce rules such as gaps, overlaps, duplicates, line intersections, and coverage relationships.

13.5 AI-assisted tracing: candidate only

For courses with incomplete OSM, add an optional local segmentation step using retained orthophoto.

Tools such as SAM2/SamGeo can produce georeferenced raster/vector segmentation candidates from point/box prompts.

Use cases:

• bunker candidate outline,
• green candidate outline,
• fairway corridor candidate,
• water candidate,
• tree-mass candidate.

Hard rule:

```text
AI mask -> machine_candidate -> human review -> accepted derived geometry
```

Never:

```text
AI mask -> reviewed truth
```

This is especially valuable for:

• Cardinal,
• Magnolia Greens,
• Forest Creek,
• Cape Fear,
• Landfall,
• River Landing,
• other OSM-poor facilities.

It means Helm does not have to wait for the public OSM database to become complete before creating a reviewable internal geometry package.

────────

14. Review only changed source data after initial approval

Scaling is not just initial build. It is maintenance.

14.1 OSM refresh

Do not automatically replace an approved package because OSM changed.

New snapshot flow:

```text
old retained OSM
      vs
new retained OSM
      |
      +--> source diff
             |
             +--> changed relevant features only
                     |
                     +--> review queue
```

Report:

• added features,
• deleted features,
• geometry-shift distance,
• tag changes,
• route reassignment impacts,
• holes affected.

14.2 Imagery refresh

When a newer orthophoto appears:

1. keep the approved geometry;
2. run imagery-agreement metrics against the new raster;
3. run image-change detection around greens/bunkers/tees;
4. flag only meaningful differences;
5. require review before changing geometry.

This is how renovation detection becomes sustainable.

14.3 Terrain refresh

Terrain should update far less often.

Trigger only when:

• a better approved terrain source appears,
• the facility underwent earthwork significant enough to matter,
• a known acquisition defect is fixed.

────────

15. Replace 132 screenshots per change with a QA pyramid

Level Q0 — structural checks on every task

Fast, no browser:

• schema validation,
• hashes,
• CRS,
• topology,
• route association,
• DEM nodata,
• T-junction count,
• source completeness,
• feature capability gates.

Level Q1 — affected-hole render checks

For ordinary course-data changes:

```text
changed hole(s)
+ one adjacent hole
x Terrain + Green
x phone + desktop
```

If a bunker changed, include Side view.

Level Q2 — new-course sign-off

For first publication of a layout:

• full 18-hole player matrix,
• selected lab views across representative holes,
• one full play-through smoke,
• draw-call/triangle budgets,
• page-error gate.

No need for 96 lab captures if a smaller set exercises the risk classes.

Suggested hole selection algorithm:

```text
choose one hole per archetype:
- highest elevation delta
- highest bunker count
- highest water share
- highest canopy share
- highest context uncertainty
- largest triangle count
- most complex green
- worst source completeness
```

That naturally produces approximately eight canary holes while being data-driven.

Level Q3 — renderer/system change

When the renderer, terrain compiler, materials, camera, or interaction system changes:

• run the cross-library reference suite,
• include representative holes from multiple courses,
• optionally run full 96-capture matrices on the golden reference course.

Level Q4 — release soak

Before a large library release:

• one player smoke per published layout,
• verify manifest/cache behavior,
• verify offline first-hole/next-hole loading,
• verify no unlisted layout requests geometry,
• verify analytics/errors.

Baseline keys

Visual baselines should be keyed by:

```text
rendererVersion
layoutId
packageHash
viewport
preset
```

A package change should never accidentally diff against a screenshot from another geometry hash and be interpreted as a renderer regression.

────────

16. Runtime app architecture: registry, not policy singleton

16.1 New registry contract

Replace the Peek’n Peak-specific policy type with a generic course policy.

```ts
interface CourseGeometryPolicy {
  layoutId: string;
  facilityId: string;
  siteIds: readonly string[];
  projection: 'wgs84-local-enu-v1';
  geometryFeatureFlag: string;
  syncFeatureFlag?: string;
  approvedGeometryHashes: ReadonlySet<string>;
  acceptedCapabilityTier: 'C2' | 'C3' | 'C4';
  pilotAcceptsSourceCandidate?: boolean;
  dbCourseIds: ReadonlySet<string>;
  courseNamePatterns: readonly RegExp[];
  renderWorld: 'v1' | 'v2';
}
```

Then:

```ts
export const COURSE_GEOMETRY_REGISTRY: readonly CourseGeometryPolicy[] = [
  peekNPeakUpper,
  cacapon,
  winchester,
];
```

16.2 Resolver

```ts
resolveCourseGeometryPolicy(round): CourseGeometryPolicy | null
```

Resolution order:

1. exact dbCourseId,
2. stable external binding,
3. explicit fallback name matcher,
4. null.

Name regex should be an interim fallback, not the long-term identity mechanism.

16.3 Uncouple assets from policy module

course-assets.ts should depend on a generic CourseGeometryPolicy interface, not import the Peek’n Peak singleton.

publish-course-assets.mts should resolve layout metadata from the registry/catalog, not call courseIdForSite from the pilot policy.

16.4 Capability-aware eligibility

Instead of only:

```text
approved hash?
source candidate allowed?
flag on?
location available?
```

add:

```text
required capability available?
```

Example:

```ts
isCourseCapabilityEligible({
  policy,
  pkg,
  capability: 'surface_classification'
})
```

A C2 course can render without pretending it is C3.

────────

17. Publishing architecture: manifests in Git, large immutable assets in object storage

17.1 What stays in Git

Commit:

• facility/layout manifests,
• scorecard structured facts,
• source metadata manifests,
• small vector packages,
• review overlays,
• QA summaries,
• golden fixtures,
• public pointer manifest if desired.

Do not commit the complete production terrain library under public/.

17.2 What moves to asset storage

Store:

• per-hole terrain,
• GLB/visual artifacts,
• large context payloads,
• optionally review orthophoto clips if licensing/storage policy allows.

Every object is content addressed:

```text
course-geometry/
  objects/
    sha256/<hash>
  layouts/
    cacapon/
      manifest-v3.json
```

17.3 Manifest

```json
{
  "schema": "golfhelm-course-manifest-v2",
  "layoutId": "cacapon",
  "geometryVersion": "sha256:...",
  "capabilityTier": "C3",
  "package": {
    "url": ".../sha256/...",
    "sha256": "...",
    "bytes": 123456
  },
  "holes": {
    "01": {
      "terrain": {"url": "...", "sha256": "...", "bytes": 1234567},
      "visual": {"url": "...", "sha256": "..."}
    }
  }
}
```

17.4 Storage provider abstraction

Do not hardwire the runtime to one vendor.

```ts
interface CourseAssetPublisher {
  putImmutable(hash: string, bytes: Uint8Array): Promise<AssetUrl>;
  putManifest(layoutId: string, manifest: Manifest): Promise<void>;
}
```

Initial implementations can be:

• current public/ publisher for the pilot,
• Vercel Blob,
• Supabase Storage,
• another S3-compatible store later.

This lets the migration happen without blocking Cacapon.

17.5 Binary terrain payload

The current JSON mesh format is transparent and test-friendly. Keep it as a compiler/test representation.

For production transport, benchmark a binary asset.

Preferred experiment:

```text
TerrainMesh JSON
   -> GLB / typed binary
   -> meshopt compression
   -> CDN
```

Three.js supports meshopt-compressed glTF through GLTFLoader with MeshoptDecoder, and meshoptimizer/gltfpack can quantize and compress geometry.

Do not change format blindly. Run an A/B benchmark on Upper and Cacapon measuring:

• compressed transfer bytes,
• decode time on iPhone-class device,
• peak memory,
• time to first terrain,
• renderer compatibility,
• exact metric round-trip tolerance.

Only adopt it if metric fidelity and load latency are better.

────────

18. Disk strategy

The current estimate of 0.3–0.6 GB/course means a local 52-course working set could reach roughly 15–31 GB, before other repo/build data.

The factory should have storage classes.

Class A — must remain in repo

Small:

• manifests,
• normalized vectors,
• review overlays,
• test fixtures,
• source hashes,
• build summaries.

Class B — local reproducible cache

Evictable:

• terrain raster clips,
• imagery clips,
• generated meshes,
• browser captures,
• contact sheets.

Store under:

```text
~/.cache/golfhelm/course-geometry/
```

or an ignored project cache.

Use content-addressed objects so two layouts sharing one facility do not duplicate bytes.

Class C — production immutable objects

Remote object store/CDN.

Raster retention change

Retain the exact course/facility crop bytes used by the compiler, not an unnecessarily huge provider tile, provided the manifest also records the original provider asset identity and exact crop transform.

For reproducibility the canonical evidence is then:

```text
provider item identity
+ crop window
+ crop bytes hash
+ crop file
```

This keeps “fetched once and reproducible” without spending hundreds of MB on irrelevant raster outside the facility.

────────

19. Library prioritization should be value / effort, not a static wave list

The current wave list is useful, but it will become stale.

Calculate priority on every audit.

19.1 Suggested model

```text
usage_value = log(1 + completed_rounds_90d)

readiness =
    route_completeness
  * golf_surface_completeness
  * terrain_provider_availability
  * imagery_currency_factor

business_weight = configurable 0.5 .. 2.0

estimated_review_hours = model from:
    bunker_count
  + route_ambiguity
  + missing_feature_count
  + imagery_age
  + multi_layout_complexity
  + prior review throughput

priority =
  usage_value * readiness * business_weight
  -----------------------------------------
           0.5 + estimated_review_hours
```

Do not treat the numeric value as a product-quality score. It is scheduling only.

19.2 Practical first queue

A sensible first production queue remains close to your current usage list, but with enabling work inserted strategically.

Factory proving set

1. Peek’n Peak Upper — reference/golden course.
2. Cacapon — prove migration of an old course into the factory.
3. Winchester — prove a second clean independent facility.

Then prove multi-layout and provider abstraction

4. UK facility — prove one facility -> multiple layouts.
5. Starmount or another clean NC course — prove state terrain provider fallback if S1M is absent.
6. Bryan Park — prove one facility -> two layouts + incomplete/mixed source geometry.

Then prove difficult archetypes

7. Grande Dunes / Kiawah / Savannah Harbor — water/coastal context.
8. Bethpage — large multi-course source bundle.
9. Whistling Straits — extreme bunker-review scaling.
10. Landfall — reusable nine composition + mapping-from-zero workflow.

That sequence validates the factory itself instead of just maximizing short-term course count.

────────

20. Revised handling of the current waves

Existing Wave 0 — Peek’n Peak

Keep as the golden reference.

Do not make it the template where every future course has to inherit every manual artifact.

Use it for:

• renderer baseline,
• schema v1 -> v2 compatibility,
• capability-gate comparison,
• factory regression suite.

Existing Wave 1 — Cacapon

Cacapon becomes the factory migration proof.

Desired outcome:

```text
old Cacapon artifacts
     -> inventory/import
     -> facility manifest
     -> layout manifest
     -> new source bundle
     -> risk-ranked review
     -> v2 package
     -> v4 terrain
     -> published object manifest
```

The goal is not merely “Cacapon works.”

The goal is:

> after Cacapon, adding Winchester requires data, not new architecture.

Existing Wave 2 — Winchester

Use Winchester as the first truly boring course.

A clean course should prove the happy path can be almost unattended.

Target:

```text
course:factory plan --layout=winchester
course:factory build --layout=winchester --through=review-ready
course:factory review-queue --layout=winchester
# human reviews only flagged + mandatory items
course:factory publish --layout=winchester
```

If Winchester still requires a dozen manual commands, the factory is not done.

Existing Wave 3 — source-complete

Do not manually schedule all 24.

Run the scheduler and group by facility/source region.

Example batch:

```text
Virginia regional OSM snapshot
  -> Winchester
  -> Blue Ridge Shadows
  -> Golden Horseshoe
  -> Shenandoah

Florida regional snapshot
  -> PGA National
  -> Isleworth
  -> Sawgrass CC
  -> TPC Sawgrass
  -> World Golf Village
```

Acquisition and normalization can run per region/facility, while expensive per-layout review remains queued.

Existing Wave 4 — no 1 m 3DEP

Rename this from “NC adapter wave” to terrain-provider fallback wave.

For every facility:

```text
try S1M
try project 1m
try registered regional provider
otherwise block
```

This is where:

• NC OneMap adapter,
• NRCan HRDEM adapter,
• future state/provider adapters

belong.

Existing Wave 5 — mapping first

Split into two subtypes.

M1 — orthophoto-traceable

Good imagery exists, OSM is poor.

Use:

• AI-assisted candidate segmentation if useful,
• manual/QGIS trace,
• explicit source/accuracy,
• human review.

There is no requirement that the app wait for OSM contributors to add the features first.

M2 — source-insufficient

No sufficiently current/legal imagery or identity is available.

Keep blocked.

Do not lower standards to hit a course-count goal.

────────

21. Special outlier strategies

21.1 Whistling Straits: 1,384 bunkers

Do not put 1,384 polygons into a linear human checklist.

Create bunker clusters by:

• hole ownership,
• spatial adjacency,
• connected/near-connected sand complexes,
• imagery agreement.

Review group example:

```text
Hole 8 bunker cluster A
- 17 OSM polygons
- combined inside-sand agreement 91%
- 1 suspicious polygon
- 0 unclaimed sand blobs
```

Reviewer accepts the cluster or expands exceptions.

This is the archetype that should drive batch-review UX.

21.2 Bethpage: five courses in one polygon

Facility normalize once.

Do not attach all 90 routes to every layout package.

Resolve route sets into layout manifests and generate layout packages from the facility graph.

21.3 Landfall: five combinations from reusable nines

Do not map 45 “holes” if the facility physically has fewer reusable holes arranged into nines.

Model nines as segments and compose the played 18-hole layouts.

21.4 Cardinal / Forest Creek / incomplete OSM

Treat OSM as one evidence source, not a gatekeeper.

A human-reviewed trace from a permitted high-resolution orthophoto can become a derived reviewed boundary with explicit accuracy. Keep its provenance distinct from OSM.

21.5 Renovated courses

Add a knownRenovationAfter date to the facility/layout manifest.

Any imagery captured before that date automatically receives a freshness failure for changed-surface review.

────────

22. Review quality metrics

You cannot improve the human bottleneck if you do not measure it.

For every review session record:

```text
layoutId
reviewer
startedAt
endedAt
itemsViewed
itemsAccepted
itemsAdjusted
itemsRejected
itemsDeferred
qgisEdits
featureKinds
riskBuckets
```

Derived metrics:

```text
minutes / course
minutes / flagged feature
% machine flags that caused an edit
% low-risk features accepted unchanged
false-negative discoveries during full review
re-review rate after publish
```

After 5–10 courses, tune risk thresholds from actual evidence.

Example:

If 98% of low-risk bunkers are accepted unchanged but 40% of medium-risk bunkers need adjustment, push the reviewer directly to medium/high and sample low-risk features rather than viewing all of them individually.

────────

23. Source confidence is not one number

Avoid creating a seductive but misleading “accuracy 92%” score.

Represent a vector.

Per hole:

```json
{
  "routeIdentity": "confirmed",
  "terrain": {
    "provider": "usgs_s1m",
    "resolutionM": 1,
    "nodataShare": 0
  },
  "surfaces": {
    "green": {"coverage": 1, "review": "human_accepted"},
    "fairway": {"coverage": 1, "review": "human_accepted"},
    "bunker": {"coverage": 0.96, "review": "mixed"}
  },
  "imagery": {
    "ageDays": 410,
    "knownRenovationConflict": false
  },
  "context": {
    "uncertainShare": 0.08
  }
}
```

Use a scalar only for queue ordering.

────────

24. Visual fidelity scale-out

The library pipeline should not just replicate geometry. It should also make Meridian visual quality reusable.

24.1 Facility-level visual archetype inputs

Derive reusable descriptors:

```text
canopy density
open-land share
water share
bunker density
terrain ruggedness
building density
coastal/marsh context
```

These do not change physical truth. They choose visual-system parameters within approved bounds.

Example:

```text
Whistling Straits -> sparse trees, extreme sand complexity, exposed terrain
Kiawah Ocean     -> dunes/marsh visual archetype
Cacapon          -> wooded mountain course
TPC Sawgrass     -> water-heavy managed landscape
```

The visual system then uses one renderer with data-driven parameters rather than per-course bespoke styling.

24.2 No custom art pass per course

If a course requires hand-tuned renderer code, treat that as a renderer deficiency.

Course-specific data is allowed.

Course-specific renderer branches should be nearly forbidden.

────────

25. Observability

Every factory build should emit one compact machine-readable report.

```json
{
  "layoutId": "cacapon",
  "buildId": "...",
  "sourceBundleHash": "...",
  "packageHash": "...",
  "tasks": {
    "source.osm": "cache_hit",
    "source.terrain": "cache_hit",
    "layout.resolve": "ran",
    "imagery.review": "ran",
    "terrain.hole07": "ran",
    "terrain.hole08": "cache_hit"
  },
  "review": {
    "mandatory": 31,
    "high": 12,
    "medium": 18,
    "low": 90
  },
  "capabilities": {
    "render": true,
    "surfaceClassification": false,
    "fieldVerified": false
  },
  "qa": {
    "errors": 0,
    "warnings": 3
  }
}
```

Then build a library dashboard from these reports.

────────

26. Library dashboard

A single local page should answer:

```text
52 facilities
64 library rows
31 layouts resolved
18 C2 visual-production
8 C3 tracking-safe
1 C4 field-verified

Blocked by:
- layout identity: 7
- missing golf geometry: 11
- terrain: 4
- stale imagery: 3
- human review: 12
- publish approval: 5
```

Per layout show:

• usage,
• capability tier,
• next blocker,
• estimated reviewer minutes,
• imagery date,
• terrain source,
• geometry completeness,
• last approved hash,
• current source-diff state,
• published version.

This should replace the giant narrative status document as the operational source of truth.

Markdown remains useful for architecture and exceptions, not for tracking 52 pipelines manually.

────────

27. Feature flags

Use one global feature flag plus a server-side/layout allow-list, not one generated flag per course.

Recommended:

```text
course_geometry_v2
course_geometry_sync_v2
```

Then configuration:

```yaml
courseGeometry:
  enabledLayouts:
    - peek-n-peak-upper
    - cacapon
    - winchester
```

Why:

• 50+ flags are operational noise;
• course approval already requires an approved hash;
• the allow-list is the right rollout dimension;
• a global kill switch remains available.

If the existing flag system strongly prefers row-per-course evaluation, generate the rows from the same registry rather than hand-authoring them.

────────

28. Suggested directory layout

```text
course-geometry/
  catalog/
    facilities/
      cacapon.yml
      bethpage-state-park.yml
    layouts/
      cacapon.yml
      bethpage-black.yml
    scorecards/
      cacapon-blue.json
  reviews/
    cacapon/
      review-v1.json
  source-manifests/
    <artifact-hash>.json

src/test/fixtures/course-geometry/
  golden/
    peek-n-peak-upper/
  packages/
    cacapon/<hash>.json
  review-samples/
  qa-samples/

output/course-geometry/
  factory.db
  cache/
  builds/
    <build-id>/
  reviews/
  screenshots/
```

Production asset payloads should not need to live permanently in this tree once object publishing lands.

────────

29. Implementation sequence

The architecture should be delivered in narrow slices so the current pilot remains working.

Phase A — make the current system multi-course without changing geometry semantics

A1. Generic policy registry

Create:

```text
src/lib/golf/course-geometry/course-policy.ts
src/lib/golf/course-geometry/course-registry.ts
```

Migrate:

• productCourseIdForRound -> generic resolver,
• courseIdForSite -> registry lookup,
• asset loaders -> generic policy,
• publish script -> registry/catalog lookup.

Compatibility:

```text
PEEK_N_PEAK_ONE_TAP_V1
```

can re-export the Peek’n Peak entry during migration.

A2. Facility/layout manifests

Implement v1 manifest schemas before touching build automation.

Migrate Upper and Cacapon into them.

A3. Capability gates

Add capability tier metadata without changing current player behavior.

Upper can preserve its pilot exception exactly as-is.

────────

Phase B — source provider abstraction

B1. Common SourceArtifact

Normalize existing manifests into one contract.

B2. Terrain providers

Implement in order:

```text
USGS S1M
existing USGS project 1m
NC OneMap DEM03
NRCan HRDEM
```

B3. OSM regional snapshot adapter

Add:

```text
fetch-region-osm
extract-facility-osm
```

Keep current Overpass acquisition as fallback and test oracle until the local path is proven.

B4. Imagery provider abstraction

Wrap current NAIP and NC ortho behavior under one interface.

────────

Phase C — factory state and DAG

C1. Factory database

Create SQLite schema and artifact index.

C2. Task fingerprints

Wrap existing scripts as tasks before rewriting their internals.

Example:

```text
Existing prepare-osm-course.py
```

becomes the implementation of:

```text
normalize-layout-source@v1
```

C3. course:factory plan

Must print:

```text
cache hit / run / blocked
```

for every task before execution.

C4. Batch mode

Concurrency rules:

• network providers respect provider rate limits;
• CPU compilers may run in parallel;
• Playwright captures use controlled concurrency;
• disk guard enforced centrally.

────────

Phase D — Cacapon migration

Do not write a generic factory in isolation for a week.

Build it through Cacapon.

Required proof:

1. imports old Cacapon facts;
2. writes facility/layout manifests;
3. retains current OSM source snapshot path;
4. compiles v4 terrain;
5. generates review queue;
6. produces package v2;
7. passes capability gates;
8. publishes through generic asset publisher;
9. resolves in generic app registry.

Once Cacapon works, delete any factory special-cases that mention cacapon.

────────

Phase E — Winchester happy-path proof

Winchester should require no architecture changes.

If a new generic subsystem is needed for Winchester, add it, then run Cacapon again.

Success criterion:

> a source-complete ordinary course goes from manifest to review-ready with one command.

────────

Phase F — review acceleration

F1. Risk scorer

Implement deterministic review ranking.

F2. Browser review console

Read-only overlay + accept/reject/defer.

F3. QGIS deep link/export

Open only geometry-edit items in the review kit.

F4. Optional SamGeo/SAM candidate tool

Prototype on one incomplete course.

Do not make ML tooling a blocker for factory launch.

────────

Phase G — object publishing and transport optimization

G1. Publisher interface

Keep public/ publisher as one implementation.

G2. Remote object publisher

Use the existing infrastructure choice that best fits deployment/account constraints.

G3. Binary terrain benchmark

Upper + Cacapon A/B.

No migration until the metric fidelity test and mobile performance test pass.

────────

Phase H — difficult archetypes

Use the factory against:

• multi-layout resort,
• state terrain fallback,
• incomplete OSM,
• coastal/marsh,
• extreme bunker count,
• reusable nines.

Every outlier should improve the generic system rather than add a course-specific path.

────────

30. Revised per-course workflow

After the factory exists, an ordinary course should look like this.

Step 1 — add/confirm catalog entry

```bash
npm run course:factory -- intake --layout=winchester
```

Output:

```text
facility matched
layout candidate found
official scorecard parsed
18/18 routes proposed
terrain provider: S1M
imagery provider: NAIP 2025
human confirmations required: 2
```

Step 2 — confirm identity

Human confirms:

• facility,
• layout,
• scorecard,
• route set.

Step 3 — build to review-ready

```bash
npm run course:factory -- build --layout=winchester --through=review-ready
```

Machine does:

• local OSM extraction,
• source normalization,
• terrain acquisition,
• imagery acquisition,
• canopy candidate,
• imagery mismatch,
• context,
• topology,
• review-risk queue.

Step 4 — review exceptions

```bash
npm run course:factory -- review --layout=winchester
```

Reviewer sees:

```text
18 mandatory route/green checks
6 high-risk features
11 medium-risk
124 low-risk
```

They spend time where evidence says time is needed.

Step 5 — compose canonical package

```bash
npm run course:factory -- apply-review --layout=winchester
```

Produces new immutable review hash and package hash.

Step 6 — incremental compile

```bash
npm run course:factory -- build --layout=winchester --through=publish-ready
```

Only impacted holes run.

Step 7 — sign off

The QA planner decides whether this needs:

• affected-hole QA,
• first-release full course QA,
• renderer-wide QA.

Step 8 — publish

```bash
npm run course:factory -- publish --layout=winchester
```

Publisher uploads immutable objects, writes layout manifest, and updates the course registry allow-list in the PR.

────────

31. Exact Cacapon factory acceptance test

Cacapon should prove all of these.

Catalog

☐ facilityId=cacapon-state-park
☐ layoutId=cacapon
☐ current official scorecard represented as structured profile
☐ all 18 route IDs confirmed
☐ shared green 4/8 explicitly resolved

Sources

☐ new common OSM artifact manifest
☐ terrain provider selected through generic provider API
☐ imagery provider selected through generic provider API
☐ existing old evidence inventoried but not silently reused

Geometry

☐ v2 package generated from source + review overlay
☐ no old prepare-pilot.py path in the canonical build
☐ hole sub-hashes generated

Terrain

☐ v4 compile
☐ 0 T-junctions
☐ only impacted holes rebuild on a synthetic one-hole geometry edit test

Review

☐ risk-ranked queue
☐ bunker clusters supported
☐ sidecar decision records evidence hash
☐ QGIS adjustment round trip works

QA

☐ data-driven canary holes selected
☐ full 18-hole player matrix for first release
☐ 0 page errors
☐ budgets enforced

Runtime

☐ generic policy registry resolves Cacapon
☐ non-Cacapon course makes 0 geometry requests
☐ approved hash enforced
☐ capability tier enforced
☐ offline cache works per layout

Publish

☐ generic publisher
☐ immutable asset URLs
☐ manifest hash verification
☐ rollback by manifest/allow-list change

────────

32. CI strategy

Do not run every course in every PR.

Code-only / unrelated PR

No course factory.

Course manifest/source PR

Run:

• schema,
• changed layouts,
• changed source/artifact integrity,
• affected-hole compiler tests,
• affected-hole browser QA.

Renderer/compiler PR

Run:

• golden Upper,
• Cacapon,
• one water-heavy,
• one high-canopy,
• one high-bunker,
• one multi-layout fixture.

Scheduled full audit

Nightly or weekly:

• library manifest integrity,
• source availability check without replacing retained assets,
• published-manifest HEAD check,
• cache/payload budget report,
• source freshness report.

Do not automatically approve or publish source changes from scheduled jobs.

────────

33. Cost and infrastructure posture

The factory should be usable locally with almost no new paid infrastructure.

Local / build

Free/open-source stack remains:

• Python,
• GDAL,
• Shapely,
• pyproj,
• SciPy,
• QGIS,
• Node/tsx,
• Playwright,
• osmium,
• optional DuckDB spatial,
• optional SamGeo/SAM2.

Production assets

A full library should not depend on free static deployment space forever.

Design for object storage with a cheap CDN path. Keep the publisher pluggable so cost/provider choice is operational rather than architectural.

Source acquisition

Prefer public/open authoritative datasets.

Point-cloud bulk access that incurs requester-pays charges should be optional forensic work, not part of normal course ingestion.

────────

34. Research-backed additions worth implementing

34.1 USGS S1M support

High value because it directly attacks project-boundary and coverage complexity.

34.2 NRCan HRDEM provider

High value because it turns Ontario from a hard-coded exception into a normal provider fallback. HRDEM is 1–2 m and can include terrain models from LiDAR-derived projects.

34.3 Regional OSM PBF cache

High value because it removes public Overpass reliability/rate constraints from batch scale.

34.4 Overture building supplement

Medium value. It can improve outside-world visual context and supply footprints/height metadata where OSM is sparse.

Do not block the factory on it.

34.5 3DHP context supplement

Medium value for streams/water context. Keep golf hazard semantics separate.

34.6 SamGeo-assisted review candidates

Potentially very high value for OSM-poor courses, but validate on 2–3 facilities before building a large workflow around it.

34.7 Binary / meshopt transport

High value when the published library grows. Benchmark rather than assume.

────────

35. Things I would remove or demote from the original plan

Remove as the main architecture

```text
build-course.sh <slug>
```

Keep it only as a thin compatibility wrapper around the factory if desired.

Demote

Per-course flag rows

Use global flag + allow-list / registry where possible.

Full visual matrix on every change

Use first-release/full-renderer cases only.

Course-by-course Overpass fetching

Keep fallback, not library backbone.

NC-specific terrain architecture

Replace with generic provider selection.

public/ as permanent course library

Keep for pilot/golden fixtures only.

Manual scorecard transcription

Replace with parse + confirm.

Manual route pinning as default

Replace with candidate assignment + confirm.

“Every course must receive a truth walk before useful production rendering”

Replace with capability tiers. Only enable the algorithms supported by the evidence.

────────

36. Non-negotiables for the factory

1. No silent fallback to worse source resolution.
2. No machine candidate is promoted to truth without the required review state.
3. No source refresh replaces an approved package without a diff and review.
4. No course-specific renderer fork to hide bad source data.
5. No name regex as the permanent primary course identity.
6. No full-library rebuild because one hole changed.
7. No duplicate facility raster acquisition for multiple layouts.
8. No production asset URL that can mutate under the same content hash.
9. No capability can consume a feature that is not approved for that capability.
10. No giant operational Markdown file as the only source of library status.

────────

37. Definition of success

The factory is ready to scale when all statements below are true.

Adding a normal source-complete course

Requires:

• one layout/catalog entry,
• human confirmation of identity,
• one factory build command,
• one risk-ranked review session,
• one publish command.

It does not require:

• a new fetch script,
• a new app policy file,
• a new terrain code path,
• a new visual test script,
• hand-written hash plumbing,
• dozens of manual shell commands.

Multi-layout facility

Acquires heavy source data once.

One-hole review edit

Rebuilds that hole and genuinely dependent artifacts, not the whole course.

Source refresh

Creates a diff queue, not an automatic package mutation.

Runtime

An unlisted layout makes zero geometry requests.

An approved C2 layout can render.

A C3-only feature cannot run on C2 evidence.

Operations

The library dashboard can answer “what is blocked and why?” without opening a 1,000-line planning document.

────────

38. Recommended first PR breakdown

Do not put the entire factory into one enormous PR.

PR A — registry + schema foundation

• generic CourseGeometryPolicy,
• registry,
• generic resolver,
• remove Peek’n Peak imports from generic asset functions,
• facility/layout manifest schemas,
• Upper fixtures migrated,
• no behavior change.

PR B — provider framework

• SourceArtifact,
• terrain provider protocol,
• current 3DEP adapter wrapped,
• S1M adapter,
• NC OneMap adapter,
• NRCan adapter skeleton or implementation,
• source validation tests.

PR C — factory DAG + state

• factory DB,
• task fingerprinting,
• plan, build, status,
• wrap existing scripts,
• Cacapon build path.

PR D — review queue

• risk scoring,
• review manifest,
• browser queue,
• QGIS adjustment compatibility,
• Cacapon human pass.

PR E — incremental compile + QA planner

• hole sub-hashes,
• impact analysis,
• changed-hole compile,
• data-driven canaries,
• first-release matrix.

PR F — publisher abstraction

• current public publisher retained,
• object publisher added,
• generic manifest URLs,
• runtime asset loader supports either.

PR G — Winchester + one multi-layout facility

This is the proof that the architecture scales.

────────

39. The new owner decision list

The original plan asks the owner to decide too many implementation details course by course.

The revised decisions are smaller and more durable.

Architecture decisions

1. Approve facility/layout/segment as the domain model.
2. Approve capability tiers C0–C4.
3. Approve generic provider chain with S1M first, project 1 m second, regional providers after.
4. Approve regional OSM snapshot ingestion for batch scale.
5. Approve global flag + layout allow-list rather than one hand-authored flag per course.
6. Approve moving large production course assets out of the application source tree as the library grows.

Product policy decisions

7. What capabilities require C3 versus C4?
8. Is C2 rendering acceptable for a course that has not received a field walk, provided uncertainty is explicit?
9. Who may approve a package from C2 -> C3 and C3 -> C4?

Review operations

10. Target reviewer throughput.
11. Who handles layout identity / course-familiar exceptions?
12. Which high-usage courses deserve field verification first?

These decisions scale across the library. They do not have to be re-litigated in every course plan.

────────

40. Final recommendation

Keep the current Peek’n Peak pipeline as the gold standard reference implementation, but stop copying its process literally.

The next engineering objective should not be:

> “make it easier to run the 10 stages for 52 courses.”

It should be:

> **“turn the 10 stages into a content-addressed, facility-aware build graph that knows what changed, what can be reused, what needs a human, and what capability each resulting package is actually safe to power.”**

That is the difference between a very good one-course pipeline and a course-data platform.

The near-term order I would use is:

```text
1. generic registry + facility/layout schema
2. source-provider abstraction (including S1M)
3. factory DAG + state database
4. migrate Cacapon through it
5. prove Winchester with no architecture changes
6. risk-ranked review workflow
7. incremental hole rebuilds + adaptive QA
8. remote immutable asset publishing
9. multi-layout proof (UK/Bethpage/Bryan)
10. incomplete-OSM assisted tracing workflow
```

If those ten pieces are built correctly, the 52-facility library stops looking like 52 bespoke course projects. It becomes a queue of data through one system.

────────

Appendix A — research notes that changed this architecture

The plan above was informed by current official/project documentation reviewed on 2026-09-19.

USGS Seamless 1 Meter DEM

USGS is producing a Seamless 1 m DEM in standardized 10 km x 10 km tiles. The program specifically describes merging project datasets to reduce gaps, slivers, and mismatches across project boundaries. Production began in 2025 and coverage is still being published progressively.

Architectural consequence: try S1M before project-specific 1 m DEMs, but retain provider fallback because coverage is not complete.

USGS 3DEP formats

USGS distributes standard DEM products including 1 m data, and modern DEM products are available as Cloud Optimized GeoTIFFs.

Architectural consequence: source providers should understand windowed/cropped immutable raster artifacts rather than treating every course as a bespoke ArcGIS export workflow.

OSM / Geofabrik / osmium

OpenStreetMap documentation warns that public Overpass instances are intended for modest use and recommends caching, extracts, or self-hosted alternatives for repeated/bulk workflows. Geofabrik provides frequently updated regional PBF extracts. osmium supports geographic extraction and tag filtering.

Architectural consequence: bulk library ingestion should run from retained regional PBF snapshots, with Overpass as targeted fallback.

NAIP

NAIP provides leaf-on aerial imagery, generally in the sub-metre to 1 m range, and open distributions exist for bulk access.

Architectural consequence: keep NAIP as national imagery baseline, but compare provider dates so a more current state ortho can win.

NRCan HRDEM

Canada’s High Resolution Digital Elevation Model is produced from LiDAR/satellite sources at roughly 1–2 m spatial resolution, with terrain models available for LiDAR-derived projects.

Architectural consequence: Ontario is a provider-adapter problem, not a permanent unsupported special case.

USGS 3DHP

The 3D Hydrography Program is replacing legacy NHD data progressively and exposes current hydrography services/products.

Architectural consequence: it is useful as supplemental water/stream context, but it should not be confused with golf penalty-area semantics.

Overture Maps

Overture publishes global building and transportation datasets in open geospatial formats. The building theme can include footprints and height/level attributes and is available in GeoParquet with monthly releases.

Architectural consequence: use it as optional outside-world supplementation, especially where OSM building context is thin.

QGIS geometry/topology validation

QGIS exposes geometry and topology checks for duplicates, gaps, overlaps, intersections, containment, and related spatial rules.

Architectural consequence: encode repeatable QA rules into the review kit instead of relying only on visual inspection.

SAM2 / SamGeo

SAM2 is Apache-2.0 licensed, and geospatial wrappers/QGIS plugins can segment georeferenced imagery into raster/vector candidates.

Architectural consequence: use local AI-assisted segmentation to accelerate candidate tracing, while preserving the rule that machine output never becomes truth without review.

Vercel static deployment and Blob

Vercel documents a finite source/static upload limit for deployments and provides separate Blob object storage intended for large public assets.

Architectural consequence: the production course library should evolve away from committing every large generated course asset beneath public/.

glTF / meshopt

Three.js supports meshopt-compressed glTF, and meshoptimizer/gltfpack can optimize, quantize, and compress geometry.

Architectural consequence: benchmark binary mesh transport once library payload size becomes material; keep the transparent JSON representation for tests and compiler inspection until the benchmark proves a better production format.

────────

Appendix B — proposed commands

```bash
# Library status
npm run course:factory -- status
npm run course:factory -- status --blocked
npm run course:factory -- status --tier=C2

# Intake
npm run course:factory -- intake --layout=cacapon
npm run course:factory -- intake --facility=bethpage-state-park

# Plan without mutation
npm run course:factory -- plan --layout=cacapon

# Build
npm run course:factory -- build --layout=cacapon --through=review-ready
npm run course:factory -- build --layout=cacapon --holes=4,8

# Review
npm run course:factory -- review-queue --layout=cacapon
npm run course:factory -- review --layout=cacapon
npm run course:factory -- apply-review --layout=cacapon

# QA
npm run course:factory -- qa --layout=cacapon --scope=affected
npm run course:factory -- qa --layout=cacapon --scope=first-release
npm run course:factory -- qa --scope=renderer-regression

# Publish
npm run course:factory -- publish --layout=cacapon --dry-run
npm run course:factory -- publish --layout=cacapon

# Batch
npm run course:factory -- batch --queue=high-value-ready --jobs=3
npm run course:factory -- batch --region=VA --through=review-ready

# Maintenance
npm run course:factory -- refresh-sources --facility=cacapon-state-park --diff-only
npm run course:factory -- freshness-report
npm run course:factory -- published-integrity
```

────────

Appendix C — proposed blockers / reason codes

```text
catalog.missing_facility
catalog.missing_layout
catalog.scorecard_unconfirmed
layout.route_identity_ambiguous
layout.shared_green_unresolved
layout.missing_route
source.osm_unavailable
source.imagery_unavailable
source.imagery_stale
source.terrain_no_accepted_provider
source.terrain_nodata
source.license_unapproved
geometry.missing_green
geometry.missing_fairway
geometry.missing_tee
geometry.topology_invalid
geometry.source_conflict
review.mandatory_open
review.high_risk_open
review.trace_unreviewed
context.uncertainty_gate
terrain.t_junction
terrain.normal_audit
truth.render_gate
truth.classification_gate
truth.field_verification_open
qa.browser_error
qa.draw_budget
qa.visual_regression
publish.hash_not_approved
publish.asset_upload_failed
runtime.registry_unbound
runtime.feature_flag_off
```

These should be machine-readable. A human should never have to infer “why this cours

*(text ends here as received)*
