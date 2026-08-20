# CoachHelm (GolfHelm) — where the output dies before it reaches a screen

Measured against production, 2026-08-20. Every number here is a query, not an
inference. The short answer to "things are crossed and it's not making it into
the UI": **yes, and there are three separate crossed state machines, not one.**

---

## Headline

| | |
|---|---|
| Insights generated, all time | **635** |
| ...that have **never** appeared on any surface | **419 (66%)** |
| ...`status='active'` and never shown | **312** |
| New insights born `tentative` in the last 7 days | **33** |
| ...of those 33, ever shown | **0** |
| Insights that ever reached `matured` | **14**, none since 2026-06-26 |
| Patterns that ever reached `matured` | **0** of 611 |
| Goal suggestions ever accepted | **1** of 429 |

The pipeline generates fine. Every cron completes — 18,511 completed runs
against 2 failures. What is broken is everything *between* generation and the
screen.

---

## 1. The insight lifecycle has no promotion step

`golf_coach_insights` carries two independent state fields, `status` and
`lifecycle_state`. Grouping v3 rows by both, against whether they ever appeared
in `golf_insight_exposure`:

| status | lifecycle_state | rows | ever shown | never shown |
|---|---|---:|---:|---:|
| active | `detected` | 221 | 150 | 71 |
| active | **`archived`** | 172 | 41 | **131** |
| active | **`tentative`** | 110 | 5 | **105** |
| active | `matured` | 13 | 13 | 0 |

`matured` is the only state that reliably reaches a screen — 13 of 13. And
**nothing has matured in 55 days**: the youngest `matured` insight is 54.7 days
old.

The reason is visible in the lifecycle cron's own telemetry. Its most recent
run reports:

```json
{"total":237,"archived":3,"resolved":0,"recency_adjusted":62,
 "demoted_to_tentative":0,"healthy_cycles_updated":0}
```

The counters are `archived`, `resolved`, `recency_adjusted`,
`demoted_to_tentative`, `healthy_cycles_updated`. **There is no `matured` or
`promoted` counter — the job has no promotion path.** `tentative` is therefore
a terminal state in practice, and insights born there never leave.

This is live and worsening, not historical:

| age | lifecycle_state | created | ever shown |
|---|---|---:|---:|
| last 7 days | `tentative` | 33 | **0** |
| last 7 days | `detected` | 27 | 23 |
| 7–30 days | `tentative` | 10 | **0** |
| older | `tentative` | 67 | 5 |

**Roughly 55% of new v3 insights are born into a state nothing can promote.**

## 2. `status` and `lifecycle_state` disagree, in both directions

The archive step writes `lifecycle_state='archived'` and stamps `archived_at`
— all 172 archived rows have it — but **leaves `status='active'`**. So:

- Anything filtering on `status` sees 521 "active" insights, 236 of which the
  lifecycle machine considers archived or not-yet-ready.
- Anything filtering on `lifecycle_state` sees far fewer.

Both failure modes are happening at once. Joining exposure to lifecycle state
per surface:

| surface | detected | archived | matured | tentative |
|---|---:|---:|---:|---:|
| coach_feed | 152 | **37** | 14 | 4 |
| player_feed | 71 | **15** | 11 | 4 |
| hub_signal | 26 | 6 | 3 | **0** |
| roster_card | 27 | 11 | 2 | **0** |
| round_review | 14 | 3 | 0 | **0** |

Read that both ways:

- **`tentative` is filtered out** — absent entirely from three of five surfaces,
  and 8 insights total across the other two. The gate exists and works.
- **`archived` is NOT filtered out** — 37 archived insights have been shown
  6,931 times on the coach feed. Coaches are being served insights the system
  has already retired, because `status` still says active.

That is the crossed wiring, exactly. One half of the product trusts
`lifecycle_state`; the other half trusts `status`; the writer only updates one.

## 3. The same disease in `golf_patterns_v2`

Patterns carry `is_active` *and* `lifecycle_state`:

| lifecycle_state | rows | of which `is_active` |
|---|---:|---:|
| `detected` | 608 | 501 |
| `dismissed` | 3 | 3 |

**Zero patterns have ever matured, resolved, or archived** in 611 rows. And 107
patterns are `detected` with `is_active = false` — the two fields disagree here
too. `detected` is terminal for patterns just as `tentative` is for insights.

Related, and already noted in the dead-column audit:
`golf_patterns_v2.strokes_impact` is **100% NULL across all 611 rows**, so any
surface ranking patterns by impact has nothing to rank on.

## 4. Goal suggestions expire almost without exception

| state | rows |
|---|---:|
| `expired` | **399 (93%)** |
| `pending` | 29 |
| `accepted` | **1** |

429 suggestions generated, one accepted, ever — on 2026-07-27. Meanwhile
`golf_goals` holds 19 rows, so the goals that exist came from somewhere else.
The suggestion engine runs nightly (`v3-goal-suggestions-write`, 49 completed
runs) and its output is discarded by expiry.

## 5. What that starves downstream

Because almost nothing is ever acted on, every table that measures action is
empty or near-empty:

| output | rows | with any signal |
|---|---:|---|
| `golf_insight_effectiveness` | 5,688 | **29** rows have `insights_acted_upon > 0` (0.5%) |
| `golf_causal_relationships` | 5,653 | **178** are `is_active` (3%) |
| `golf_predictions` | 580 | 473 validated, **47 accurate (10%)** |
| `golf_insight_player_feedback` | 3 | — |
| `golf_coachhelm_chat_messages` | 129 | — |

The outcome columns on `golf_coach_insights` — `outcome_metric_name`,
`outcome_metric_before/after`, `outcome_notes`, `action_type`, `action_date`,
`addressed_at` — are **100% NULL across all 635 rows**. `addressed_at` is null
even on the 216 insights that were shown. Nothing has ever been marked
addressed, so the effectiveness engine is computing over an empty numerator
forever.

**The 10% prediction accuracy deserves its own look.** 473 predictions have
been validated and 47 were accurate. That is a model performing far below
chance-adjusted expectations, and it is being surfaced to coaches as
confidence-scored output.

## 6. The `round_review` surface is nearly dead

| surface | impressions | distinct insights |
|---|---:|---:|
| coach_feed | 86,668 | 207 |
| player_feed | 31,174 | 101 |
| hub_signal | 16,514 | 35 |
| roster_card | 9,508 | 40 |
| **round_review** | **34** | **17** |

34 impressions since 2026-07-24, against 105 generated reviews and 377 rounds.
Insights essentially do not reach the round-review surface.

## 7. Exposure logging is per-render, not per-impression

86,668 impressions of 207 distinct insights is ~419 views each. That is a
render counter, not an impression counter. It is still sound evidence for
*"did this ever reach a surface"* — which is how it is used above — but it
cannot support any claim about how often a coach actually saw something, and
it is writing ~1,400 rows a day into a 143,000-row table for no analytic gain.

---

## Ranked causes

1. **No promotion step in the lifecycle job.** `tentative` never becomes
   `detected`/`matured`. Costs ~55% of all new insights. This is the single
   biggest leak and the cheapest to verify — the job's own metadata proves it.
2. **The archive step writes one state field of two.** 172 rows are
   simultaneously active and archived; 6,931 stale impressions served.
3. **Patterns never advance past `detected`,** and their ranking column is
   entirely NULL.
4. **Nothing is ever marked addressed,** so effectiveness, causality and
   outcome attribution all compute over nothing.
5. **Goal suggestions expire at 93%** — either the surface that should present
   them is missing, or the expiry window is far shorter than a coach's cycle.

## Recommended order

1. Add the promotion path to `coachhelm-insight-lifecycle`, or stop creating
   insights as `tentative`. Until one of those happens, half of everything the
   engine produces is unreachable by construction.
2. Make the archive step write `status` as well as `lifecycle_state` — or pick
   ONE authoritative field and make every surface read it. Two state machines
   over one row is the root defect behind items 2 and 3 both.
3. Decide whether `golf_patterns_v2.strokes_impact` should be populated. If
   not, remove the ranking that depends on it.
4. Wire `addressed_at` to a real coach action, or accept that effectiveness
   and causal attribution will stay empty and stop computing them nightly.

---

*Companion: `COACHHELM_PIPELINE_TRACE_2026-08-20.md` traces the same pipeline
from the code side — which filter lives where, and which surface reads which
state field.*
