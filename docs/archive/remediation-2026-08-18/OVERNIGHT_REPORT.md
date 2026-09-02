# Overnight run — 2026-08-18 → 19

Read this one. Everything else in this directory is supporting evidence.

**Nothing was applied to the database. Nothing golf was deleted.** Eight commits
landed in an isolated worktree (`~/worktrees/helmv3/overnight-remediation`,
branch `overnight/remediation-2026-08-18`). **Four** migrations of mine are
written and deliberately unapplied, waiting on you.

Separately — and do not confuse the two — the staff-join session landed **two
migrations that ARE applied and deployed** (`20260819030000`,
`20260819040000`). Anyone treating those as pending would try to create tables
that already exist.

> ### ⚠️ Do not push that branch yet
>
> `njrini99-code/helmv3` is **public**, and those three migrations are
> unapplied. I redacted the exposure detail out of the migration file headers,
> but several intermediate **commit messages** still describe the unfixed
> defects in more detail than the files now do.
>
> **Apply the migrations first, or squash the branch before pushing.** The
> branch is local-only right now and nothing has been published.

Protected data, checked at open and close — **these may only ever increase, and
a decrease is an incident, not a discrepancy**:

| | baseline 02:56Z | close |
|---|---|---|
| `golf_rounds` | 348 | **349** |
| `golf_shots` | 24,526 | **24,526** |
| `golf_holes` | 6,174 | **6,192** |

---

## The one thing to read if you read nothing else

You said some of this was *supposed to be wired and never was*. That turned out
to be right, and the measurement located it more precisely than either of us
expected — and in a different place.

**There is no `INSERT` or `UPSERT` on `golf_ingest_connections` anywhere in the
repository.**

The Arccos ingest pipeline is complete. A cron route reads active connections
(`api/cron/v3/ingest-sync/route.ts:64`), refreshes their OAuth tokens
(`v3/ingest/providers/arccos.ts:153`), syncs rounds, and records state
transitions (`:112`, `:134`). Every reference is a `SELECT` or an `UPDATE`.

Nothing in the product can create the row that starts it. Built end to end,
impossible to begin. The missing piece is not a table, not logic, not a cron —
it is a *connect-your-account* surface. That is an afternoon of work, not a
strategy decision.

**And it is not alone. Three more features have a working write path and no
button.** Of 17 golf tables that live code both reads and writes and that have
never held a row:

| | count | what it means |
|---|---|---|
| **NO ENTRY POINT** | **4** | built, works, nothing can trigger it — *wire it* |
| ENTRY EXISTS, UNUSED | 8 | complete and reachable, nobody ever used it — *decide* |
| GATED | 0 | none found (runtime conditions not evaluated) |

The four: the two Arccos ingest tables (no insert exists at all), plus two with
a working exported server action and no caller — `createAcademicExclusion`
(`recurring-events.ts:1959`) and `addCoachBlockedTime` (`golf.ts:5010`). Each
was verified by reading *every* reference in `src/`: the definition, the
error-logging strings, the action-wrapper registration, and the feature
registry. No caller.

**A fifth candidate was withdrawn as a false positive.**
`sendGolfMessageWithAttachments` was reported as never invoked. It is invoked —
`use-message-attachments.ts:43` and `:92`, through a hook consumed at
`FairwayMessages.tsx:117` and handed to the composer at `:569`. The search that
flagged it did not follow a barrel re-export (`actions/messages.ts:32`). That is
the ninth instrument defect of the night, and the only one that produced a
finding which would otherwise have reached this page. Golf message attachments
are wired end to end: UI → hook → server action → table.

**The detail that settles the argument**: both are **listed in the admin feature
registry** (`feature-registry.ts:271`, `:300`). Someone registered them as
shipped product features. The registry says they exist; nothing in the UI calls
them.

And it is not one stray entry each — the registry enumerates a **complete CRUD
surface** for both:

    createAcademicExclusion, deleteAcademicExclusion
    addCoachBlockedTime, deleteCoachBlockedTime, updateCoachBlockedTime,
    getCoachBlockedTime

**All six have zero callers** outside their own definition file and the registry
(verified by reading every reference in `src/`). Someone sat down and specified
create/read/update/delete for two features, and then no control was ever built
for any of it. That is much harder to read as "abandoned mid-design" than a
single stray entry would be — **the surface was specified completely and never
surfaced.** It moves both firmly into "afternoon of wiring."

**Your own feature manifest disagrees with your UI.**

*(Checked against the false-positive trap rather than assumed: the registry is a
map keyed by file path whose values are quoted STRINGS, and `feature-registry.ts`
imports neither action module. An aggregate of string literals cannot make a
symbol reachable; an aggregate of references can — and the import list tells you
which you are looking at in one line.)*

The remaining 9 are the opposite case: the wiring is finished *and* reachable —
a named control exists for each (`createTravelExpense` /
`FairwayExpenseForm.tsx`, `setBudget` / `FairwayExpenseSummary.tsx`,
`setTaskReminder` / `FairwayCreateTaskModal`, and six more) — and no user has
ever created a row. Not something to connect. A product question: never
launched, never announced, or never discovered.

**Treat 4 and 9 as a floor and a ceiling, not exact.** The caller search that
produced them had a known blind spot — it filtered to `.tsx` and so excluded the
`.ts` hooks tier entirely. That was found and the one affected item was
reclassified, but the other entries were classified before the fix. The defect
only ever under-reports usage, so re-running can **shrink** the wire-it list and
never grow it. The two hand-verified items (`createAcademicExclusion`,
`addCoachBlockedTime`) and Arccos ×2 are solid; the rest of the split is
directional.

### The same pattern, in the place it hurts most

**`public.audit_log` exists, has exactly the right schema, and has never been
written to.** `user_id`, `action`, `table_name`, `record_id`, `old_data`,
`new_data`, `ip_address`, `user_agent`, `created_at`. Zero rows.

The table built to answer *who did this* was designed correctly and never
connected. The consequence is not abstract: **no privileged action in this
product is attributable to anyone.**

`admin_events` does not cover the gap and should not be mistaken for an audit
log — of its 96,941 rows, 94,761 are `error`. It is 97.8% error telemetry, with
no event type for roster or team administration. Such an action could not appear
there if it happened hourly.

This is Arccos again, and it is **already two-thirds built**. Both a reader and
a writer exist: `get_audit_log_recent()` (SECURITY DEFINER) reads it, and
`revoke_user_sessions()` writes it for exactly one action, establishing the
convention — `action` as a dotted `domain.verb`, `table_name`/`record_id`
locating the subject, payload in `new_data`. Nothing needs designing. The table
is empty because that single privileged action has never run in production.

**One thing must be fixed before it is used.** RLS is on, and the read policy is
correct — `USING (is_admin())`, so the audited cannot read the trail. But there
is an INSERT policy granting `authenticated` writes with
`WITH CHECK (user_id = auth.uid())`. Any signed-in user can write audit rows
through PostgREST, choosing their own `action`, `table_name` and payload.

Bounded rather than alarming: the check binds `user_id` to the caller, so **you
cannot frame someone else** — the damage is self-attributed noise, flooding to
bury a real entry. Still disqualifying for an audit table, and if writes come
from definer triggers then no authenticated INSERT policy is needed at all, so
dropping it *is* the fix.

Recommendation: **triggers as the floor, application calls as enrichment.** Not
on general principle — because every gap found tonight is reachable by direct
PostgREST writes that never execute application code. An app-level audit call
cannot observe those, which leaves exactly the hole the audit exists to close.
Triggers cannot capture intent (they see `active→inactive`, not "removed" versus
"duplicate cleanup" — precisely the ambiguity in yesterday's cluster), nor
`ip_address`/`user_agent`, which are columns on this table and exist only in the
HTTP layer. Hence both, with the trigger as the floor.

Wiring it is the difference between the next roster question being answerable
and being another August 5th.

And "populated golf table nobody reads" turned out to be essentially empty — 1
of 78, an insert-only audit log whose write-only design is defensible. **Your
golf data layer is wired.** Where a table holds rows, something displays them.

---

## Security — ranked by real risk, not severity labels

Seven claims went through adversarial verification: an independent investigator,
then a panel of skeptics whose only job was to refute. **17 refutation attempts,
zero refutations.** In 5 of 7 the skeptic searched further than the investigator
and found something new — none of it flipped a verdict, all of it sharpened one.

### 1. Conversation creators can inject a third party — LIVE GOLF DATA, REPRODUCED

The only finding tonight that was **fired, not inferred**. In a rolled-back
transaction a verifier impersonated a real conversation creator, inserted an
unrelated third party (different team, different org, never a participant), and
read all 19 pre-existing messages as that injected user.

`golf_participants_insert_v2` ends in a disjunct authorizing an insert purely
because you created the conversation. It constrains nothing about the row —
not `user_id`, not *when*. The August 7 hardening fixed the **self**-add branch
after a verified production attack and left the **creator** branch alone. The
creator branch is the one that lets you add *someone else*.

Reachable only by direct PostgREST insert — the app adds participants at
creation only, and no add-participant-later flow exists. That bounds who likely
used it; it does not bound who can.

→ Migration `20260819070000` written, **not applied**. Fixes golf and baseball.

> **My first version of this fix would have broken all messaging, and your own
> test caught it.**
>
> The guard has to ask "does a participant other than the creator already
> exist?" — a question about the table the policy is *on*. I wrote it as an
> inline subquery. An RLS policy that reads its own table recurses, and Postgres
> then answers `infinite recursion detected in policy` for **every** query
> against that table, not just the branch that needed it.
>
> `src/test/schema/no-self-referencing-rls-policy.test.ts` fired within a
> minute. That test exists because the identical failure is already in your
> baseline — `baseball_team_members_select` carries a subquery over its own
> table, production was patched out of band, and the fix went uncommitted for
> months. Rewritten to use a `SECURITY DEFINER` helper, the established escape.
>
> Worth noting what would *not* have caught it: typecheck, the unit suite as I
> was running it, and review. Applying it to production would have been the
> discovery mechanism.

### 2. 98% of live rounds are deletable by any staffed coach

341 of 349 rounds are currently deletable through a direct PostgREST call by any
coach, head or assistant, because three DELETE policies call the existence-only
`is_golf_team_coach()` instead of the role-aware `is_golf_team_head_coach()`.
Deleting a round cascades to shots, holes, reviews and stats cache. No
soft-delete, no export, no recovery.

**Two prior audits disagreed about whether to fix this**, and the disagreement
was worth resolving rather than voting on. One argued coaches need the broad
grant for a "delete the botched round and re-enter it" workflow. That workflow
does not exist — and is actively contradicted by
`FairwayRoundsLibrary.tsx:275`, where `showUnfinished = !isCoach` deliberately
hides the only discard UI from coaches.

What actually breaks if you ship it: **one account.** The single live
`assistant_coach` (Lynchburg Women's Golf) loses a capability the application
never invokes. 11 of 12 staff rows and 9 of 10 teams are unaffected.

→ Migration `20260819060000` written, **not applied**. Recommend shipping.

> ### ⚠️ This gap is now publicly described while still open
>
> Commit `ec96d9b8b`, pushed to the public repo tonight, states in its message:
> *"is_golf_team_coach() is existence-only (verified in prod), so any player
> could pick 'Assistant Coach' and read teammates' rounds and PII, delete roster
> rows."* A later commit (`c31cfb1d6`) redacted the working files, but a push
> cannot be retracted, and rewriting published history to hide a disclosure
> would be worse than the disclosure.
>
> **The honest exposure math, because the headline overstates it.** The attack
> the commit describes — *any player picks Assistant Coach* — is the one that
> was **prevented**; that is why the message exists. Self-selection of role was
> deliberately not shipped. What remains open is narrower: someone who already
> holds a staff row has more power than the role implies.
>
> Obtaining a staff row now requires a head-coach-minted, single-use invite
> code. So the realistic threat is an existing staffed coach acting
> deliberately, or a compromised coach account — not an anonymous reader of the
> commit log. Twelve staff rows exist; one is an assistant.
>
> **Net: priority up, panic down.** This moves from "review in the morning" to
> "first thing you apply," but it does not warrant applying an unreviewed RLS
> change to production overnight — with no clean-room replay available, that
> action carries more risk than the gap it closes.

### 3. Any coach can rotate a team's join code — DETAIL WITHHELD

### 4. Roster eviction has no safety net at all — DETAIL WITHHELD

> **Both of these are STILL UNFIXED as of 2026-08-19, and this repository is
> public.** Verified live against production the same day: two golf
> team-settings UPDATE policies still resolve through the role-blind coach
> predicate rather than the head-coach one.
>
> The mechanism, the exact predicates and the reproduction were removed from
> this published copy on purpose. Publishing a working recipe for a live
> privilege gap is not something an archive should do, and the numbering is
> left intact so the omission is visible rather than silent.
>
> Both are role-escalation gaps reachable only by an account that ALREADY holds
> a staff row — which now requires a head-coach-minted, single-use invite code.
> Twelve staff rows exist, one of them an assistant. So the realistic threat is
> a deliberate or compromised staffed coach, not an anonymous reader.
>
> Full text is retained in the owner's local packet. Restore it here once both
> policies are repointed, and delete this notice in the same commit.

### 5. Account deletion destroys a season of history

`DELETE /api/account/delete` cascades from `users` straight through
`golf_players → golf_rounds → shots/holes/reviews`. The pre-flight blocks on
three attribution tables; rounds are not among them, so **93 of 94 players**
reach the delete. One settings click, one confirm, irreversible.

Erasure and preservation are not actually in conflict here: the protected data
is distances, clubs, lies and scores, while the PII sits in `users` and three
*nullable* columns on `golf_players`. So the migration anonymizes the player and
keeps the de-identified record.

→ Migration `20260819050000` written, **not applied**.

### Also fixed and committed

- **Two admin endpoints** (`crm/send-email`, `debug-rollup`) authorized on
  `users.role === 'admin'`, making each a third authorization authority
  alongside the two that `require-super-admin.ts` exists to reconcile after the
  July 29 incident. Measured before tightening: 1 user has `role='admin'`, 0
  admins are absent from the allowlist — **nobody loses access**.
- **Three cron routes** compared the bearer secret with `!==`, which
  short-circuits at the first differing byte and leaks a prefix-match oracle.
  Moved onto the existing constant-time helper. More importantly, the coverage
  test *certified the leaky pattern as guarded* — its detector accepted any
  route that merely mentioned `CRON_SECRET` near a 401. That escape hatch is
  closed.
- **Four demo/debug scripts** delete real rounds with no target check, and two
  carry headers telling you to point them at production. They now refuse
  production without an explicit flag, failing closed on missing URL,
  unparseable URL, and prod-without-flag. Ships with 10 tests, because an
  untested guard reads as protection and nobody learns it never fired until the
  run that needed it.

---

## Has any of this actually been used?

The honest hole in every finding above is that they prove what the database
*would allow*, not what happened. So that got checked too.

**1. Conversation injection — no evidence of use, and this is a negative you can
trust.** All 53 golf participants and all 13 baseball participants joined within
5 seconds of their conversation being created. Zero late joins in either
product. The reason to believe it: `joined_at` has **zero nulls** in both
tables, so the instrument was capable of returning the opposite answer and
didn't. Had that column been sparse, the honest result would have been
"unanswerable," not "clean." The capability exists and has never been exercised.

**2. Join-code rotation — unanswerable, not clean.** No matching rows, but that
proves nothing, because no audit trail covers the action. See `audit_log` above.

**3. Roster eviction — the shape recurred, and attribution failed again.** Four
memberships on a single team flipped to `inactive` within about 40 seconds
yesterday afternoon (17:44:35, :39, :42, 17:45:13 UTC), having been created back
in February and March.

**This is not being called an incident, deliberately.** All four have null
`joined_at`, null `approved_at` and null jersey — never-onboarded rows. Bulk
deactivating those is at least as consistent with ordinary duplicate-roster
cleanup, which is active work in this repo, as with anything else. Several
sessions were live at that hour.

What it *is*: attribution attempted from every available direction and failed.
`approved_by` is null on all four. `admin_events` in the 17:40–17:50 window holds
four rows — two unrelated errors and two logins. `audit_log` is empty. The
August 5 shape recurred, and so did the inability to say who did it. **The
finding is not the four rows. It is that if they had been hostile, nothing could
tell you.**

**4. Team deleted by a departed creator — no.** All 10 golf teams have their
creator on staff. Whether one ever did is not determinable: a deleted team
leaves no row, and `audit_log` is empty.

---

## The meta-finding: every instrument was broken in the flattering direction

This is the part I'd want you to take away, because it changes how much to
trust *any* number in this directory.

**Eleven instruments produced confidently wrong results tonight. Every single one
failed toward a more interesting or more reassuring answer. None failed loudly.**

| instrument | what it did | direction of the error |
|---|---|---|
| `knip.json` | declared all of `src/app/**` an entry point, so nothing there could ever be reported | codebase looked **clean** (7 dead files → **86** once fixed) |
| table scanner v1 | line-based "mention" bucket | structurally incapable of finding anything |
| table scanner v2 | keyed on `.from('t')`, blind to 3 other access conventions | features looked **abandoned** — nearly reported a table with 5,646 live rows as dead |
| nav matcher | exact-match, blind to dynamic route segments | pages looked **unreachable** |
| `orphans:mounts` | name-keyed walk, broken by default-export naming | live components looked **dead** |
| my FK query | filtered on the final hop only | SET NULL chains looked like **CASCADE** |
| `reltuples` | `-1` means *never analyzed* in PG14+, not zero | 93 empty tables looked like **124**, including one with 17 rows |
| wrapper resolver | regex failed and silently returned the input unchanged | **every** feature looked buttonless — the maximally interesting answer |
| caller search | filtered to `.tsx`, so the `.ts` hooks tier was excluded; the binding is also renamed at import | a **fully wired** feature looked unwired |
| creator join | `golf_teams.created_by` holds a `golf_coaches.id`, not a user id | **10 of 10** teams looked like orphaned ownership |
| triage parser | required a column knip does not always emit; dropped 571 of 881 rows | **0%** of the thing it measured — from input that never held the test case |

The pattern is structural, not bad luck. **A tool that under-reports usage
manufactures findings, and findings feel like progress. A tool that
over-reports produces silence, which feels like failure and gets fixed
immediately.** So the failure mode that survives is the one that flatters
whoever is running it. Nobody investigates a clean result.

Two practical rules came out of this, both of which then caught further errors:

- **Distrust any reachability number without a sanity case** — a known-live item
  the tool is *required* to find, checked before the output is believed.
- **An all-or-nothing result from a differentiating question is a tool failure,
  not a finding.** The wrapper-resolution bug reported that *nothing* in golf
  has a UI control. A classifier that puts every item in one bucket has not
  classified anything. That rule caught the eighth defect before it reached this
  document.
- **A plausible-looking split is not evidence the classifier works.** The ninth
  defect slipped through precisely *because* the second rule had done its job:
  the corrected tool returned a believable 8-versus-3 distribution, which passes
  every heuristic designed to catch an implausible one. The sanity case has to be
  a specific known-live item the tool is required to find — not a shape judgment
  about the output. The attachment button was sitting visible in the message
  composer the whole time; nobody reached for it.
- **Assert on the sanity case; do not merely look for it in the output.** The
  eleventh defect is the sharpest of the night. A triage parser silently dropped
  571 of 881 input rows and reported **0%** of the thing it was measuring. The
  known-live item was not misclassified — it was **absent from the input
  entirely**, so the output was internally consistent and looked fine. Nothing
  that reads only the output can catch that. A one-line assertion ("this symbol
  MUST appear; print PASS/FAIL") caught it on the first re-run, and is the first
  defect tonight found by an automated check rather than by someone noticing an
  implausible number.

And note what actually caught these: not more careful versions of the same
query. A *different question*. The 5,646-row table was rescued by going to look
for its writer and stumbling onto its reader.

Five of the eight were mine.

---

## Dead code — what it actually is

The 86-file list is a starting point, not a deletion list. Classification is
still running; two limits are already known:

- knip cannot follow `next/dynamic`, and `golf/admin/page.tsx` uses it. ~40 of
  the 86 are golf admin components behind that page.
- an unreferenced file is equally consistent with *abandoned* and with *finished
  but never wired* — which, per you, is often the second.

**Classification is done — `DEAD_INVENTORY.md`, 85 files.** The split answers
your question directly:

| class | count |
|---|---:|
| **UNWIRED** — finished, works, never connected | **46** |
| SUPERSEDED — a newer implementation replaced it | 30 |
| ABANDONED — incomplete or obsolete | 5 |
| UNCERTAIN — instruments disagreed, do not act | 3 |
| ACTUALLY_REACHABLE — the tool was wrong | 1 |

**46 of 85 were built and never connected.** Not abandoned. Every UNWIRED entry
names its specific missing connection, and 31 skeptic corrections are listed
inline so you can see which parts of the analysis corrected themselves.

Two of the 46 are **transitive** — imported only by another unwired file, so
they need no fix of their own and come alive when their parent does. Expect
more of that shape; it inflates any dead-code count without adding work.

Three numbers moved after the skeptic passes, and the reasons are worth
knowing: `team-sg-baseline.ts` went UNWIRED → SUPERSEDED because the coach
control it would restore was **deliberately deleted on 2026-06-22** — wiring it
back would have silently reversed a product decision. `ComparativeBenchmarks` and
`DataFreshnessAlerts` went UNCERTAIN → UNWIRED once both skeptics found their
exact-match data sources sitting unread in `admin-data.ts`.

**One confirmed both-sides-dead pairing**, and a verifier tried hard to kill it
and couldn't: `golf_platform_metrics_daily` (never held a row) ↔
`actions/admin-bi-data.ts` (import-unreachable). The admin page *does* lazily
load a BI tab — the exact `next/dynamic` blind spot that would fake this — but
that tab does not import the file. Confirmed from the database side and the
import-graph side independently.

**Baseball**: 16 files / ~2,988 lines safe to delete, plus 3 partial deletions.
Not executed — deletion needs a clean tree, and four sessions were live in this
one. Ready for whoever picks it up.

**Two rate-limit modules are genuinely dead** — proven by parsing webpack source
maps from a real production build, not by grep. Three successor modules are live
across 33 files.

**Do NOT remove the five Capacitor packages.** Knip is literally correct that
they're unimported, and the actionable conclusion is the opposite:
`requireCapacitorPackage()` calls `fatal()` unconditionally, killing
`cap update ios` — which runs on every push to `main` on *both* Xcode Cloud and
CircleCI. Removing them breaks two independent pipelines.

---

## One thing I wired

`CoachIntelligenceCard` — a sortable per-coach effectiveness table (review rate,
avg response time, insights viewed, philosophy configured) — is now mounted in
the People tab.

It needed no new query, action or plumbing: `data.coachIntelligence` has been
computed on every admin page load since the monolith and read by **zero** mounted
components. The props were a field-for-field match. This is the shape of most of
the 43 UNWIRED items — the work is done, the last line is missing.

**Not visually verified.** No dev server, and the admin page needs a super-admin
session. Typecheck and the full suite pass; the render itself is unproven.

---

## What the never-audited surfaces looked like

Six waves ran after the main report was written, each aimed at a surface nobody
had examined. **Four came back healthy**, and that is worth as much as the
fixes:

| surface | result |
|---|---|
| cron idempotency | healthy — every writing cron idempotent by construction |
| realtime subscriptions | healthy — 20 published tables, RLS holds on all sensitive ones |
| offline / optimistic writes | healthy — replay re-authorizes, `status='in_progress'` blocks stale clobber |
| push (APNs/FCM) + Inngest | healthy — recipients re-resolved at send time; token reads fail closed |

Three real defects came out of them, all now fixed and committed:

1. **`scrubPii` scrubbed the envelope, not the fields with the PII** — and my
   first fix covered only Sentry, missing `error_logs` and `admin_events`.
   The stronger reason turned out to be operational: an address in a trace
   message mints a **new incident group per recipient**.
2. **The tracked-round guard failed open** — a failed count read was treated as
   "no tracked data", letting the draft writer overlay a round whose shots were
   being tracked elsewhere.
3. **An all-day class occurrence lost its final day** — the one busy-period push
   site of four that never got the `eventDaySpan` fix.

Plus one latent, deliberately not fixed: `process-sequences` sends Resend the
key `seq-{coach}-s{step}`, omitting the sequence id. A coach in two sequences at
the same step would have the second mail **silently deduped** — a missed send,
not a duplicate. Latent today (1 sequence, 0 coaches in more than one).

**The pattern across all six, and it is a finding about the audit rather than
the code:** the surfaces nobody had audited came back healthy, while the audited
ones produced the P0s. The plainest reading is that attention has been going
where problems were already known rather than where they were likely.

And they are healthy **by care, not by luck** — which is the part that makes the
reading trustworthy. `onCoachHelmRoundSubmitted` does not merely happen to avoid
the idempotency trap; it declines `idempotency` in favour of `concurrency` and
explains in a comment that a static per-round key would silently swallow a
coach's legitimate resubmission. The `device_tokens` read does not merely happen
to fail closed; it says so. Code that is accidentally correct does not document
the alternative it rejected.

Every defect that *was* found across the six waves sat in a **guard** — a
control that read as protection while missing the path that mattered.
`scrubPii` scrubbing the envelope. The coverage test certifying the leaky
comparison. The tracked-round check treating a failed read as a negative. The
one busy-period site of four that skipped the helper. That is a more useful
place to look than any particular subsystem.

---

## A 12-week-unapplied migration — and why you should NOT apply it

`20260528011000_harden_coach_insights_update_grants` is a pure
privilege-tightening migration that never ran. Neither revoke is in force. It sat
unapplied ~12 weeks, hidden by the migration-ledger gap.

**The obvious move is to apply it. Do not.**

The two halves of the finding resolve differently:

- **anon: not an exposure.** `golf_coach_insights` has RLS on with 6 policies,
  and **every one targets `authenticated`. Zero target `anon`.** The anon grants
  are inert — no permissive policy, nothing reachable through PostgREST. This
  half is a defence-in-depth gap only.
- **authenticated: a real but bounded capability.** A player may update their own
  insight rows (`coach_insights_update_player_own`), and the un-revoked column
  grants let them write `status`, `lifecycle_state`, `metadata`, `resolved_at`
  when the intended surface was `acknowledged_at` + `dismissed_at`. Own rows
  only; no tenancy crossing.

**Applying it breaks a live coach flow.** `dismissInsight`
(`intelligence-dashboard.ts:548`) runs under the user-scoped client and writes
`dismissed`, `status` and `lifecycle_state` — three of the five columns the
migration revokes. It would fail with 42501, which is *the same failure already
documented in the comment directly above that call*, where including
`updated_at` "made Postgres reject the whole statement before RLS was even
evaluated — dismissInsight always failed."

**Which is probably why it was never applied.** Twelve weeks unapplied looked
like the ledger gap hiding a migration. It reads better as someone hitting 42501
and backing out — and the ledger gap then hid the *decision*.

**The real answer is a third option: the migration is obsolete as written.** Its
intent is right; its mechanism cannot express it, because coaches and players
share the `authenticated` role and a column grant cannot tell them apart.

→ **Your decision.** The clean fix is the pattern already used elsewhere here:
route player-side mutation through a `SECURITY DEFINER` RPC that writes only the
permitted columns, then revoke direct UPDATE from `authenticated`. Coaches keep
`dismissInsight`; players lose direct write on `status`/`lifecycle_state`/
`metadata`. I have not written that migration — it is a design choice, not a
reconciliation step, and it is yours.

---

## The migration ledger: 32 → 2, fully mapped

All 32 unaccounted migrations are now resolved, **no unknowns left**:

| | n | |
|---|---:|---|
| STAMP | 26 | objects live, mechanical additive INSERT |
| FORWARD-FIX | 3 | needs a small migration, then stamp |
| **OBSOLETE** | 1 | the one above — neither stamp nor apply |
| permanent hold | 2 | deliberately unapplied by decision |

**"Zero" is the wrong target and worth saying plainly: two of these are held on
purpose** (the gate_secdef draft, the baseball legacy backfill). Anything
promising literal zero is proposing to apply a migration someone deliberately
held. The achievable target is **zero unexplained** — and that is now reached.

This is what gates the Supabase GitHub "Deploy to production" toggle, which
stays off while any file is unaccounted.

---

## What needs you

1. **Ship or hold the three unapplied migrations.** Recommendation: ship
   `20260819070000` (reproduced vulnerability, live data) and `20260819060000`
   (98% exposure, one account affected) first — both are self-contained.

   **`20260819050000` has an ordering requirement — do not apply it casually.**
   It widens `golf_players.user_id` to nullable, which flips the generated type
   from `string` to `string | null`, and 59 sites reference that column. Apply →
   regenerate types → typecheck → fix what surfaces → ship. Applying without
   regenerating leaves the database permitting a NULL the compiler still
   believes impossible, which turns a compile error into a runtime one.
2. **The 11 built-and-reachable-but-unused features** — a product decision, not
   an engineering one.
3. **Five "wire it" items** — `audit_log` first, then the Arccos connect
   surface, academic exclusions and coach blocked-time. The last two are already
   registered as features in your own admin manifest.
4. **What may an assistant coach do?** Join-code rotation, roster eviction and
   recruiting deletion all currently say "the same as a head coach."

---

## What nobody checked

Stated plainly because a partial pass that reads as complete is worse than one
that admits its edges.

- Historical use was checked (see above) and is answered for 2 of 4 gaps. The
  other 2 are **unanswerable rather than clean**, because `audit_log` is empty —
  that distinction is the whole point and must not be collapsed into "no
  evidence found."
- Nothing was reviewed for whether a *legitimate* actor performed the four
  roster deactivations. Attribution was impossible in both directions.
- No migration was applied or replayed — Docker unavailable, so no clean-room
  verification of any of the four.
- 82 overlapping RLS policy groups: not started.
- 18 REVIEW + 12 MEDIUM privileged RPCs: not individually read.
- The "entry exists" verdict was *transitive* when first produced — a nav-listed
  page merely appearing in the import chain. That gap was closed: each of the 8
  now names an actual write control (file:line). Two paths inside otherwise-wired
  tables remain unreachable (`confirmSelection`, `bulkSetIntent`).
- "GATED: 0" is absence of evidence. Runtime conditions were never evaluated, so
  a feature behind a never-true flag would not have surfaced.
- `next build` compiles clean, but prerender could not run in the worktree
  (no env file). Verified instead that all five changed routes emitted, and that
  the constant-time compare is present in the shipped cron bundles.
