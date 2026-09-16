# One-Tap round tracking: execution status

Tracks the One-Tap master plan (deep research report, 2026-09-16: "MARK BALL
means the ball is here now") on `agent/golf-course-geometry`. It sits beside
the renderer trackers (`2026-09-16-renderer-redesign-status.md`,
`2026-09-16-fidelity-status.md`, `2026-09-16-meridian-visual-master-plan-status.md`,
`2026-09-16-outside-world-status.md`); the course the player taps on is the
one those trackers make accurate.

Doctrine that does not change: a tap writes a real position with its real σ
and never snaps, invents, or substitutes a green centre for a cup; an empty
location window is GPS_UNAVAILABLE; the daily pin is UNSPECIFIED; sync is
idempotent and the phone is durable before the server is.

## Phases

| Phase | Scope | Status | Where |
| --- | --- | --- | --- |
| 1 · Library | Geodesy (WGS84 ↔ local ENU), location estimator (weighted window, residual gating, σ floor), lie classifier (canonical partition, Monte Carlo posterior, edge σ), terrain sampler, shot anchor schema + derived shots + undo/tombstone, hole lifecycle (cup mark, next-tee inference, status), green distances (F/C/B on the approach axis), camera director, anchor repository (memory + storage) and sync queue (backoff ladder), competition policy, course package manifest, evidence catalog, one-tap controller | done (f8ef33301, pushed) | `src/lib/golf/one-tap/**` with `__tests__/` (63 tests) |
| 2 · MARK BALL UI | Marks painted on the terrain by the Three runtime in the same frame as the evidence overlay (σ ring at true scale, YOU label, derived-shot links, hollow provisional, HOLED terminal, one ripple); SVG fallback draws the same; `HoleSceneFrame presentation="stage"` (the course is the screen: no card, no trigger, no Close; HUD slot over the course, footer slot under the View control, production camera-state director, gesture → MANUAL_CAMERA); `useOneTap` view model (location source → buffer → controller → snapshot; storage-backed anchors per round; camera director tick/anchor/gesture/recenter; F/C/B ± from the live fix or the last mark; lie label with the boundary policy); HUD, MARK BALL button with Undo (5 s window) and Holed out; synthetic walker + platform watcher location sources; lab fixture `?onetap=1&course=…&hole=…[&bar=1]`; capture script | done (this commit) | `src/lib/golf/course-geometry/scene-markers.ts`, `src/lib/golf/one-tap/{scene-markers,location-source}.ts`, `src/components/golf/one-tap/**`, `HoleSceneFrame.tsx`, `CourseHoleScene.tsx`, `CourseTerrainCanvas.tsx`, `three-renderer.ts`, `src/test/fixtures/course-geometry/browser/one-tap.tsx`, `scripts/golf/course-geometry/capture-one-tap.cjs` |
| 3 · Round integration | Round hook `useOneTapRound`: hole index persisted per round, scorecard from `holeStatus` over the shared anchor store, explicit NEXT HOLE as the primary action once a hole is closed (Reopen hole for a mistaken cup mark), next-tee fallback (`observeNextTee`: green posterior ≥ .7, inside a next-hole tee ≥ 60 m from the green, 10 s dwell) closing the hole with NEXT_TEE_INFERRED and a Back that reopens it; strokes chip and inferred banner in the HUD; the lab walker route continues to the next tee. Still open: where this lives in the product (replace or sit beside the shot ledger), feeding `normalizeLiveShot`/stats, pause/resume, competition policy gating | partial (lab-complete; product placement is the owner's call) | `src/components/golf/one-tap/use-one-tap-round.ts` + test; `OneTapButton`, `OneTapHud`, fixture |
| 4 · Sync transport | `SyncTransport` against Supabase (`golf_*` anchor table + RLS, idempotent upsert by id, geometry/terrain version stamped), offline queue proven with airplane-mode capture | open | needs a migration (RLS review) |
| 5 · Device proof | On-phone walk of Peek'n Peak Upper hole 7 with the platform watcher: σ honesty, tap latency (provisional ≤ 1 frame, final ≤ 750 ms), battery over 18 holes | open | human, on course |

## Phase 2 evidence (2026-09-16)

`node scripts/golf/course-geometry/capture-one-tap.cjs --course=peek-n-peak-upper --hole=7`
against the lab (`output/playwright/course-geometry/one-tap/peek-n-peak-upper-07-v3/`, fourth run `-v4`: tee-state follow framing, footer readout, round hook with the explicit hole advance;
phone viewport, synthetic walker along the package route, 3 m accuracy):

| Step | State | Camera state / area | Marks | Links | Lie shown | Draws |
| --- | --- | --- | --- | --- | --- | --- |
| ready | HOLE_READY | tee / hole | 0 | 0 | – | 9 |
| tee marked | HOLE_READY (after ANCHOR_SAVED hold) | tee / hole (PLAYER_FOLLOW; YOU visible at the tee) | 1 | 0 | Rough / Tee (boundary posterior: the route starts on the tee edge) | 9 |
| approach marked | HOLE_READY | approach / approach | 2 | 1 | Fairway | 9 |
| green marked | HOLE_READY | putting / green | 3 | 2 | Green · likely | 9 |
| holed | HOLE_READY, hole COMPLETE (chip "Holed · 2") | putting / green | 3 (last = HOLED) | 2 | Green · likely | 9 |
| next hole (explicit) | HOLE_READY on hole 8, 0 strokes, no marks | tee / hole | 0 | 0 | – | 10 |

No page errors. Checks run for this phase: `tsc --noEmit` (exit 0), eslint
on every touched file (exit 0), vitest `unit` one-tap + scene-marker suites
(63 + 12 tests) and `unit-dom` (`OneTapPlayerScreen`, `HoleSceneFrame`,
`CourseTerrainCanvas`, `CourseHoleScene`: 16 tests), all passing.

## Phase 3 camera evidence (2026-09-16, fifth run `-v5`)

Same capture, `output/playwright/course-geometry/one-tap/peek-n-peak-upper-07-v5/`,
with the follow fit. `camera` now records framing and the settled zoom
(`data-camera-framing`, `data-camera-zoom`):

| Step | Camera state / area | Framing @ zoom | What the frame shows |
| --- | --- | --- | --- |
| ready | tee / hole | – @ 1 | the state's own fit (no mark yet) |
| tee marked | tee / hole | ball_to_green @ 0.93 | YOU at the tee (bottom-left), green complex at the top; whole corridor |
| approach marked | approach / approach | ball_to_green @ 1.06 | YOU on the fairway (left), green + bunkers ahead (upper right) |
| green marked | putting / green | whole_green @ 1.46 | the whole green with YOU and the pin marker |
| holed | putting / green | whole_green @ 1.46 | unchanged (terminal mark on the green) |
| next hole | tee / hole | – @ 1 | hole 8 from its tee, no marks |

Regression: canaries `visual-system/canaries/v22-follow-fit` (96 captures) are
pixel-identical to `v21-one-tap` (0 changed), and the player-view phone matrix
`visual-system/player/audit-v7` (18 holes × terrain/green, 36 captures) is
pixel-identical to `audit-v6`; the shared frame's selected-shot auto-fit and
preset motion moved into one `fitTo` helper without a visible change. Checks: `tsc --noEmit` exit 0, eslint on every touched file exit 0,
vitest `unit` (`shot-camera-target` 7, `visual-boundary` 3) and `unit-dom`
(`one-tap` + `HoleSceneFrame`: 11) passing.

HUD keep-out (same run, hole 8 `peek-n-peak-upper-08-v5/01-ready.png`): the
stage HUD's chip column is marked `data-hud-reserve`; the frame measures it
after every commit and hands the rectangles to the evidence overlay
(`setReservedRects` on the runtime and the overlay controller), so the scene's
"Green" label re-places below the chips with its leader instead of under the
strokes chip. Canaries `v23-hud-reserve` are pixel-identical to `v22` (96 of
96): production passes reserve nothing (no stage overlay).

## Known gaps after phase 2

- Follow fit (done, v5): the stage frame takes a `stageFocus` (Meridian §62
  rules applied to the player's last mark, `derivePositionCameraTarget`), so
  every automatic state settles on the mark and the green together
  (ball→green while the ball is out, around-green inside 45 m, whole green on
  it). The preset motion ends on that fit instead of the bare preset, a new
  mark re-fits, a gesture hands the camera over and Recenter refits. The
  live GPS fix never moves the camera on its own. The fit follows the green
  the scene draws (the hole's own outline, reviewed or source-imported): on
  Peek'n Peak Upper the greens are unreviewed OSM outlines, and a
  reviewed-only rule left the camera on the bare state.
- The distance readout and lie live in the footer above MARK BALL, not over
  the course: the second capture showed the floating card hiding the YOU mark
  at the tee (tee framing puts the player at the bottom of the frame). The
  front distance reads "–" once the player is past the front edge (on the
  green); centre and back stay numeric. No cup distance exists (daily pin
  UNSPECIFIED).
- The lab has no sync transport, so the status chip honestly reports
  "N to sync"; phase 4 adds the server.

## Open questions for the owner

- Where MARK BALL lives in the real round flow: replace the shot ledger entry
  screen for a "tracked" round, or sit beside it (phase 3 decision).
- Anchor table shape and retention (phase 4) — the anchor schema is in
  `src/lib/golf/one-tap/shot-anchor.ts`; raw samples are retained on the
  anchor (≤ 400) and would go to the server as JSON.
