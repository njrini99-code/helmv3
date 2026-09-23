# Course-world factory Phase 0 audit

Date: 2026-09-21\
Scope: read-only inspection before the 44-layout factory completion work.

## Baseline

The authoritative catalog and retained factory outputs reconcile to 44 layouts:

| State | Layouts |
|---|---:|
| Complete per-hole visual candidates | 22 |
| Facility-level visual context; authoritative numbered route blocked | 18 |
| Facility context; terrain decision or native coverage blocked | 4 |
| Physically admitted per-hole worlds | 0 |
| One Tap geometry or distance-measurement eligible layouts | 0 |

The current tree is `agent/course-factory-c`. It contains pre-existing, task-owned factory changes and generated artifacts, so this work must stage only explicit files and must not reset or overwrite unrelated changes.

Commands run before implementation:

```sh
PYTHONPATH=scripts/golf/course-geometry \
  python3 -m unittest discover -s scripts/golf/course-geometry -p 'test_*.py' -q
npm run typecheck
git diff --check
PYTHONPATH=scripts/golf/course-geometry \
  python3 scripts/golf/course-geometry/audit-course-world-coverage.py \
  --write-json /tmp/phase0-course-world-coverage.json \
  --write-markdown /tmp/phase0-course-world-coverage.md
PYTHONPATH=scripts/golf/course-geometry \
  python3 scripts/golf/course-geometry/course-factory.py route-recovery --json \
  > /tmp/phase0-route-recovery.json
```

The Python suite ran 342 tests successfully. TypeScript and whitespace checks passed. The test suite emitted expected resource warnings from controlled HTTP-failure fixtures; it did not report a failed assertion.

## Existing contracts retained

The factory already separates a render asset from physical admission. `physical_admission.py` binds each approval to package/source revision hashes, hole identity, reviewed area, feature evidence, independent registration checks, and vertical evidence. `course-assets.ts`, `live-round-placement.ts`, and `round-course-binding.ts` use per-hole capability and durable round binding rather than an ordinal fallback. A round's scoring snapshot remains authoritative for selected tee, par, and card yardage.

The implementation therefore extends the existing catalog, route-recovery, review-sidecar, truth-gate, and capability artifacts. It does not create a second source of truth, promote visuals, or change historical round data.

## PR contract ledger

| PR | Contract introduced | Current follow-up |
|---|---|---|
| #1939 | Static metric 3D terrain/GLB foundation and lab viewer | Keep static assets separate from live player data; review snapshot CI still needs follow-up. |
| #1949 | Facility/layout/scorecard catalog and policy registry | Preserve explicit course, layout, and tee identities. |
| #1950 | Factory graph, ledger, adapters, bounded source acquisition | Reuse content-addressed tasks and retained-source rules for new workflow. |
| #1951 | Catalog scale-out, source retention, terrain acquisition, round-scoring safety | Complete review/admission and source reconciliation without weakening round snapshot ownership. |

All four PR heads are ancestors of the current branch. The one resolved #1939 CodeQL regex finding is fixed in its follow-up commit. Current PR CI failures are not physical-world approvals: #1951 has stale retrieval-benchmark generated files and one unrelated RLS privilege-contract assertion (`authenticated` lacks `USAGE` on `helm_private`); snapshot jobs remain red on the stack. Those issues are recorded for the owning lanes and are not masked by this factory work.

## Downstream safety boundary

Course geometry has two independent consumer classes:

1. Facility/per-hole visual review can use display-only artifacts.
2. One Tap, distance, tee highlighting, shot placement, analytics, and round review require an approved per-hole capability manifest and durable `roundHoleKeys` crosswalk.

No GLB, visual corridor, facility scene, scorecard distance, or ordinal artifact match is sufficient to bind a round hole. Raw observations and the immutable round scorecard snapshot remain usable when geometry is unavailable.

## Implementation slices

1. Extend the existing read-only coverage audit into the canonical machine-readable 44-layout state report, with source states, capabilities, hash references, precise blocker codes, and next actions.
2. Generate source-bound physical-review packets and machine-readable acquisition tasks from retained route/terrain evidence. Packets are pending decisions, not approvals.
3. Add validator and consumer contract tests for stale approvals, display-only isolation, source/terrain blockers, and inventory accounting.
4. Add deterministic orchestration entry points that only progress a layout after scoped evidence arrives; no network acquisition, source modification, or production publication occurs in this phase.

The canonical read-only operational command is:

```sh
PYTHONPATH=scripts/golf/course-geometry \
  python3 scripts/golf/course-geometry/course-factory.py coverage \
  --write-json output/course-geometry/factory/reports/course-world-status-v2.json \
  --write-markdown output/course-geometry/factory/reports/course-world-status-v2.md \
  --write-acquisition-tasks output/course-geometry/factory/reports/acquisition-tasks-v2.json \
  --write-terrain-decisions output/course-geometry/factory/reports/terrain-decisions-v2.json
```

It emits a machine-readable acquisition task for every route/terrain blocker. It does not fetch a source, edit a package, approve a review, compile a GLB, or publish an asset.

The four terrain-held layouts remain subject to explicit source-selection dossiers. The 18 route-held layouts receive acquisition tasks that name the exact missing numbered-route or green/tee pairing evidence; no route is inferred from imagery, scorecard yardage, or proximity.

## Implemented after the baseline

The factory coverage command now emits the `golfhelm-factory-world-coverage-audit-v2`
machine report.  Each of the 44 rows has a reproducible lifecycle state,
route/terrain/feature evidence summary, denied capability state, hash-bound
artifact references, a stable blocker, and an acquisition task when outside
evidence is genuinely required.

`generate-physical-review-packets.py --all-visual-candidates` builds an
exclusive-create, content-addressed evidence index for every layout whose
current retained package is eligible for physical review. It cannot modify
geometry, compile an asset, grant a capability, or publish a world. The batch
result retained 16 valid pending 18-hole packets and rejected six stale input
chains: Cutter Creek, Peek'n Peak Upper, Pinehurst No. 8, Sedgefield,
Starmount Forest, and Whistling Straits. Their exact mismatch is retained as
`PHYSICAL_REVIEW_PACKET_INPUT_MISMATCH`; the only permitted remediation is to
rerun the named canonical dependency graph, then generate a new packet. The
canonical coverage command also writes all 22 acquisition tasks and all four
terrain decisions; they are projections of the coverage report, not
hand-maintained files.

The runtime package boundary has been hardened at both the loader and live
round resolver. A `source_candidate` package is rejected regardless of the
historical pilot flag. Peek'n Peak remains a visual-reference candidate only;
it has no registered runtime hash or round-hole bindings until its physical
admission and matching package are approved. The resolver also refuses a
partial/missing round-hole crosswalk instead of shifting later keys by ordinal.

Verification after these changes:

```sh
PYTHONPATH=scripts/golf/course-geometry \
  python3 -m unittest discover -s scripts/golf/course-geometry -p 'test_*.py' -q
npm run typecheck
npm run test -- --run \
  src/lib/golf/one-tap/__tests__/live-round-placement.test.ts \
  src/lib/golf/one-tap/__tests__/peek-n-peak-policy.test.ts \
  src/components/golf/one-tap/use-one-tap-live-round.test.tsx \
  src/lib/golf/one-tap/__tests__/round-course-binding.test.ts
```

The Python suite passed 347 tests. The focused One Tap suite passed 25 tests.
The production build reached Next's optimized compilation and produced its
build output; its terminal process did not return a final exit marker through
the local command wrapper, so it is not recorded as a confirmed green build.
`docs:check`, `helm-os:check`, and `git diff --check` completed without a
reported failure.
