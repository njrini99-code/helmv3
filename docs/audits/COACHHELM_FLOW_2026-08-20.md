# CoachHelm (GolfHelm) — where the output dies before it reaches a screen

Measured against production, 2026-08-20. **This is revision 2.** The first
revision was written from database evidence alone; a code-side trace
(`COACHHELM_PIPELINE_TRACE_2026-08-20.md`) then contradicted four of its claims,
and re-querying confirmed the trace was right on all four. The corrections are
recorded in full below rather than quietly deleted, because three of the four
were wrong in the alarming direction and one of them named a real defect that
does not exist.

---

## Corrections to revision 1 — read these first

| Rev-1 claim | Verdict | What is actually true |
|---|---|---|
| "37 archived insights served 6,931 times — coaches are served insights the system already retired" | **REFUTED** | **10,795 of 10,799** exposures on now-archived rows happened *before* `archived_at`. Only 4 landed after, the last on 2026-08-04. The archived gate works. Rev 1 joined a **current-state** field against a **historical** ledger and read the resulting shadow as a live bug. |
| "Predictions are 47/473 accurate — 10% — surfaced to coaches as confidence-scored output" | **REFUTED, and inverted** | **47 of 58** verdicts are accurate — **81%**. The 473 was `validated_at IS NOT NULL`; 415 of those are deliberate `invalid_horizon` retirements that write no verdict *on purpose*, so they were never in the denominator. |
| "`golf_patterns_v2.strokes_impact` is 100% NULL, so ranking has nothing to rank on" | **REFUTED** | The live column is **`stroke_impact`** — **611/611 populated**, avg −0.223, and it is what `signal-groups.ts:162` actually selects. `strokes_impact` is a **dead duplicate column no code reads**. Rev 1 measured the decoy. |
| "419 of 635 insights (66%) have never appeared on any surface" | **OVERSTATED** | 419 have no exposure row, but the ledger does not instrument the primary coach queue. The defensible floor is **217 of 635 (34%)** that could never have reached *any* surface. See §1. |

One rev-1 number was not re-derived and is now confirmed: **18,514 completed
cron runs against 2 failed**, whole-table. The generation side is healthy.

---

## 1. Corrected accounting of the 419

`golf_insight_exposure` is written by exactly one function
(`recordExposureForReturned`, `insight-delivery.ts:312`) serving five surfaces.
**`getSignalGroups` — which populates the TriageDesk / Signal Queue coaches
actually work from — never writes to it.** Verified directly: its query is
`applyInsightVisibility(… .eq('team_id', teamId).eq('status','active').eq('dismissed', false)).order('created_at', desc)`
(`signal-groups.ts:133-142`) — no limit, no recency window, no exposure call.

So "no exposure row" ≠ "never seen". Decomposing all 419:

| Bucket | Rows | Could it ever have reached a screen? |
|---|---:|---|
| **v2-engine rows** — fail `V3_ENGINE_FILTER` unconditionally | **112** | **No.** Never, in any state. |
| **`lifecycle_state = 'tentative'`** — excluded from `VISIBLE_LIFECYCLE_STATES` | **105** | **No.** And there is no way out — §2. |
| `lifecycle_state = 'archived'` | 131 | **Yes** — each lived **~26.5 days** at `status='active'`, passing every Signal Queue predicate, before being archived. |
| Passes every gate today | 71 | **Yes** — visible on the Signal Queue right now. Simply unlogged. |

**The genuinely-unreachable set is 217 of 635 (34%).** The other 202 are blind
spots in the ledger, not failures of delivery. Rev 1's 66% counted both.

---

## 2. The real defect: `lifecycle_state` is a one-way ratchet

This is the finding that survived verification, and it got sharper, not weaker.

**Two different code paths write an insight's confidence and its lifecycle, and
only one of them can move upward.**

On a refresh with < 5% movement — the common nightly case — `upsert.ts:234-241`
builds:

```js
// Small wiggle — refresh evidence + content, preserve lifecycle.
const refreshPayload = {
  evidence, content, title, category, metadata: mergedMetadata, updated_at: nowIso,
};
```

`evidence` carries `confidence`. **`lifecycle_state` is absent from that
payload** (except in the `archived` resurrection branch below). So a nightly
regen refreshes confidence upward while lifecycle stays exactly where it was.

Meanwhile the only promotion is gated on the state it can never be in
(`upsert.ts:296-298`):

```js
const shouldMature =
  existing.lifecycle_state === 'detected' &&
  nextMovementCount >= MATURATION_MOVEMENTS;   // = 3
```

And the lifecycle cron's Rule 4 (`coachhelm-insight-lifecycle/route.ts:36`)
moves `detected → tentative` on confidence decay — **with no inverse rule.**

### What that produces, measured

Of the 110 `tentative` v3 rows:

| | rows |
|---|---:|
| currently at `confidence ≥ 0.4` — **above the floor that demoted them** | **81** |
| `movement_count ≥ 3` — **have met `MATURATION_MOVEMENTS`** | **15** |
| ...of those, also `confidence ≥ 0.4` | **11** |
| refreshed in the last 7 days (actively re-emitted) | 79 |
| updated in the last 2 days | 87 |

**15 insights have satisfied the code's own stated bar for maturation and are
held back by one identifier in one conditional.** They are not stale, not
low-confidence, and not dismissed — 11 of them are above the confidence floor
and every one is still being re-emitted nightly.

The escape hatch does not work either. Resurrection (`upsert.ts:255-263`)
re-derives `lifecycle_state` from confidence — but only for rows already
`archived`, and archiving needs 90 days of staleness anchored on
`max(created_at, metadata.last_refreshed_at, metadata.redetected_at)`. Every
nightly refresh bumps `last_refreshed_at`. **A `tentative` row the engine keeps
re-emitting can never go stale, therefore never archives, therefore never gets
the one chance it has to be re-graded.**

Fix is one line plus a backfill: allow maturation from `tentative`, or add the
inverse of Rule 4. This is the highest-value change in this document.

---

## 3. The v2 engine is still writing rows that can never be delivered

`V3_ENGINE_FILTER` (`insight-visibility.ts:34`) is
`'engine_version.eq.v3,signature.like.v3:%'`. All 112 v2 rows fail it — and
**13 of them have a NULL `signature`**, so the predicate evaluates NULL rather
than false, which excludes them just the same but for a second reason.

This is not historical residue: **11 v2 insights were created in the last 30
days, the newest on 2026-08-17.** Something still runs the v2 path nightly and
every row it produces is invisible by construction. Either stop the writer or
stop excluding it — right now it is doing neither.

---

## 4. Exposure logging measures server calls, not human views

143,969 rows across 216 distinct insights. The `coach_feed` ratio is ~419:1,
and the mechanism is confirmed in code: exposure is recorded **inside the data
read**, and `TriageDesk.tsx` calls `router.refresh()` after Scan Team (:380),
after every signal action (:413, :438) and from a manual button (:506) — on a
route that is `export const dynamic = 'force-dynamic'`. Each refresh re-runs the
fetch and re-stamps up to 20 rows.

The ledger is therefore sound for *"did this row ever reach an instrumented
surface"* and worthless for *"how often was it seen."* It writes ~1,400 rows a
day for no analytic gain, and it is blind to the primary queue.

---

## 5. Still true, and still worth acting on

- **Nothing is ever marked addressed.** `addressed_at` and `action_type` are
  NULL on **all 635** rows, including the 216 that were shown. So
  `golf_insight_effectiveness` (5,688 rows, **29** with any action) and
  `golf_causal_relationships` (5,653 rows, **178** active) compute nightly over
  an empty numerator.
- **Goal suggestions: 429 generated, 399 expired, 1 accepted, ever** (on
  2026-07-27). Meanwhile `golf_goals` holds 19 rows, so the goals that exist
  came from elsewhere. Either the accept surface is missing or the expiry
  window is far shorter than a coach's cycle.
- **`round_review` is a near-dead surface** — 34 impressions, 17 distinct
  insights, since 2026-07-24. Narrow by construction (±24h `updated_at` window,
  one takeaway per round), so this may be correct behaviour rather than a bug.
- **69 predictions are past `due_date` and were never validated at all.**

## 6. Patterns — the picture is much better than rev 1 said

`stroke_impact` is fully populated (§ corrections). What is actually true:

- **576 of 611 patterns (94%) are `pattern_type = 'contextual'`** and are
  deliberately excluded from the queue — `signal-groups.ts:170` documents why:
  near-zero signal, they would "drown out every real signal on this desk."
  **Only 19 patterns are queue-eligible.** So "0 of 611 ever matured" is
  technically true but measures the wrong population.
- **3 patterns are `lifecycle_state = 'dismissed'` while `is_active = true`.**
  A genuine crossed wire, but it is three rows, not a systemic fault.
- 107 patterns are `detected` with `is_active = false`. All are older than
  2026-07-25 while active ones run to today — that reads as a deliberate
  deactivation batch. **Not called a bug here; the writer was not identified.**

---

## Ranked, after verification

1. **The `tentative` ratchet** — 105 rows permanently invisible, 15 of them
   having already met the maturation bar. One-line fix, one backfill.
2. **The v2 writer feeding an unconditionally-filtered path** — 112 rows,
   still growing.
3. **Nothing marked addressed** — starves two nightly engines completely.
4. **The exposure ledger is blind to the primary queue** — until that is fixed,
   no delivery metric from this table can be trusted, including the ones above.
5. **Goal suggestions expiring at 93%.**

## Method note

Rev 1's four errors share one cause: **measuring a field's name rather than its
use.** Two current-state/historical joins, one column that is a near-name decoy
for the live one, and one denominator taken from a timestamp instead of a
verdict. Everything in rev 2 that names a column or a filter was checked against
the code that reads it, and quoted.

The dead-column audit's "129 columns 100% NULL" list should be re-checked for
more decoys like `strokes_impact` — a NULL column sitting beside a populated
one with a near-identical name is dead weight, but it is not evidence that the
feature is broken.

---

*Companion: `COACHHELM_PIPELINE_TRACE_2026-08-20.md` — the code-side trace that
caught these, with the full filter inventory and per-surface consumer map.*
