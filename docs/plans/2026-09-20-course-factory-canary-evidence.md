# Course factory canary evidence

Verified September 20, 2026. This is an implementation/inspection record,
not physical course approval or a production release.

## Winchester: actual viewer path

The immutable local lab exported all 18 retained hole meshes and GLBs from
package `9f51862f95f07dba3c409ba8b78d44bbed883d95cbd2598fc9075d1be6037313`.
Bundle:
`fd9c5cdb72be1b67623e34f132d6d05a0316c616c106433e63dfdc0f3313a24a`.
All 18 holes loaded in the real WebGL viewer at 390 by 844 pixels without
browser page errors. The capture manifest records the package, mesh and
admission hashes. No fixture registry or production course policy was edited.

The run exposed a parser mismatch: the compiler emits the provider ID
`usgs_3dep_project_1m`, while the viewer only accepted the old display name
`USGS 3DEP`. The parser now explicitly accepts known compiler provider IDs
without relabelling their source evidence.

Representative hole 7 was visually inspected. Vegetation, paths, fairway and
green render; the legacy `terrainTrees=0` counter is not the V2 tree count.
Its V2 record includes 20 near, 50 distant and 633 far tree instances.
Draw calls were 16–44 against the configured 180 limit across the capture set.
This does not establish mobile performance. Each capture measured one cold
frame: 13.6–65.5 ms, median 52.5 ms; 17 of 18 exceeded 33.3 ms. V2 scene
construction took 637–1340 ms. Sustained interaction on an actual supported
iPhone remains unmeasured. V2 visual artifacts were built at runtime; retained
GLBs remain available separately.

Evidence directory:
`output/playwright/factory-bundles/winchester-cc/`.
All 18 physical studies remain unapproved. The new pending review file
contains no fabricated approvals or absence claims.

The final factory CLI run also completed all 18 captures with no page errors:
`review-bundle --layout winchester-cc --capture` returned exit 0. Its bundle
`bec135d0a35ed87521d5d3544a7234e85c022d2f1818d9e8697665714bde2268`
uses the same package, with explicit optional-world status in the manifest.
The exact report is under
`output/course-geometry/factory/lab/captures/winchester-cc/`.
The report records `admissionHash: null` and `physicallyApproved: false`;
successful capture does not alter that state.

A separate interactive check exercised hole 7 → hole 8 → Top. It found a
stale-mesh race during selection, now guarded so the scene waits for the
selected hole's response. The rerun had zero page/console errors and the
expected terrain hash change. A regression test protects the transition.

## Boonsboro: missing identity evidence, not missing pixels

The retained OSM extract contains no numbered hole routes; the real layout
cannot yet establish 18 route/green associations. The general importer now
accepts traced routes and greens before association, so missing OSM geometry
is no longer a software requirement to manufacture OSM IDs.

The retained VBMP crop is 2170 by 2179 pixels in EPSG:3857, at approximately
0.38389 projected metres per pixel. Its metadata distinguishes the declared
0.3048 m source GSD from export pixel spacing. Its four PNG channels are
RGB plus alpha, not NIR. It remains visual-review-only. The independent
source-locked national imagery is the analysis input where its provenance
passes; the VBMP preview cannot silently acquire extraction rights.

Additional primary reference acquired:
[Donna Andrews Invitational course guide](https://thedonnainvitational.com/course-guide/).
The linked two-page guide identifies all 18 holes by descriptions; it is
not a coordinate map. The page expressly describes its event yardages as
illustrative. Neither those values nor descriptive green slopes replace the
saved Lynchburg Women's Golf card or measured terrain.

Retained PDF SHA-256:
`45a7d585c40dbd47ea517b221d3f147e1f0efbd1fa3789f785e8822f044de53a`.
Its URL contains a 2018 upload path; currentness is unconfirmed. Next review
must identify the numbered routes against the current registered imagery,
then explicitly associate each green and tee complex. The new source is
useful identification evidence, not an automatic physical approval.

## Landfall: actual scoring conflicts must survive geometry work

The local comparison retains all six catalog identities and their exact
database course IDs. Marsh/Ocean/Pines scorecard patterns support further
review but do not prove a physical-hole crosswalk or an alias relationship.

Concrete discrepancy: `cc-of-landfall-nick-m-o` records hole 9 as par 4;
`cc-of-landfall-nicklaus-m-o` records hole 9 as par 5. Their tee names,
yardages and database IDs also differ. Ocean hole 7 differs across the
nine-hole and combination cards. These facts were preserved. No database
rows were merged and no historical scorecard was rewritten.

The club's indexed Nicklaus scorecard is an additional source lead. Direct
retrieval returned HTTP 403, so its search preview was not accepted as a
new verified source file. A current club-issued map/card and explicit
physical-nine identities are still required to resolve these conflicts.

Review artifacts for both identity canaries:
`output/course-geometry/factory/research/identity-canaries-v2/`.

## Catalog coverage and retained authority

A fresh read-only, paginated export found 8 active teams, 64 active course
rows and 103 complete tee scorecards. Those counts describe the library
export, not 103 physically approved layouts. Matching exact catalog course
IDs added 28 immutable tee profiles across 22 layouts; all 24 pre-existing
profiles and build references were preserved. The catalog now contains
19 facilities, 24 layouts and 52 retained profiles. Shenandoah Valley still
has no matching profile.

Candidates remain renderable. Registration, boundary review, correct route
identity, feature completeness, verified publication and field evidence are
separate admission requirements. This work grants no new production course
eligibility.
