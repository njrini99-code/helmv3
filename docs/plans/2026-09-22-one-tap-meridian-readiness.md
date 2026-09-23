<!-- markdownlint-disable MD013 -->
# One-Tap Meridian: readiness review and toolchain (2026-09-22)

Goal: render more courses in the One-Tap / Meridian Live 3D experience at
the level of Peek'n Peak Upper. This note records the environment as
verified on 2026-09-22, the proof that the render loop works, the artifact
contract a course must satisfy, the gaps found, and the ordered work.
Orientation for the whole system stays in
`docs/plans/2026-09-20-course-3d-system-handoff.md`; One-Tap task status in
`docs/plans/2026-09-16-one-tap-status.md`.

## 1. Where the work lives

- Worktree `/Users/ricknini/worktrees/helmv3/golf-course-geometry`, branch
  `agent/course-factory-c`. It contains every other 3D branch
  (`agent/golf-course-geometry`, `agent/course-factory-{a,b}`,
  `agent/one-tap-task{12,13}`); none is on `main`. PRs #1939, #1949, #1950,
  #1951 are open drafts. Verified: no other local repo, worktree, stash or
  GitHub repo on the `njrini99-code` account holds 3D course work.
- Local-only state (not on GitHub): 6 unpushed commits (2026-09-21) and an
  uncommitted "Phase 0" change set (38 modified files, ~115 untracked,
  including 19 facilities / 20 layouts / 40 scorecards of catalog growth).
- Disposable build output: `output/` (18 GB, untracked, not gitignored —
  stage explicit paths only).

## 2. Toolchain (verified 2026-09-22)

`python3 scripts/golf/course-geometry/course-factory.py doctor` passes every check.

| Tool | Version | Used for | Note |
| --- | --- | --- | --- |
| Python (`/opt/homebrew/bin/python3`) | 3.14.7 | factory + pipeline scripts | system Homebrew Python, no venv |
| GDAL / `osgeo` / `gdalinfo`, `ogr2ogr` | 3.13.3 | raster decode, reprojection | Pillow mis-decodes some 3DEP tiles; GDAL is required |
| numpy / scipy / shapely / pyproj / Pillow | 2.5.2 / 1.17.1 / 2.1.2 / 3.7.2 / 12.1.1 | geometry, terrain, sheets | `requirements-terrain.txt` pins numpy, Pillow, shapely |
| Node / tsx | v22.23.2 | `.mts` compilers, publish | `node_modules` is a real directory in this worktree |
| three / vite / vitest / TypeScript | 0.186.0 / 8.1.2 / 4.1.11 / 5.9.3 | renderer, lab, tests | three r186 DFG-LUT workaround has a removal tripwire for r187 |
| Playwright + browsers | 1.62.1; Chromium 151 (CfT v1234), WebKit 26.5 | lab captures (`capture-*.cjs`) | **installed 2026-09-22** into `~/Library/Caches/ms-playwright` (`node_modules/.bin/playwright install chromium webkit`); captures failed before this |
| Blender | 5.2.1 LTS (`/opt/homebrew/bin/blender`) | `blender/generate_hole.py`, `validate_glb.py`, visual route candidates | factory review artifacts only; the app does not load GLBs |
| osmium-tool | 1.19.1 | optional OSM tooling | **installed 2026-09-22** (`brew install osmium-tool`) |
| QGIS | 4.2.2 (`/Applications/QGIS-final-4_2_2.app`) | human review kit | not on PATH; doctor finds it |
| Supabase CLI (repo-local) | 2.115.0 | migrations, pgTAP | |
| Supabase MCP (project-scoped) | connected | read-only checks against production | verified with a `golf_courses` select |
| GitHub CLI `gh` | logged in as `njrini99-code` (repo, workflow) | PRs, CI | |
| Docker Desktop | installed, **daemon off** | local Supabase / pgTAP only | start it before any migration or RLS test; not needed for rendering |

Disk: 32 GB free on the data volume; the factory holds an 8 GB reserve
(`COURSE_FACTORY_DISK_RESERVE_GB`), so about 24 GB is usable. A 3DEP tile or
NAIP export is a few hundred MB.

Network sources reachable (HTTP 200 on 2026-09-22): Overpass interpreter
(POST), USGS TNM Access, 3DEP ImageServer, `prd-tnm` S3, USDA FPAC
`conus_naip`, USGS NAIP Plus, NC OneMap (both ortho services), Virginia VBMP,
Licking County, Palm Beach County, Ohio OSIP.

## 3. Baseline (worktree state including the uncommitted Phase 0 set)

| Check | Result |
| --- | --- |
| Python (`cd scripts/golf/course-geometry && python3 -m unittest discover -p 'test_*.py'`) | 347 tests, OK |
| vitest `src/lib/golf/{course-geometry,one-tap}`, `src/components/golf/{course-geometry,one-tap}` | 965 passed, 2 failed with the lockdown; **967/967 after the policy decision** |
| `tsc --noEmit` | exit 0 |
| Blender GLB round trip (`validate_glb.py`, Forsyth hole 10) | passed, spans within 1.2e-5 m |
| Lab (`vite --config scripts/golf/course-geometry/browser.config.ts`, :8768) | serves; a non-fatal dependency-scan warning (`server-only` from `src/lib/admin/vercel-api.ts`) |
| `capture-player-view.cjs` Peek hole 7, phone | 14 draws, 507,600 triangles, 0 page errors (the first run after a cold Vite start timed out; rerun passed) |
| `capture-one-tap-motion.cjs` Peek hole 7, reduced motion | 9 steps ready → holed, arcs and lie correct |

The two vitest failures were caused by the Phase 0 runtime lockdown, not by
a regression, and are fixed by the §6 decision: `course-registry.test.ts` ("carries unique layout ids…",
expects at least one approved hash) and `course-assets.test.ts` ("accepts the
SHIPPED Upper manifest…"). See §6.

Evidence: `output/readiness-2026-09-22/` (captures, `onetap-h7/`,
`compare/sheet-h4.png`, `blender-roundtrip.json`).

## 4. What a course needs to render like Peek'n Peak

The One-Tap / Meridian runtime draws only these artifacts. Blender GLBs and
`visual-route-candidates` are not loaded (`mayEnterOneTap: false`); the GLB
modules `glb-writer.ts` and `structure-glb.ts` are used only by offline
scripts (`export-v2-glb.mts`, `report-structure-glb.mts`), not by app code.

1. Published assets `public/course-geometry/<layout>/`: `manifest.json`
   (`courseId`, `geometryVersion`, `packageUrl`, `terrainByHole`,
   `contextLayerUrl`), `package-<hash>.json`, `terrain/<layout>-NN-<hash>.json`
   (`course-terrain-v4`), `context-<hash>.json` — written by
   `publish-course-assets.mts`.
2. The hash chain intact: package `contentHash` = manifest `geometryVersion`
   = asset-manifest `geometryHash` = context `packageHash`.
3. A policy in `src/lib/golf/course-geometry/course-registry.ts`
   (site id, `dbCourseIds`, name patterns, approved hashes, `holeBindings`,
   `renderWorld: 'v2'`) and a `golf_courses` row binding.
4. For the lab: `compiled-*/` + package JSON listed in
   `src/test/fixtures/course-geometry/browser/fixture-assets.ts`.

### Reviewing factory builds: use the factory lab, not the fixture lab

The temporary uncommitted entries in `browser/fixture-assets.ts` serve
**stale** packages from an earlier factory run (Winchester there is
`376092b3…`; an older lab bundle is `9f51862f…`; current output is
`510dd70e…`). Capturing through them understates current quality. The
supported path serves the current output directly and needs no `src/` edit:

```sh
python3 scripts/golf/course-geometry/course-factory.py review-bundle --layout <id>   # export only; no task execution
node_modules/.bin/vite --config scripts/golf/course-geometry/factory-lab.config.ts   # :8774
node scripts/golf/course-geometry/capture-factory-bundle.cjs --layout=<id> --bundle=<64-hex> --holes=<id>-04
```

Warning: `course-factory.py status` and `why` are **not** read-only. They
call `plan()` with adoption on, which writes `task_runs`/`artifacts` rows to
`state.sqlite` (`factory/cli.py` 367–399, `factory/planner.py` 86–87,
121–124). `coverage` and `route-recovery` do not open the ledger.

### Current quality, hole 4, phone, terrain view

`output/readiness-2026-09-22/sheet-h4-v2.png`, all in the v2 world that the
One-Tap policy uses (`renderWorld: 'v2'`). Peek is from the fixture lab's
One-Tap view (`?onetap=1&course=peek-n-peak-upper&hole=4&world=v2`); the
others are factory-lab bundles exported 2026-09-22 from current output, so
the framing differs. The fixture lab's `?play` view draws v1 — do not compare
across worlds. `review-bundle --layout peek-n-peak-upper` fails
("asset missing or outside configured output root") because Peek's evidence
is retained under `src/test/fixtures/`, not `output/`.

| Course | Package | Draws | Versus Peek |
| --- | --- | --- | --- |
| peek-n-peak-upper | `fdec6ea8…` (published) | 16 | reference |
| winchester-cc | `510dd70e…` | 11 | near parity: canopy, bunkers, paths, context |
| forsyth-country-club | `8c190024…` | 18 | near parity: dense tree lines, striped fairway |
| grande-dunes-resort-club | `ef86529b…` | 31 | water and paths good; no fairway surface visible on this par 5 — check the package |
| cacapon | `217390f1…` | 6 | sparse canopy and context |
| big-blue-course-uk | `a5f73ae2…` | — | **fails to render**: `Course extent exceeds 5 km local frame` |

All five have a package, 18/18 `course-terrain-v4` meshes whose
`geometryHash` matches the package, a context layer and a canopy review, and
a bound `golf_courses` id in the catalog; all five rows (and Peek's) exist
in production with matching names (read-only query, 2026-09-22). None has a
`capability-report.json` (the evaluate task has not run for them), and none
is published or listed in `course-registry.ts`.

Small defect on Peek: YOU and BALL labels overlap when the player stands on
the last mark (`onetap-h7/06-approach-settled.png`).

## 5. Next courses and what the runtime still assumes

Candidates, in order: **winchester-cc**, **forsyth-country-club**, then
**grande-dunes-resort-club** once the missing par-5 fairway is explained.
Cacapon's app course is still the pilot package; Big Blue first needs the
5 km frame failure fixed and its route confirmed.

The registry is already multi-course (`COURSE_GEOMETRY_REGISTRY`,
`productCourseIdForRound` in `course-registry.ts` iterate it; each policy
carries its own `geometryFeatureFlag`/`syncFeatureFlag`). What is still
single-course:

- `new-round-client.tsx` and `continue-round-client.tsx` receive one
  server-evaluated boolean for `peek_n_peak_one_tap_v1` (and the sync flag)
  rather than evaluating the matched policy's own flag.
- `src/lib/golf/one-tap/peek-n-peak-policy.ts` defaults to the Peek policy
  (`PEEK_N_PEAK_ONE_TAP_V1`).
- `config/feature-flags.yml` has only the Peek flags.

## 6. Decisions the owner must make

1. **Parity bar — decided 2026-09-22: C2 plus the owner's source-candidate
   pilot exception**, the policy Peek'n Peak shipped under. The Phase 0
   lockdown's authority changes were reverted on `agent/course-factory-phase0`
   (`course-registry.ts`, `course-policy.ts`, the `livePilot` C2 rule in
   `live-round-placement.ts`); its hardening stays: `parseGeometryPackage` on
   every loaded package, `bindingHasCompleteHoleCrosswalk` on resume, and no
   sliding of package holes past an unmapped round hole. A new course still
   needs the owner to approve its exact package hash (and a `livePilot` entry
   for C2 Live).
2. **Local-only work — done 2026-09-22.** The 6 commits are pushed to
   `origin/agent/course-factory-c`; the Phase 0 set is `27e8f431a…` on
   `agent/course-factory-phase0` (pushed), without `output/`,
   `.playwright-cli/` or the stale temporary lab fixtures, which remain
   uncommitted in the worktree.
3. Human passes the machine cannot do: route confirmation, publish
   approval per package hash, boundary/§39 context review, Task 18 field
   walk, phone performance (Task 27).
4. The "One-Tap Live Round Master Design" the status doc cites is not in the
   repo.

## 7. Ordered work

1. ~~Owner decisions in §6~~ — done.
2. Make the fixture lab honest: drop the temporary stale fixture entries in
   favour of `review-bundle` + factory lab for every factory course.
3. Fix Big Blue's `Course extent exceeds 5 km local frame` (find the
   outlying feature; the frame limit should reject bad packages in the
   factory, not at render time).
4. Explain the Grande Dunes hole 4 fairway; sweep all 18 holes of each
   candidate with `review-bundle --capture` and a contact sheet.
5. Run `layout.capability.evaluate` for the candidates (writes the ledger;
   disposable output) so each has an earned tier and review queue.
6. Generalize the round pages to evaluate the matched policy's flags; add a
   registry policy per course (starts with no approved hash — dark).
7. Owner approves a package hash → `publish-course-assets.mts --course=<id>`
   in a PR → registry hash → flag in preview → on-course check.
8. Renderer polish found on the way: YOU/BALL label collision on the green;
   Cacapon canopy density.
