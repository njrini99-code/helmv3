# Retained route recovery

`course-factory.py route-recovery [--layout ID|--facility ID] [--json]` inspects
retained sources without opening the factory ledger or running an adapter.
It verifies OSM snapshot checksums, reports raw route candidates and all mapped
course polygons, and provides bounded remediation commands. Source inspection
is capped at 64 MiB uncompressed per extract.

`osmCourseSites` reports each named polygon's numbering independently. A
complete series in an unselected polygon is evidence for identity review;
it never silently selects that polygon or grants hole association. A selected
route set also must satisfy the preparer's actual OSM ref and geometry contract.
`candidateAssemblyReady` means route and scorecard prerequisites allow an
assembly attempt. The preparer still checks greens, and every physical review
and measurement gate remains required. Imported `sourceGeometry` uses its own
physical hole keys and can resolve routes without invented OSM IDs.

```bash
F=scripts/golf/course-geometry/course-factory.py
python3 "$F" route-recovery --json
python3 "$F" batch --all-layouts --until layout.route.dossier
python3 "$F" batch --all-layouts --until layout.candidates.compose
```

These explicit early batch terminals do not add terrain or Blender work. A
missing retained OSM snapshot can still require the existing bounded vector
fetch; the inventory itself never fetches. The default world batch retains
its full-world behavior, including route dossiers and visual fallbacks.

## Anonymous visual corridor candidates

When a retained facility extract has closed OSM tee and green polygons but no
complete, identity-confirmed `golf=hole` route set, the route-recovery report
also exposes `visualRouteCandidates`.  A candidate pairs each source green
with its nearest source tee inside a conservative 20–900 m display range and
emits an estimated centroid-to-centroid line.  This supports the visual
compiler in producing a per-candidate 3D review scene rather than forcing the
entire property into one giant facility view.

The contract is intentionally stricter than a route proposal:

| Field | Meaning |
| --- | --- |
| `truthClass` | `estimated` for the display line; tee and green polygons remain separately source-backed. |
| `authority` | Always `visual_only`. |
| `candidateId` | Stable display ID derived from source way IDs; **not** a scorecard ordinal or physical-hole ID. |
| `canMeasure` | Always `false`. |
| `maySupplyHoleAssociation` | Always `false`. |

The candidate builder does not read scorecard yardage or layout order. It does
not create OSM IDs, canonical route features, tee-marker positions, pin
positions, or reviewed boundaries. A reused tee polygon and all nearest-tee
ambiguity remain in the candidate evidence. A green with no eligible tee is
reported separately as `greenOnlyCandidates`, which can still render a green
complex context but does not imply a route.

Only the rendering/review pipeline may consume these candidates. One Tap,
distance, lie, slope, obstacle, and round-hole association consumers must use
the separately reviewed canonical geometry import. A human/source-confirmed
route and green association replaces the visual candidate through a new,
versioned canonical package; it must never be silently promoted in place.

Each route-recovery row now carries `visualRenderPlan`, schema
`golfhelm-visual-route-render-plan-v1`. It is an explicit display-only asset
plan, not a file that is automatically published. Every asset entry contains:

- the SHA-256-verified retained Overpass extract path and hash;
- exact source OSM way IDs needed by the candidate scene;
- a derived output directory suggestion under
  `layouts/<layout>/visual-route-candidates/<candidate-id>`; and
- the visual-only contract prohibiting canonical package, One Tap, physical
  measurement, and physical-hole-world publication.

The visual compiler must record the plan hash and source artifact hash beside
any preview or GLB it produces. It must refuse a plan unless its retained
source artifact is still checksum-verified. `route-recovery` itself performs
no Blender work and does not create a public manifest entry. This lets batch
rendering produce reviewable per-candidate scenes while a source-corrected
route remains a prerequisite for a playable hole world.

## Eagle Point candidate identity evidence

The Eagle Point layout originally selected facility perimeter
[`way/1509573612`](https://www.openstreetmap.org/way/1509573612). That perimeter
contains 27 numbered route ways and duplicate refs 1–9. The same retained
source already separates the courses:

| Retained OSM polygon | Exact name | Numbered routes |
| --- | --- | --- |
| [`1509582682`](https://www.openstreetmap.org/way/1509582682) | Main Course | One each for 1–18 |
| [`1509582683`](https://www.openstreetmap.org/way/1509582683) | Par 3 Course | One each for 1–9 |

The catalog now selects the explicitly mapped Main Course polygon. The facility
AOI remains the enclosing perimeter. The existing resolver supplies the actual
18 route IDs from that polygon; the catalog does not invent or pin a guessed
route list. No par, yardage, nearest-neighbor or ordinal fallback selects a
course. This change leaves the layout at C0 and grants no boundary approval.

Source: retained Overpass extract retrieved 2026-09-20, OSM timestamp
`2026-09-20T19:13:51Z`, uncompressed SHA256
`70eceebacce67e9e1bcaf4273bc03c86d3c77aaad25676d6d76cadfa5657f29b`.
The regression fixture at
`src/test/fixtures/course-geometry/eagle-point-routing-evidence.json` retains
all 30 relevant source elements unchanged: three course polygons and 27 routes.
Its provenance records the original extract identity and ODbL attribution;
the fixture is a subset, not a byte-identical copy of the original extract.

The club's public domains redirect to its
[member login](https://eaglepointgc.clubhouseonline-e3.com/), so no public club
course tour was obtained. Independent primary corroboration is available:
the [PGA TOUR's 2017 course table](https://www.pgatour.com/tournaments/2017/wells-fargo-championship/R2017480/course-stats)
documents the Wilmington 18-hole main course; the local event organizer's
[First Tee Par 3 event](https://firstteegreaterwilmington.org/game-changer-par-3-challenge-at-eagle-point/)
explicitly identifies the separate nine-hole Par 3 course. Those pages
corroborate course identity only; no website image or scorecard is converted
into GPS coordinates. Historical tournament yardages do not replace the
selected tee's saved scorecard.

## Harbour Town: relation boundary avoids a false duplicate

The retained Harbour Town AOI names OSM relation `4813858`, but the current
AOI adapter writes no polygon for relations. Its bounding box admits an
unrelated hole 11, way `1238650440`, explicitly tagged
`golf:course:name=Heron Point`. There is no ambiguity once the actual named
Harbour Town relation is applied.

The [OSM relation API](https://api.openstreetmap.org/api/0.6/relation/4813858/full.json)
returned relation version 5. Its outer member ways `826315448`, `487107150`
and `339500032` join by exact shared node IDs into one closed ring. Inner
members `339482321`, `339482323` and `339482322` are closed rings. The valid
resulting polygon covers every vertex and segment of all 18 numbered Harbour
Town routes, ways `722552376` through `722552393`. All neighboring course
routes, including the explicitly named Heron Point hole 11, lie outside.

The catalog pins those 18 actual ordered route IDs and retains its relation
site, facility AOI, course UUID, tees and C0 status. This is a bounded catalog
repair; it adds no generic nearest-course or scorecard-matching heuristic.
The full relation response and all 27 retained route elements are in
`src/test/fixtures/course-geometry/harbour-town-routing-evidence.json` with
ODbL attribution. Source identities:

- Relation response SHA256: `e1530b68154e0d01863a35054ab5ab3b58dac5abd3aa091d935d01d880bc5fa3`.
- Retained route extract SHA256: `a13e61f442c44ee43a34a0b2756e72684adbedce1e0f41ba537105ca18309ece`.

The official [Sea Pines course page](https://www.seapines.com/golf/courses/harbour-town-golf-links)
corroborates the named 18-hole course. These source boundaries still require
the existing physical review before measurement or higher capability tiers.
Future generic relation support must retain and honor complete multipolygon
membership; a bounding box must not substitute for that identity evidence.

## Sea Island Seaside: missing source remains a blocker

The retained source already names the correct Seaside polygon, way
`301551447`. Its routes are numbered 2–18; hole 1 is absent. The other ref1
in the extract is way `1545883623` inside the explicitly named Plantation
Course polygon `301551411`. No catalog pin change can safely supply the
missing Seaside route, and no Plantation route is borrowed.

Retained extract SHA256:
`36e1cd994081142a9a2bf8304b3e4c2432de7c27797e30e9800dbbe70a15af3a`.
The [official Seaside course page](https://www.seaisland.com/golf/courses/seaside/)
provides numbered hole descriptions/images but no georeferenced route in the
inspected content. It also states a May 1–October 18, 2026 restoration closure.
The layout records `knownRenovationAfter: 2026-05-01`; later source evidence
and review remain necessary, and the closure's end is not treated as an
observed completion. Recovery requires a source-backed trace/import of the
missing route and its associated green, with explicit physical hole identity.

## Pinehurst No. 8: distinct named AOI intake

Direct [OSM way 428977993](https://api.openstreetmap.org/api/0.6/way/428977993/full.json)
metadata identifies a closed, valid golf-course polygon named `Pinehurst
Course No. 8`, operated by Pinehurst Resort. Its website tag links to the
[official No. 8 course page](https://www.pinehurst.com/golf/courses/no-8/),
which documents the separate Tom Fazio course. This is distinct from the
retained No. 2 polygon `1358696570`; the previous coverage association to
No. 2 is not reused.

The complete-library intake helper added facility `pinehurst-course-no-8`
and layout `pinehurst-no-8` at C0, binding only library course UUID
`991cae6b-4a6e-4018-b101-0288e1aa37af`. Its one exported 18-hole tee profile,
tee UUID `70a67b06-78d6-4a48-8fad-3256340eaa6b`, is retained with its original
revision. Route IDs and geometry remain null. New source feature counts are
unmeasured; no zero count asserts absence.

The raw OSM response is retained in
`src/test/fixtures/course-geometry/pinehurst-no-8-aoi-evidence.json` with
original response SHA256
`58f364e3d75f874c86007f847c2467ff5f385e09d5f99b1c3600c04bc638ba55`,
retrieval and ODbL attribution. Correction inputs, the checked plan hash and
the exact three-file write receipt are under
`output/course-geometry/factory/research/library-intake-v1/black-no8/`.

Bethpage Black remains held. Its retained audit identifies only the shared
90-hole Bethpage State Park polygon `29468839`; the
[operator confirms five separate courses](https://www.bethpagegolfcourse.com/about/).
A bounded subcourse metadata request returned HTTP 504 and a bounded
Nominatim Black Course search returned no feature. This is an unresolved
source lookup, not proof that a subcourse polygon does not exist. No Black
manifest is written without that course-specific evidence, and none of its
three exported tees is borrowed by another layout.
