# Course factory completion plan

Started September 20, 2026, from `1592bcab5` on
`agent/course-factory-c`. This plan tracks implementation and evidence;
it does not approve any physical course or authorize inferred precision.

## Verified starting state

- PR #1951 is draft, stacked on `agent/course-factory-b`.
- Catalog: 19 facilities, 24 layouts, 24 retained scorecard profiles.
  Shenandoah Valley still has no matching scorecard profile.
- Winchester retains all 18 terrain meshes and candidate GLBs.
  Existing course candidates are not physically approved.
- CI TypeScript and static checks passed. Markdown line-length and
  unchecked Supabase-read ratchets failed. Unit tests and the CI build
  were consequently skipped; they are not passes.
- Laptop free space is approximately 7.6 GiB, below the factory's 8 GiB
  reserve. Preserve source artifacts, avoid concurrent heavy builds and
  downloads, and use retained data for integration checks.
- Existing dirty browser fixture files and generated course fixtures
  belong to another session and remain outside this change.

## Parallel implementation

1. **Physical admission worker**
   Implement current, scoped reviewed absence and per-hole capability
   evidence. Empty source results stay unknown. Gate measurements on
   registration, terrain units, identity and actual supporting features.
   Keep unapproved candidates renderable and C4 evidence-driven.
2. **Durable round-binding worker**
   Extend the existing round-course binding rather than create another
   ledger. Pin geometry, admission, frame and explicit hole mappings
   across devices using an immutable first-write contract. Preserve saved
   scoring data and observations through conflicts, offline operation,
   resume and revocation. Verify ownership and RLS locally.
3. **Immutable lab/factory worker**
   Load content-addressed factory bundles by explicit layout and hash,
   restricted to the configured output root. Open and capture Winchester
   without editing fixtures or production registry. Split rebuild inputs
   only when producer and consumer contracts support the separation.
4. **Integration owner**
   Fix actual CI regressions without raising baselines. Import every
   supported tee profile using IDs and source revisions, preserving
   existing profiles and avoiding name/color identity. Audit real canary
   evidence, integrate workers, maintain feature documentation and run
   the final verification once the changes converge.

## Acceptance sequence

1. Focused contract tests: unknown versus reviewed absence, stale evidence,
   failed publication, same-label tees, immutable scoring and bindings,
   concurrent devices, path traversal, changed bundle bytes and no fallback
   from an unknown hole/course.
2. Actual retained Winchester bundle opens and captures; report package,
   mesh and admission identities. Verify sparse-OSM import separately from
   Boonsboro's real hole identity approval.
3. Landfall remains explicit about unresolved aliases and ordered nines;
   no proximity/name-based row merge or synthetic ownership approval.
4. Run TypeScript/Python tests, typecheck, lint, database/RLS checks for any
   migration, documentation generators/checks and CI including full build.
5. Push reviewable commits to the draft PR and report verified outcomes,
   exact remaining evidence blockers and release status.

## Release boundary

No source correction changes historical tee IDs, pars, yards or original
observations. Rendering and measurement have different admission paths.
Missing field evidence stays an explicit capability denial. No production
migration, expanded course eligibility, merge or deployment is inferred from
successful synthetic tests or attractive screenshots.

## Implemented checkpoint

- Imported 28 additional immutable tee profiles from the fresh, read-only
  library export. The catalog now retains 52 profiles; existing selections
  and offline build references remain unchanged. Tee identity uses database
  IDs and explicit revisions, never color/name ranking.
- Added server-confirmed immutable round bindings with ownership checks,
  serialized first claim, saved scorecard snapshots, exact package byte pins,
  frame conflict detection and safe offline resume. The migration has been
  tested against isolated PostgreSQL; it has not been applied to production.
- Added per-hole physical admission with scoped reviewed absence, actual
  independent registration residuals, boundary uncertainty budgets, source
  hashes and separate horizontal/vertical capabilities. Unknown evidence
  remains unknown. Passing render checks does not grant measurements.
- Added immutable local review bundles, a strict loopback lab and serial
  captures. `course-factory.py review-bundle --layout <id> --capture` reviews
  existing factory output without fixture edits or production registration.
- Split numerical payload reuse from scorecard changes while retaining
  package-bound delivery manifests. Publication checks rehash actual bytes;
  cached preparation or a forged declared hash cannot authorize changed data.
- Audited actual Winchester, Boonsboro and Landfall evidence. Winchester's
  18 holes render; Boonsboro's unresolved numbering and Landfall's conflicting
  scorecard/combination identities remain explicit. See the
  [canary evidence record](2026-09-20-course-factory-canary-evidence.md).

## Verification and remaining work

The integrated TypeScript suite passed 1,002 tests across 111 files, with
two workers; the final combined factory suite passed 132 tests. Typecheck,
targeted lint, the unchanged Markdown/Supabase-read
ratchets, `docs:check` and `helm-os:check` passed. The real PostgreSQL migration
test exercised authorization, concurrent claims, immutable saved values and
legacy frame conflicts. The new pgTAP assertions still require CI's extension.

The preceding pushed checkpoint passed the full CI Next.js build; its unit
fixture failure was corrected locally by supplying explicit hole mappings,
with a regression proving that ordinal fallback remains forbidden. The final
commit still needs its own CI result; the earlier build is not that result.

Outstanding release evidence is concrete: independently checked registration
and boundaries for each admitted hole; current numbered route/green/tee
associations for sparse-source layouts; reviewed Landfall physical-nine
crosswalks; sustained interaction measurements on supported iPhones; and a
staging round lifecycle exercise after applying the migration. No synthetic
test, captured screenshot or source resolution substitutes for those checks.
