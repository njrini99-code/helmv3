# Golf: data without code, and code without data

**Measured:** 2026-08-19 ~04:35Z · read-only · **nothing dropped or altered**
**Data:** `GOLF_DATA_WITHOUT_CODE.csv` (78 populated golf tables) · scanners
`wiring.py` → `wiring2.py` → `wiring3.py`

Answering the owner's note: *"some stuff was supposed to be wired and never was —
same with the database stuff for golf, that's why."*

---

## The headline inverts the assignment

**The "populated golf table nobody reads" class is essentially empty.** Of 78
populated golf tables, exactly **one** has no read site anywhere in live
application code.

The assignment expected the value to be in populated-but-unread tables — data
accumulating with no consumer. It isn't. **The golf data layer is wired.** Where a
golf table holds rows, something displays them.

The "built but never connected" work is real, but it is in the **empty** tables:
**17 golf tables that live code reads and writes, and that have never held a single
row.** Both halves of the pipeline exist. Nothing has ever flowed through them.

That is a more precise version of the owner's intuition, and it changes where to
look in the morning.

---

## Class 1 — UNWIRED: code exists on both sides, zero rows ever (17)

Reader and writer are written. No row has ever been created. **This is the
valuable class.**

| Table | Referencing files |
|---|---|
| `golf_qualifier_selections` | 6 — incl. `dashboard/qualifiers/[id]/page.tsx`, `FairwayQualifierLeaderboard.tsx` |
| `golf_course_holes` | 3 — `actions/courses.ts`, `rounds/continue/[id]/page.tsx`, `v2/mining/course-management.ts` |
| `golf_academic_exclusions` | 2 — `actions/recurring-events.ts` |
| `golf_coach_blocked_time` | 2 — `lib/calendar/availability.ts` |
| `golf_coach_player_intent` | 2 — `actions/v3/intent.ts`, `v3/intent/loader.ts` |
| `golf_ingest_connections` | 2 — `api/cron/v3/ingest-sync/route.ts`, `v3/ingest/providers/arccos.ts` |
| `golf_recruit_documents` | 2 — `actions/recruit-documents.ts` |
| `golf_task_reminders` | 2 — `actions/task-reminders.ts`, `actions/tasks.ts` |
| `golf_travel_expenses` | 2 — `actions/travel.ts` |
| `golf_announcement_tasks` | 1 — `actions/announcements.ts` |
| `golf_event_documents` | 1 — `actions/event-documents.ts` |
| `golf_ingest_sync_log` | 1 — `api/cron/v3/ingest-sync/route.ts` |
| `golf_message_attachments` | 1 — `actions/message-attachments.ts` |
| `golf_platform_metrics_daily` | 1 — `actions/admin-bi-data.ts` |
| `golf_travel_budgets` | 1 — `actions/travel.ts` |

⚠ **Two entries excluded from the 17 as NOT dead** — `golf_staff_invite_codes` and
`golf_staff_invite_redemptions` were created by `helmv3-cb` **tonight**; they are
empty because the feature has not shipped. This is the exact trap this class
invites, caught only because I happened to know their provenance. **Nothing in the
database distinguishes "abandoned" from "not launched yet"** — every row above
needs that same product judgment, which is the owner's to make, not mine.

**Three sub-shapes worth separating in the morning:**

1. **A whole ingest pipeline that never ingested.** `golf_ingest_connections` +
   `golf_ingest_sync_log`, fed by `api/cron/v3/ingest-sync/route.ts` with an Arccos
   provider at `v3/ingest/providers/arccos.ts`. A cron route, a provider
   integration, and two tables — zero rows. Either the cron never ran, or it ran
   and never had a connection to sync. **The highest-value single item here.**
2. **The deepest UI investment: `golf_qualifier_selections`** — 6 files including a
   dashboard page and a leaderboard component. The most finished-looking feature
   with no data behind it.
3. **Small features with a single action file** — travel budgets/expenses,
   task reminders, announcement tasks, event documents, message attachments. Each
   is one action file away from working, or one deliberate deletion.

**Confidence:** HIGH that these hold zero rows (exact `count(*)`). **LOW** on
*why*, in every case — this pass did not determine whether a feature shipped and
went unused, never shipped, or shipped tonight. **What breaks if you act on this
wrongly:** deleting the table under an unshipped feature breaks it at launch, with
no failing test to catch it.

## Class 2 — Never wired at all: empty, and no code anywhere (4)

`golf_attendance_summary` · `golf_coach_behavior_log` · `golf_practice_sessions` ·
`golf_review_events`

Zero rows, and no live source file mentions them. Schema with neither producer nor
consumer — the genuinely orphaned case. **Still golf, so still note-only.**

## Class 3 — Populated, no reader (1)

**`golf_course_tee_edit_history`** — 21 rows, last written 2026-08-12, single
reference at `src/app/golf/actions/course-library.ts:2005`, an `.insert()`. Nothing
reads it.

**This is an audit log, and write-only is arguably its correct design.** It is
recording tee edits for a future review surface that does not exist yet. Classified
**UNWIRED**, not ABANDONED, and it is 21 rows — the smallest stake in this document.

## Class 4 — ACTUALLY_REACHABLE: instrument was wrong (8+)

Tables my scanners called unread that are read in production code. Each is a
scanner defect, not a finding:

| Table | Rows | Actually read at |
|---|---:|---|
| `golf_causal_relationships` | **5,646** | `actions/causal-relationships.ts:158`, plus `CausalWhyPanel.tsx`, `FairwayMyDevelopment.tsx`, `PlayersGridView.tsx` |
| `golf_team_join_requests` | 12 | `actions/teams.ts:1018` + RPC `golf_my_join_requests` |
| `golf_player_courses` | 42 | `actions/golf.ts:6915` |
| `golf_coachhelm_chat_messages` | 127 | `v3/chat/persistence.ts:79,97,149` |
| `golf_coachhelm_action_runs` | 3 | `v3/chat/action-runs.ts:77,100,122` via a `TABLE` const |
| `golf_qualifier_round_courses` | 3 | `actions/golf.ts:3369` |
| `golf_learned_behavior` | 24 | `v2/learning/behavior-learner.ts:126,193` |
| `golf_document_versions` | 1 | trigger `set_document_version_number` |

---

## Instrument history — three generations, and why it matters

This scan was **wrong three times**, each time in the direction of a more alarming
answer. Recording it because the assignment will be repeated.

| Version | Keyed on | Failure |
|---|---|---|
| `wiring.py` | line-based grep with a `mention` bucket | Could return **0 unread for every table** — comments and type names counted as usage. Structurally incapable of finding anything. |
| `wiring2.py` | `.from('t')` + forward window | Missed `.from('t' as any)`, `.from.call(sb,'t')`, `fromUntyped(sb,'t')`. Reported **9 unread**, including `golf_causal_relationships` — 5,646 live rows on three UI surfaces. |
| `wiring3.py` | **the quoted table literal, any context** | Converged to **2**, of which 1 was a `TABLE` const indirection. Convention-agnostic by design. |

**The lesson generalizes past this task.** This codebase accesses Supabase through
**at least four conventions**: `.from('t')`, `.from('t' as any)`,
`.from.call(sb,'t')`, `fromUntyped(sb,'t')`, plus `const TABLE = 't'` indirection.
Any reachability tool keyed on one of them **silently under-reports usage** — and
under-reported usage reads as "dead code found", which is a result people act on.

This is the same shape as the `knip.json` misconfiguration (`src/app/**` listed as
entry points, so nothing beneath it could ever be reported; 7 unused files became
86 once corrected). **Both tools were confidently wrong in the direction that
produces a satisfying answer.** A reachability instrument that cannot see one of
four access conventions is not a conservative instrument — it is a broken one that
looks productive.

---

## Class 1 paired against the 86-file dead-code list

Joined against `knip-real.txt` (86 import-unreachable files, 59 of them golf).
**The prediction under test — that the strongest pairs would be the
single-action-file features (travel, task reminders, announcements, event
documents) — is disconfirmed, in both directions.**

### A. Both sides dead — 1 of 17

**`golf_platform_metrics_daily` ↔ `src/app/golf/actions/admin-bi-data.ts`**

The table has never held a row, and the only file that touches it is
import-unreachable. Verified as a genuine pair, not a tooling artifact:

- `getEnhancedBIData` (the file's sole exported function) has **0 external
  references** anywhere in `src/`.
- It is **not** a `next/dynamic` false positive. The golf admin page does lazily
  load a BI tab (`admin/page.tsx:45`, `dynamic(() => import('./components/BusinessIntelligenceTab'))`),
  which is exactly the blind spot that would fake this result — but
  `BusinessIntelligenceTab.tsx` **does not import `admin-bi-data.ts`**, and is not
  itself on the dead list.

A complete unshipped feature, confirmed dead independently from both the database
side and the import-graph side. **The single cleanest "built and never connected"
finding in this document.**

### B. Mixed — 1 of 17

**`golf_course_holes`** — `actions/courses.ts` is import-dead, but two live files
reference the table (`rounds/continue/[id]/page.tsx`,
`v2/mining/course-management.ts`). A partially superseded access path, not an
unshipped feature.

### C. Table empty, but ALL referencing code is import-reachable — 13 of 17

`golf_qualifier_selections` · `golf_academic_exclusions` · `golf_coach_blocked_time` ·
`golf_coach_player_intent` · `golf_ingest_connections` · `golf_recruit_documents` ·
`golf_task_reminders` · `golf_travel_expenses` · `golf_announcement_tasks` ·
`golf_event_documents` · `golf_ingest_sync_log` · `golf_message_attachments` ·
`golf_travel_budgets`

**This is the most important result of the pairing, and it changes the question.**

These are *not* unshipped features with orphaned code. The code that reads and
writes them is imported and reachable — it is live in the running application. The
table is empty anyway.

So for 13 of the 17, **the engineering wiring is finished and reachable, and no
user has ever created a row through it.** That is not a connection to make; it is a
product question — never launched, never announced, never discovered, or gated
behind something that never opens. Including the Arccos ingest pipeline: the cron
route and provider are both reachable, and no connection has ever been created.

**Confidence:** HIGH that zero rows exist (exact `count(*)`) and HIGH that the
referencing files are import-reachable (knip, corrected config). **LOW on why**, in
every case — that is the owner's to supply.

### On the failed prediction

Both halves were wrong, and in an instructive way. The single-action-file features
predicted as the strongest pairs are all in Class C with **live** code.
`golf_qualifier_selections`, predicted to be the odd one out for *not* fitting that
shape, sits with the majority. The shape that actually separates the classes is not
feature size — it is whether the referencing file is import-reachable, which is
independent of how many files there are.

---

## User-reachability: is there a path a human can walk?

Import-reachable is not user-reachable. For each of the 13, the import graph was
walked **upward** from the files touching the table to Next.js entry points, then
those routes checked against `nav-registry.ts`, `surface-registry.ts` and the
CommandPalette. (`user_reachability.py` / `user_reachability.json`.)

### NO ENTRY POINT — 2 of 13, and one is the find of the night

**`golf_ingest_connections` + `golf_ingest_sync_log`** — the Arccos pipeline.

No page renders either table. Walking up from every file that touches them reaches
exactly **one** entry point: `/api/cron/v3/ingest-sync`. Not in the nav registry,
not in the surface registry, not in the command palette, and **nothing anywhere
links to it**.

Then the decisive check — *what could ever create a connection row?*

> **There is no `INSERT` or `UPSERT` on `golf_ingest_connections` anywhere in the
> repository.** Every reference is a `SELECT` or an `UPDATE`:
> `api/cron/v3/ingest-sync/route.ts:64` (select active connections), `:112` and
> `:134` (update `state`, `last_synced_at`), and
> `v3/ingest/providers/arccos.ts:153` (update refreshed tokens).

So the pipeline can read connections, refresh their OAuth tokens, sync rounds and
record state transitions — and **nothing in the product can create the row that
starts it.** The feature is built end-to-end and is impossible to begin.

This is the owner's "supposed to be wired and never was", located exactly: not a
missing table, not missing logic, not a missing cron — a missing *entry point*. The
fix is an afternoon of wiring (a connect-your-Arccos-account surface), not a
decision about whether the feature should exist. **Highest-value item in this
document.**

### The write-control pass: which of the 11 has a button?

"A nav-listed page is in the import chain" was a floor, not an answer. So the
Arccos question was applied to each: **what specifically would a user click to
create this row?** Each table's `INSERT`/`UPSERT` site was located, its enclosing
function resolved, the exported wrapper found (`xImpl` is private; `export async
function x` wraps it), and `.tsx` callers of that export searched.

**Result: 8 of 11 have a real UI control. 3 do not.**

#### NO UI CONTROL — 3 more join Arccos

| Table | Writer | Reachability |
|---|---|---|
| `golf_academic_exclusions` | `createAcademicExclusion` (`recurring-events.ts:1959`, inserts at `:1936`) | **no caller anywhere** |
| `golf_coach_blocked_time` | `addCoachBlockedTime` (`golf.ts:5010`, inserts at `:4972`) | **no caller anywhere** |
| ~~`golf_message_attachments`~~ | ~~`sendGolfMessageWithAttachments`~~ | **RETRACTED — see below. It is fully wired.** |

> #### ⚠ RETRACTION: `golf_message_attachments` is NOT unwired
>
> Caught by `helmv3-c9` and verified independently here. The feature works end to
> end: `use-message-attachments.ts:10` imports `sendGolfMessageWithAttachments`
> from the barrel `@/app/golf/actions/messages`, calls it at `:43` and `:92`;
> `FairwayMessages.tsx:117` destructures `sendMessageWithAttachments` from that
> hook, calls it at `:358`, and wires `onSendWithAttachments` at `:569`;
> `MessageComposer.tsx:155` fires it when files are pending. There is a rendered
> `AttachmentButton` and `AttachmentPreview` in the composer.
>
> **Two compounding causes in my scan, not one:**
> 1. I restricted caller search to `.tsx`. The call chain crosses a **`.ts` hooks
>    layer**, so the entire intermediate layer was excluded by file type.
> 2. The component calls a **renamed** binding (`sendMessageWithAttachments`), so
>    even an unrestricted name search in `.tsx` would have missed it.
>
> Re-running my own check with the file-type filter removed surfaces
> `use-message-attachments.ts` immediately.

The remaining two are exported server actions with a working insert and **no
control that invokes them**. Same shape as Arccos, one layer up: the write path
exists, the button does not.

**A corroborating detail worth the owner's attention:** `createAcademicExclusion`
(`feature-registry.ts:300`) and `addCoachBlockedTime` (`:271`) are both **listed in
the admin feature registry**. Someone registered them as product features. The
registry says they exist; nothing calls them. That is independent evidence these
were *intended* to be surfaced rather than abandoned mid-design — which moves them
toward "afternoon of wiring", not "decide whether it should exist".

#### ENTRY EXISTS, UNUSED — 8 of 11

Each has a named control, so the claim is checkable:

| Table | Exported writer | UI control |
|---|---|---|
| `golf_travel_expenses` | `createTravelExpense` | `FairwayExpenseForm.tsx` |
| `golf_travel_budgets` | `setBudget` | `FairwayExpenseSummary.tsx` |
| `golf_task_reminders` | `setTaskReminder`, `createRecurringTask` | `FairwayTasks.tsx`, `FairwayCreateTaskModal.tsx` |
| `golf_announcement_tasks` | `createEnrichedAnnouncement` | `FairwayCreateAnnouncement.tsx` |
| `golf_event_documents` | `attachDocumentToEvent` | `EventDocumentsSection.tsx` |
| `golf_recruit_documents` | `uploadRecruitDocument` | `FairwayRecruitDocuments.tsx` |
| `golf_coach_player_intent` | `setIntent` | `FairwayIntentControl.tsx` |
| `golf_qualifier_selections` | `setCoachPick` | `FairwayNewQualifier.tsx` |

For these eight the product is complete and reachable, and no user has produced a
row. **Genuine product question**, not an engineering gap.

Two partial notes: `confirmSelection` (qualifier selections) and `bulkSetIntent`
have **no** UI caller, so those specific paths are unreachable even though the
table's primary writer is wired.

### Revised totals for the 13

| Class | Count | Meaning |
|---|---:|---|
| **NO ENTRY POINT** | **4** | `golf_ingest_connections`, `golf_ingest_sync_log` (no insert exists at all) + `golf_academic_exclusions`, `golf_coach_blocked_time` (insert exists, no control). `golf_message_attachments` was retracted from this class. |
| **ENTRY EXISTS, UNUSED** | **9** | control named above; product question (incl. `golf_message_attachments` after retraction) |
| **GATED** | 0 | none found; runtime conditions not evaluated |

### Old section (superseded) — ENTRY EXISTS, UNUSED — 11 of 13

Every remaining table's code chain reaches a page that IS in the nav registry:
`/golf/dashboard/travel` (budgets, expenses) · `/golf/dashboard/tasks` +
`/team-hub` (task reminders) · `/golf/dashboard/announcements` (announcement
tasks) · `/golf/dashboard/calendar` (event documents, academic exclusions, coach
blocked time) · `/golf/dashboard/messages` (message attachments) ·
`/golf/dashboard/recruiting` (recruit documents) · `/golf/dashboard/qualifiers`
(qualifier selections).

A user can reach these surfaces. Nobody has ever produced a row through them.
**That is a product question — never launched, never announced, never discovered —
not an engineering one.**

### GATED — 0 identified

No feature flag, env gate or never-true condition was found on the 13. Absence of
evidence: this pass did not evaluate runtime conditions.

### Confidence, split honestly by direction

**The negative result is strong; the positives are weaker, and they are not
symmetric.**

- **NO ENTRY POINT is robust.** It is an *absence* — no import path from any page
  reaches those files, and for `golf_ingest_connections` it is corroborated by an
  independent check (no insert site in the whole repo). Two directions agreeing.
- **"Entry exists" is transitive and therefore generous.** Walking upward through
  a widely-imported module can attribute a route to a table that page never
  actually touches — `golf_coach_player_intent` surfacing `/admin` routes is
  almost certainly that artifact. The honest claim is "a nav-listed page exists in
  this table's import chain", **not** "that page has a control that writes this
  table". Confirming the latter needs the UI read, which this pass did not do.

**Instrument correction (4th in this workstream):** the nav check first reported
`golf_qualifier_selections` as not-in-nav. False negative — the route resolved to
`/golf/dashboard/qualifiers/[id]` and the registry lists the parent
`/golf/dashboard/qualifiers` (`nav-registry.ts:210`), so exact-match failed on the
dynamic segment. Reclassified to nav-listed. A route-matcher blind to dynamic
segments will systematically under-report navigability — the same failure family as
the other three.

## Not covered
- **What writes each Class 1 table was read from source, not traced at runtime.**
  No claim that a cron actually executes — only that the code exists.
- **Baseball not covered** — deliberately, per the directive not to spend the
  remaining ceiling on seed data.
