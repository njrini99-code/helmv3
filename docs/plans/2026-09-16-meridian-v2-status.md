# Meridian V2 (ultra-high-fidelity rendering): execution status

Tracks `docs/plans/2026-09-16-meridian-v2-master-plan.md` (27 tasks, stages
A–E) on `agent/golf-course-geometry`. Status values: `done` (implemented and
verified, evidence named), `partial`, `pending`, `blocked` (needs hardware,
source data or a human pass), `rejected` (benchmarked and not kept).

Doctrine that does not change: canonical truth immutable (constraints 1–6),
Top view orthographic, no invented objects or micro-topography (14–15),
interpolated display geometry is never called measured detail (16), one ground
material (19), event-driven rendering (12), everything deterministic from
package/style hashes (13).

Supersedes the V1 trackers for the same topics: `2026-09-16-fidelity-status.md`,
`2026-09-16-renderer-redesign-status.md`, `2026-09-16-meridian-visual-master-plan-status.md`
(V6/V7 draw-budget rows are carried by Task 25 here).

## Tasks

| # | Task | Stage | Status | Evidence / remaining |
| --- | --- | --- | --- | --- |
| 1 | V2 artifact schemas | A | pending | |
| 2 | Terrain multi-scale curvature compiler | A | pending | |
| 3 | Bent-sky compiler | A | pending | |
| 4 | Semantic boundary SDF compiler | A | pending | |
| 5 | Base display LOD compiler | A | pending | |
| 6 | Hero patch extraction | B | pending | |
| 7 | Green-complex hero mesh | B | pending | |
| 8 | Bunker V2 topology | B | pending | |
| 9 | Bunker analytic normal field | B | pending | |
| 10 | Field atlas packer (+ V2 artifact compiler, ruling R6) | B | pending | |
| 11 | V2 ground shader (+ runtime V2 world, ruling R7) | C | pending | |
| 12 | Fairway directional material | C | pending | |
| 13 | Green/fringe/apron material pass | C | pending | |
| 14 | Cart-path hero ribbon | D | pending | |
| 15 | Forest edge V2 | D | pending | |
| 16 | Static tree/contact shadow bake | D | pending | |
| 17 | Structure GLB pipeline | D | pending | |
| 18 | InstancedMesh/BatchedMesh allocation | E | pending | |
| 19 | Artifact residency manager | E | pending | |
| 20 | Shader precompile | E | pending | |
| 21 | Shadow update discipline | E | pending | |
| 22 | CSM benchmark (high tier only) | E | pending | |
| 23 | Light-probe benchmark | E | pending | |
| 24 | Debug passes V2 | E | pending | |
| 25 | V2 budget validator | E | pending | |
| 26 | Canary visual suite | E | pending | |
| 27 | Physical iPhone calibration | E | blocked (hardware) | needs the owner's phone; protocol to be written with Task 26 |

## Rulings (plan defects decided during execution)

See the SDD ledger for the full text; the ones that change contracts are
repeated here as they land.
