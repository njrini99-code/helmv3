# Did the proven gaps ever get used?

**Measured:** 2026-08-19 ~04:55Z · read-only · **nothing written, nothing altered**
**Queries:** `q/forensic_schema.sql`, `q/forensic.sql`, `q/forensic2.sql`
**Raw:** `raw_forensic*.json`

Everything else in this remediation proves what the database *would allow*. This
pass asks what actually *happened*. Three of the four questions have answers. One
is unanswerable, and that is itself the most actionable result here.

**Framing held throughout:** a negative result is a good outcome and is reported as
plainly as a positive one. But "clean" and "no record exists to be clean" are
different sentences, and they are kept apart below.

---

## 1. Conversation injection — NO EVIDENCE, and the instrument could have shown it

The reproduced capability: a conversation creator can add any user at any later
time, exposing the full prior message history. The signature would be a
participant whose `joined_at` is materially later than the conversation's
`created_at`, who never posted.

| | golf | baseball |
|---|---:|---:|
| participants | 53 | 13 |
| `joined_at IS NULL` | **0** | **0** |
| joined within 5s of conversation creation | **53** | 13 |
| joined **later** than 5s | **0** | **0** |

**Every participant in both products joined within five seconds of their
conversation being created.** Not one late join exists.

This negative is trustworthy for a specific reason: **`joined_at` is fully
populated — zero nulls in either table.** Had the column been sparse, "no late
joins" would have been indistinguishable from "no data", and the correct answer
would have been *unanswerable*. It isn't. The instrument was capable of returning
the opposite result and did not.

**Verdict: the capability exists and has never been used.**

## 2. Join-code rotation by a non-head-coach — UNANSWERABLE, no instrumentation

Not clean. **Unaudited.**

- `admin_events` rows matching join/code/rotate/`regenerateJoinCode`: **0**.
- But that is not evidence of absence, because **`admin_events` is not an audit
  log**. Its composition, out of 96,941 rows:

  | `event_type` | rows |
  |---|---:|
  | `error` | 94,761 |
  | `login` | 1,341 |
  | `system` | 364 |
  | `security` | 261 |
  | `deploy` | 110 |
  | `round_submitted` | 52 |
  | `signup` | 52 |

  **97.8% is an error log.** There is no event type for roster administration, team
  configuration, or join-code management. An action of that kind could not appear
  here even if it happened every day.

- **`public.audit_log` exists, with exactly the right schema** — `user_id`,
  `action`, `table_name`, `record_id`, `old_data`, `new_data`, `ip_address`,
  `user_agent`, `created_at` — and contains **0 rows**.

> The table designed to answer precisely this question was built, is correctly
> shaped, and has never recorded a single event. Someone anticipated the need and
> the writer was never wired.

That is the same pattern this remediation found in `golf_ingest_connections`
(complete pipeline, no way to create a row) and in `createAcademicExclusion` /
`addCoachBlockedTime` (registered features, no UI control) — a finished artifact
with the connecting step missing. Here the cost is that **no privileged action in
this product is attributable to anyone.**

**Verdict: unanswerable, and the reason is missing instrumentation.**

## 3. Roster eviction — the shape RECURRED, and again nobody can be blamed

`golf_team_members` status census: **76 active · 4 inactive · 0 removed · 0 pending.**

The four inactive rows are not scattered. They are **all on one team**
(`343731cb…`), and all four were flipped within **~40 seconds** of each other:

```
2026-08-18 17:44:35Z   ba48b28a…
2026-08-18 17:44:39Z   ce928bc4…
2026-08-18 17:44:42Z   85733eec…
2026-08-18 17:45:13Z   aa0f1809…
```

Their `created_at` values span 2026-02-09 → 2026-03-13, so these are old
memberships deactivated together yesterday afternoon. On every one:
`approved_by` NULL, `joined_at` NULL, `approved_at` NULL, `jersey_number` NULL.

**Attribution attempted and failed, from every available direction:**

- `approved_by` is null on all four — the only actor column on the row.
- `admin_events` in the 17:40–17:50Z window contains **4 rows total**: two
  `error` (an unrelated `getPlayerShotAnalytics` message) and two `login`. Nothing
  about membership.
- `audit_log` is empty.

**What this is NOT:** I am not calling this an incident. Four never-onboarded
memberships (null `joined_at`, null jersey) being deactivated together is at least
as consistent with **legitimate roster cleanup** — plausibly the duplicate-roster
work active in this repo — as with anything hostile. Several sessions were working
in this project at that hour.

**What it IS:** the 2026-08-05 Shenandoah shape recurred — a bulk membership
status change with **no attribution available to anyone afterwards**. The finding
is not the four rows. It is that if these *had* been hostile, the database could
not tell you who did it, and that is unchanged since August 5th.

## 4. Team deleted by a departed-staff creator — NO, and my first answer was wrong

**Current state: 10 of 10 golf teams have their creator on staff.** Zero orphaned.

> ### Instrument defect, caught by the all-or-nothing rule
>
> My first query reported **10 of 10 teams have a creator NOT on staff** — a total
> compromise of the ownership model, and false.
>
> Cause: `golf_teams.created_by` holds a **`golf_coaches.id`**, not a user id. Tested
> against all three candidates: matches `golf_coaches.id` **10/10**, matches
> `golf_coaches.user_id` **0/10**, matches `auth.users.id` **0/10**. My join went
> through `user_id` and therefore could never match.
>
> Caught because 10/10 is an all-or-nothing result from a differentiating question
> — which this workstream had already established is a tool failure, not a finding.
> Applying that rule inverted the answer completely.

**On "was one ever in that state":** not determinable. A deleted team leaves no
row, and with `audit_log` empty there is no record of deletions. This inherits
finding #2 — **unanswerable for want of instrumentation**, not clean.

---

## Summary

| # | Question | Verdict |
|---|---|---|
| 1 | Conversation injection ever used? | **NO — genuine clean negative**, instrument verified capable of the opposite |
| 2 | Join-code rotation by non-head-coach? | **UNANSWERABLE** — `audit_log` exists, correctly shaped, 0 rows |
| 3 | Roster eviction by UPDATE? | **Shape recurred 2026-08-18**; benign explanation available; **attribution impossible** |
| 4 | Team deleted by departed creator? | **NO** currently (10/10 creators on staff); historically unanswerable |

**The single most actionable line:** `public.audit_log` was built with the right
columns and has never been written to. Wiring it is the difference between the next
roster incident being explicable and being another August 5th.

## Instrument defects in this workstream: 7

Mention-bucket · access-convention · `next/dynamic` · dynamic-route-segment ·
wrapper-resolution · `created_by` semantics · **caller-search file-type filter**.
Every one failed toward a more alarming or more interesting answer.

**The seventh is the instructive one, because it defeated the habit built to catch
the others.** I reported `golf_message_attachments` as having no UI control. It is
fully wired — component → hook → barrel → action, with a rendered attachment
button. Two compounding causes: I restricted caller search to `.tsx`, and the call
chain crosses a **`.ts` hooks layer**; and the component calls a *renamed* binding,
so even an unrestricted `.tsx` name search would have missed it.

It slipped through *because* the earlier heuristic worked. The differentiation
sanity case (an all-or-nothing split means the tool failed) returned a believable
8-vs-3, so I stopped. **A defect that produces a plausible distribution passes
every heuristic designed to catch one that produces an implausible one.**

So the rule needs a third clause:

> 1. Attach a sanity case — a known-live item the tool MUST find.
> 2. An all-or-nothing result from a differentiating question is a tool failure.
> 3. **A plausible-looking split is not evidence the classifier works.** The sanity
>    case must be a specific known-live item checked every time, never a shape
>    judgment about the output distribution.

The available sanity case here was sitting in plain sight: there is a visible
attachment button in the message composer. Neither reviewer reached for it.

**And the specific transferable fix:** never filter a caller search by file type
when the call chain crosses architectural layers. This repo's idiom is three hops —
a private `xImpl`, an `export async function x` beside it, and a re-export barrel
that callers actually import from — plus a hooks layer between the component and
the action. The middle hop looks like a terminus.
