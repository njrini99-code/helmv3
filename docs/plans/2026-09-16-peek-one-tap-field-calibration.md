# Peek'n Peak Upper — One-Tap field calibration (task 18)

**Status: protocol and baseline only — the course has not been walked.**
Every constant below is the shipped lab value. Nothing in this document
authorizes tuning; the "Validated constants" section stays empty until a
physical walk fills the measurement tables. Desktop QA, screenshots and the
trace matrix cannot stand in for it (master plan task 18: "Do not tune from
screenshots").

## What the walk must answer

The lab proves the pipeline is deterministic and honest on synthetic fixes.
It cannot tell us how an iPhone in the Peek'n Peak WebView actually reports
under trees, on open sky, walking, or stepping off a cart. Those numbers
set the constants that decide when a mark is HIGH, how long a tap waits,
when a hole auto-advances and how far the camera moves.

## Prerequisites

- An approved Upper package hash in `PEEK_N_PEAK_ONE_TAP_V1.approvedGeometryHashes`
  (still empty) so the marks bind to the geometry being measured.
- `peek_n_peak_one_tap_v1` on for the calibrating account only.
- A debug build with a `CalibrationTraceSink` attached (`§71`: raw windows
  go to the sink and nowhere else; production keeps none).
- Reference positions for at least the tee centres and green centres
  (surveyed or a differential receiver); repeatability alone is measurable
  without them, absolute error is not.
- Two phones if possible (one iPhone, one Android in the same shell) and a
  fully charged battery log.

## Spots (per hole, on at least holes 1, 7, 9, 11, 15, 18)

| Spot | Why |
| --- | --- |
| tee centre | cleanest sky on most holes; the MISSING_START tee posterior |
| tee edge | narrow tees are the weakest argmax in the lab (7/18 at 3 m) |
| fairway centre | the reference for shot distance error |
| fairway edge | rough-band boundary posterior |
| bunker edge | the other weak argmax (5/17 at 3 m); edge σ is unreviewed |
| green front | approach readout F |
| green/fringe edge | ON GREEN switching and the putt suppression rule |
| green centre | cup mark repeatability; next-tee rule eligibility |
| wooded spot | canopy multipath; reported vs actual error divergence |
| open-sky spot | the best case, to bound kAcc from below |

## Procedure at each spot

1. Stand still; mark 10+ times, at least 5 s apart, phone in hand at chest
   height. Note the reported accuracy shown by the chip at each tap.
2. Repeat with the phone in a pocket, then face-down on the cart seat.
3. Walk in at 1.4 m/s and tap 1 s after stopping; repeat 5 times.
4. Ride in on a cart, stop, tap within 1 s; repeat 5 times.
5. On green centre and one tee: leave the app in the background 30 s,
   return, tap (reacquire path).
6. Log the time from tap to the Saved toast on every mark (screen record).

## Measure (from the trace sink and the screen recording)

| Measure | Source | Feeds |
| --- | --- | --- |
| reported accuracy per fix | sink window | `kAcc` |
| repeatability radius (68 %, 95 %) per spot | finalized positions | `kAcc`, `minSigmaM` |
| absolute error where a reference exists | finalized − reference | `kAcc`, `highSigmaM` |
| sample scatter vs reported accuracy | sink window | `residualFloorM`, `residualAccuracyMultiple` |
| classification (argmax, p of truth) | anchor posterior | `highProbability`, `mediumProbability`, edge σ review |
| finalization latency (tap → Saved) | recording | `refinementMs`, `movingRefinementMs` |
| motion state at the tap | anchor `captureMotion` | `stationarySpeedMps`, `settlingSpeedMps`, `displacementFloorM` |
| camera behaviour on walk-ins | recording | `CAMERA_THRESHOLDS`, `GESTURES` |
| battery per hour of navigation watch | device | watch mode policy (§67) |
| next-tee dwell before the advance fires | recording + rule | `NEXT_TEE_RULE` |

## Constants under test (shipped values)

| Constant | Value | Where |
| --- | --- | --- |
| `kAcc` | 1 (`provisional`) | `location-estimator.ts` `ESTIMATOR_CONFIG` |
| `refinementMs` / `movingRefinementMs` | 750 / 1400 | same |
| `lookbackMs` / `maxSampleAgeMs` | 1500 / 2000 | same |
| `minSigmaM` / `minEffectiveAccuracyM` / `poorAccuracyM` | 1.5 / 2 / 25 | same |
| `residualFloorM` / `residualAccuracyMultiple` | 3 / 2.5 | same |
| confidence HIGH | σ ≤ 4 m and p ≥ .9 | same |
| confidence MEDIUM | σ ≤ 8 m and p ≥ .7 | same |
| motion `stationarySpeedMps` / `settlingSpeedMps` | .8 / 1.8 | `MOTION_CONFIG` |
| motion `displacementFloorM` / `displacementAccuracyMultiple` | 3 / 1.5 | same |
| location quality good / fair / stale | 8 m / 25 m / 6 s | `QUALITY_CONFIG` |
| next-tee rule | p(green) ≥ .7, ≥ 60 m from the green, 10 s dwell | `NEXT_TEE_RULE` |
| finish suggestion | green-complex p ≥ .35 | `FINISH_HOLE_RULE` |
| putt suppression | < 4 m or σ × 2.5 | `PUTT_SUPPRESSION` |
| camera | approach 180 m, green complex 70 m, putt p .7, idle resume 8 s | `CAMERA_THRESHOLDS` |
| edge σ (unreviewed / reviewed) | 2.5 m / 1 m | `EDGE_SIGMA_DEFAULTS` |

## Lab baseline (trace matrix, seed 17, source-candidate package)

Recorded here so the walk has something to compare against; these are
synthetic and prove behaviour, not accuracy.

- 18 × 7 variants: 0 false automatic advances, 0 cross-hole reassignments,
  0 lost anchors, 0 GPS-unavailable marks.
- 3 m: green argmax 18/18; tee 7/18; bunker edge 5/17; truth in the
  posterior 52/53. σ after finalization ≈ 3.3–3.9 m.
- Single 45 m jump: rejected on every mark; position within 8 m of truth.
- Cart transition through the tap: saved after 1.4 s, one grade lower.
- Poor sky 15 m: saved LOW, σ > 5 m.
- Holes 4 and 12: next tee < 60 m from the green, the rule never fires.

## Validated constants

_Empty until the walk. Commit only constants the measurements support,
with the measurement table that supports each one, in one change with
this report._

| Constant | Old | New | Evidence |
| --- | --- | --- | --- |
|  |  |  |  |
