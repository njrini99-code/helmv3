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

## Master plan tasks (2026-09-16, "One-Tap Live Round Master Design")

The owner's implementation plan (Tasks 1–18) runs on this branch only; nothing
lands or deploys from it. The Swift/Capacitor plugin (Task 2) is skipped per
the owner: the shell's WebView Geolocation API is the device source.

| Task | Status | What changed |
| --- | --- | --- |
| 1 · Gate to Peek'n Peak Upper | done (3485d87e5) | `peek-n-peak-policy.ts`: courseId ↔ siteId `osm-way-136097904`, approved-hash set, `peek_n_peak_one_tap_v1` flag (dev on, preview/prod off), modelled-area check; manifest carries `courseId`/`siteId`. |
| 2 · Native location | skipped (owner) | No plugin; no `UIBackgroundModes` change. |
| 3 · Shell location source | done (cd6a53d59) | `location-source.ts`: navigation/capture watch modes, pause/reacquire on visibility, denied/timeout/unavailable status, Permissions API query; Info.plist When-In-Use purpose string only. |
| 4 · Estimator covariance + motion | done | `location-estimator.ts`: full weighted 2×2 scatter, `C_device = (kAcc·a_median)²I`, anchor = scatter + device floored at 1.5 m on the smallest axis, σ = largest axis; reported radius kept apart from the calibrated term; `kAcc = 1` flagged `provisional`. New `location-quality.ts`: `captureMotion` from median reported speed and net displacement beyond the jitter floor (≤ 0.8 stationary, ≤ 1.8 settling, else moving), a moving mark refines to 1.4 s then saves one grade lower (never "stand still"); live-fix grade for the HUD (good silent; fair/poor/stale/none). |
| 5 · Anchor V2 (privacy-minimized) | done | `shot-anchor.ts` schema V2: `courseId`/`siteId` binding, `captureMotion`, `reportedAccuracyMedianM` + `calibratedUncertaintyM`, `estimatorSummary` (sample count, residuals, scatter major/minor, kAcc + calibration flag, motion evidence) and no raw sample window on the durable record (§71). Raw windows reach only an opted-in `CalibrationTraceSink` (`calibration-trace.ts`, memory, bounded); production passes none. `StorageAnchorRepository` takes the round's binding and migrates V1 lab rows on load (window dropped, summary rebuilt, written back); unknown versions are dropped and counted. |
| 6 · YOU ≠ BALL | done | `player-presentation.ts`: YOU is the live device eased for presentation (1 m deadband, 1.2 s time constant, smoothed accuracy halo; a jump over 25 m snaps, an implausible one over 12 m/s waits for a confirming fix, never walked across the course). The newest finalized mark is now ● BALL (immutable, never follows the phone); ◎ YOU carries a world-space accuracy halo and dims after 6 s without a fix; links join finalized marks only, so the walk is never a shot. The runtime overlay reconciles by key (YOU moves every fix without reallocating) and, on ○ → ●, eases a shift ≤ 2.5 m over 180 ms or crossfades a larger one with a fading ghost; instant under Reduced Motion. The static SVG twin draws the same kinds. |
| 7 · Lie presentation | done | `presentation-lie.ts` chooses the words, never the evidence: ≥ .90 "Green", .70–.90 "Likely green", under .70 with a second dominant class "Green / fringe"; a tee/rough split at hole start reads "Near tee edge"; any water share ≥ .20 reads "Near water" and flags the penalty/drop workflow (the phone is with the golfer, not the ball); a boundary call on an unreviewed feature reads "Surface uncertain". The readout shows the copy with `data-lie-rule`. |
| 8 · Clean HUD | done | Healthy play shows nothing in the corner: no Ready, no GPS ±N m, no "N to sync", no 0 shots. Chips only for Offline · saved / Sync issue (§70, from `navigator.onLine` and exhausted retries), Location weak / Locating… (§8.2, from the live-fix grade), Paused, and "N shots" once there is one ("Holed · N shots" on a closed hole). `OneTapStatusToast.tsx`: "✓ Saved … Undo" for the 5 s undo window (low-confidence / outside-mapped-area variants), "No location · not saved" after an empty tap; Undo lives nowhere else. "At the cup? Finish hole" appears only once the last mark sits in the green complex (§14). MARK BALL stays the one large action. |
| 9 · Green-aware readout | done | `greenReadout(distances, onGreen)` (§15–16): approach prints F/C/B from the canonical green outline; ON GREEN prints the centre only (`Center N yd · ±N yd · pin not marked`) and suppresses a short putt when `distance < max(4 m, 2.5 × σ)` ("Short putt · position approximate"). On-green comes from the live fix's exact partition class (or the last mark's primary lie when there is no fix). `data-readout-mode`, `data-centre-display` on the slot. Hole 7 v10: green mark shows ON GREEN with the putt suppressed at σ ≈ 4 yd. |
| 10 · Hole integrity | done | `hole-integrity.ts` (§80): `assessHoleIntegrity(anchors, { expectClosed, unresolvedPenalties })` derives CLEAN / MISSING_CUP (inferred close or an open hole left behind) / MISSING_START (first mark's tee posterior < .25) / LOW_LOCATION_QUALITY (≥ half the marks with σ > 8 m or poor accuracy, or any σ > 15 m — location evidence, not the lie-boundary grade) / UNKNOWN_SURFACE / PENALTY_UNRESOLVED (Task 11 plugs in) / SEQUENCE_ANOMALY (mark after the cup, tap order, cup mark off the green), in review order. Flags are never stored. `holeStatus` adds `cupMarked`/`terminalAnchorId`; inference only marks the existing anchor (test: never invents a cup). Round hook: per-hole `integrity`, `completion` card state; `OneTapHoleComplete` (§19): clean → "Hole 7 · 2 shots · complete ✓" fades after 2 s (`HOLE_COMPLETION_FADE_MS`); flagged → "check N items · Review" with plain-word items, Reopen hole / Back to hole N, Keep as is. Replaces the inferred-close banner. Hole 7 v12 `05-holed.png` shows the clean card. |
| 11 · Exceptions and penalties | done | `penalty-event.ts` (§58): PenaltyEvent v1 (kind penalty_area / lost_ball / out_of_bounds / unplayable / other, strokes 1 or 2, relatedAnchorId, syncState, tombstone deletedAt), device-durable `StoragePenaltyRepository`; score = shots + penalty strokes; a penalty is resolved by the next ordinary mark (the drop) — no branching, no anchor created. Round hook: `penaltyStrokes`/`score`/`unresolvedPenalties` per hole, `addPenalty`, `removeLastPenalty`, `skipHole` (round state, persisted with the hole index; a mark after the skip plays the hole again), `goToHole`, `openReview`. `OneTapOverflow` (§79): ••• carries Penalty / drop (sheet), Delete last mark (controller `deleteLast`, tombstone at any age), Review hole (integrity card on demand), Change hole (sheet), Skip hole, Pause / Resume tracking, Use standard tracking (host callback; hidden in the lab). `HoleSceneFrame.stageMenuItems`; the stage menu opens upward. HUD chip `+N penalty`; completion card carries penalties. `FINISH_HOLE_RULE` (§14): Finish hole offered from green-complex probability ≥ .35 (a pin cut near the edge must not block the hole; inference keeps .7). Hole 7 v14 `04-overflow.png`. |
| 12–18 | open | shot reveal (Opus agent, branch agent/one-tap-task12), sync + migration branch-only (Opus agent, agent/one-tap-task13), ledger adapter + placement, offline, competition, trace matrix, calibration doc. |

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
  `src/lib/golf/one-tap/shot-anchor.ts` (V2). Raw sample windows are no
  longer on the anchor: the server receives the resolved position,
  covariance and the estimator summary only (§71).
