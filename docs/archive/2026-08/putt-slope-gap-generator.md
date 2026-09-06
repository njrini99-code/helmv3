# PuttSlopeGenerator — design, evidence, and the one decision that blocks it

Status: **spec complete, build blocked on an owner decision** (see §6).
Measured 2026-08-16 against production `golf_shots`.

Written because the owner's standing note on CoachHelm is that insights are
"not root — just basic stuff", and this is a root-level signal the engine
structurally cannot see today.

---

## 1. The naive version of this insight is WRONG. Do not build it.

Roster-wide, putting make rate by slope looks like a huge finding:

| slope | putts | make % |
|---|---|---|
| level | 4,948 | 81.4% |
| uphill | 2,645 | 30.5% |
| downhill | 2,344 | 25.0% |

A 56-point level-vs-downhill gap. It is **entirely a distance artifact**:

| slope | avg distance |
|---|---|
| level | **4.4 ft** |
| uphill | 16.1 ft |
| downhill | 16.2 ft |

Level putts are tap-ins. Downhill putts are lag putts. The gap is length, not
slope. `PuttBiasGenerator` already learned this exact lesson for break
direction (see its header comment, F2+F3 2026-06-08) — the same trap, one
column over.

## 2. Controlled for distance, a real effect survives

Guilford College only (largest **real** customer dataset — see §5 on why that
filter is mandatory):

| bucket | level | uphill | downhill |
|---|---|---|---|
| 0–3 ft | 98.6% (n=902) | 92.8% (n=97) | **84.4%** (n=64) |
| 3–6 ft | 65.6% (n=90) | 66.9% (n=133) | **52.6%** (n=135) |
| 6–10 ft | 36.1% (n=72) | 33.3% (n=123) | **25.5%** (n=106) |
| 10 ft+ | 13.6% | 9.7% | 9.3% |

Two things matter here:

- **The effect is largest at the SHORTEST distances**, which is
  counter-intuitive and is exactly why nothing surfaces it. A player at 98%
  level and 84% downhill from 0–3 ft blends to ~96% on `puttMakePct0_3` and
  looks flawless.
- **Beyond 10 ft there is no signal.** Make rates are luck-dominated. The
  generator must not look past 10 ft.

Note this forces a divergence from `stats/proportion-test.ts`: `bandFor()`
returns null below 4 ft, correctly, because tap-ins are not green-READING
tests. But a downhill 3-footer is a real and distinct skill — speed control and
the fear of running it past. This generator needs its own bands starting at 0.

## 3. "Downhill is hard" is a fact about golf, not an insight about a player

Every one of the 9 real players with n>=10 downhill putts inside 10 ft shows a
statistically significant gap (two-proportion z, z = 2.47 → 11.23):

| player | downhill | level | gap (pp) | z |
|---|---|---|---|---|
| Braeden Gillen | 30.3% (n=66) | 94.1% | 63.8 | 11.23 |
| Lucas Falcone | 27.3% (n=11) | 85.7% | 58.4 | 4.47 |
| Larsen Gallimore | 33.3% (n=15) | 83.9% | 50.5 | 4.72 |
| Lily Rowe | 36.8% (n=19) | 84.3% | 47.5 | 4.71 |
| James Peach | 52.2% (n=46) | 88.7% | 36.5 | 5.34 |
| Luke Wise | 62.5% (n=64) | 98.9% | 36.4 | 8.15 |
| Sean Acree | 64.3% (n=14) | 100.0% | 35.7 | 2.47 |
| Holden Yakola | 66.7% (n=15) | 96.0% | 29.3 | 3.21 |
| Connor Lynde | 66.7% (n=63) | 94.1% | 27.4 | 4.86 |

**So a significance gate alone would fire for everyone**, which is precisely
the repetitive output the owner is objecting to. An absolute effect floor does
not fix it either: at a 35pp floor, 7 of 9 still fire.

**The insight is the SPREAD against the squad.** Gillen's 63.8pp against a
squad median near 36.5pp is the outlier a coach should act on. Compare to
cohort, never to zero. This is the part that makes the generator worth
building, and it is the part that requires fetching teammates' putts.

## 4. Sample reality and window

Real orgs only, demo excluded — 24 players:

- 9 have >=10 downhill putts inside 10 ft
- 7 have >=15
- 4 have >=25

A gate at n>=15 per side fires for ~29% of the roster. That is the right
selectivity.

**Window must be 365 days, not the v3-usual 90.** All 381 qualifying downhill
putts fall inside 365 days but only **131** inside 90 — about 5.5 per player
against a 15-putt floor, so a 90-day generator would never fire. This is
defensible on the merits: slope handling is a stable skill trait, not form.
`WORST_HOLES_WINDOW_DAYS = 365` is the existing precedent.

## 5. Data hazard: ~58% of production putts are demo data

`Demo University Golf` (3,022 putts) plus its clone
`Demo University Golf (Pat Demo)` (2,908) outweigh every real customer
combined. The clone copies rounds ACROSS player names, so per-player
aggregates come back byte-identical for unrelated players — Tyler Hayes ==
James Peach, Jackson Hale == Pat Edwards == Braeden Gillen.

**Any roster-level analysis must filter `o.name NOT ILIKE '%demo%'` before
drawing a conclusion.** Every table in this document does.

## 6. THE BLOCKER — a new metric ID is a production schema change

The generator needs a `MetricId` (say `putt_downhill_gap_pp`). Registering one
requires all three of:

1. `METRIC_IDS` in `src/lib/coachhelm/v3/metrics/registry.ts`
2. `METRIC_RENDER_CONFIG` in `src/lib/coachhelm/v3/standing/metric-config.ts`
3. **A row in `supabase/migrations/20260606010000_v3_golf_metrics_seed_reproducible.sql`**

Item 3 is the problem. `metric-registry-attribute-parity.test.ts` parses that
ONE file as the DB source of truth, and **no later migration has ever inserted
a metric** — verified, it is the only file matching `INSERT INTO ... golf_metrics`.

So the options are:

- **(a)** edit the applied historical seed migration — breaks reproducibility
  and the migration ledger guard;
- **(b)** add a new migration AND extend the parity test to parse multiple
  seed files — correct engineering, but it is a schema change against the
  **shared production database** serving Golf, Baseball and Lift Lab, and
  CLAUDE.md makes DB changes mandatory-review.

(b) is the right answer. It is an owner decision, not an unattended one.

## 7. Build plan once §6 is unblocked

`src/lib/coachhelm/v3/generators/putt-slope.ts`, modelled on `putt-bias.ts`:

- `extends BaseGenerator<PuttSlopeAggregate>`, `category: 'putting'`,
  `insightType: 'putt_slope'`, `requiresStanding = false` (no PGA benchmark
  exists for a slope gap).
- Own bands: `0-3 ft`, `3-6 ft`, `6-10 ft`. Nothing beyond 10 ft.
- Pure `selectWorstSlopeBand(rows)` — reuse `twoProportionZTest` from
  `v3/stats/proportion-test.ts`; keep it fetch-free per the scoring-purity rule.
- Cohort step: fetch active teammates' putts over the same window, compute each
  one's inside-10ft gap, take the median, and emit only when the player's gap
  exceeds it by a meaningful margin. `comparison_source: 'team_avg'`.
- `strokes_impact` = (downhill putts per round) × (excess miss rate vs squad
  median). Traceable, not a guess. `strokes_impact_method: 'peer_delta'`.
- Content names the specific band and the squad comparison, e.g.:
  > "Inside 10 feet you convert 30% of downhill putts against 94% level — a
  > 64-point spread where the squad's typical spread is 37. It is widest at
  > 3–6 ft (n=…). That is speed control, not green reading."

Tests: the pure band selector (including the 10 ft+ exclusion and the
below-4-ft inclusion that diverges from `bandFor`), the cohort-median gate,
and a demo-data-contamination guard.
