# Overnight Remediation — Protocol & Ledger

Branch: `overnight/remediation-2026-08-18`
Worktree: `~/worktrees/helmv3/overnight-remediation` (OUTSIDE the repo)
Base: `46f286555`
Started: 2026-08-18 23:28 EDT

---

## 0. THE INVARIANT — golf player data is untouchable

Owner instruction, verbatim: *"you cannot delete players round or shots in
golfhelm. Protect at all costs."*

### Baseline, measured 2026-08-19 02:56 UTC

| Table | Rows | Newest row |
|---|---:|---|
| `golf_rounds` | **348** | 2026-08-19 02:54:04Z |
| `golf_shots` | **24,526** | 2026-08-18 02:49:26Z |
| `golf_holes` | **6,174** | 2026-08-19 02:54:06Z |
| `golf_players` | **94** | 2026-08-17 12:22:52Z |
| `golf_round_reviews` | **101** | 2026-08-18 11:26:04Z |

`golf_rounds` and `golf_holes` were written ~4 minutes before the baseline, so
counts should only ever GROW. **A decrease is an incident, not a discrepancy.**

### Hard rules for this run

1. **No migration authored tonight may contain** `DROP TABLE`, `TRUNCATE`,
   `DELETE FROM`, or `DROP COLUMN` against `golf_rounds`, `golf_shots`,
   `golf_holes`, `golf_players`, `golf_round_reviews`, or any table whose name
   begins `golf_round`/`golf_shot`.
2. **No FK change may introduce `ON DELETE CASCADE`** into a chain that can reach
   those tables. An index addition is safe; a constraint change is not, without
   tracing the full cascade graph first.
3. **No `supabase db reset`, `db push`, or seed script may target production.**
   Docker is unavailable, so local reset is blocked anyway — but the dual
   config-root hazard (`supabase/config.toml` vs
   `tools/continuous-improvement/supabase/config.toml`) means a command can
   silently pick the wrong project. Print project identity before any DB write.
4. **Dead-code removal must not delete a guard.** Before deleting anything whose
   name matches `guard|authz|rls|policy|validate|verify|protect`, prove it is
   unreferenced AND that removing it does not widen access.
5. **Re-measure after every wave.** The counts above are the instrument. If any
   drops, STOP the entire run, do not commit, and report immediately.

### Verification query (run after every wave)

```sql
SELECT 'golf_rounds' t, count(*) FROM golf_rounds
UNION ALL SELECT 'golf_shots', count(*) FROM golf_shots
UNION ALL SELECT 'golf_holes', count(*) FROM golf_holes
UNION ALL SELECT 'golf_players', count(*) FROM golf_players
UNION ALL SELECT 'golf_round_reviews', count(*) FROM golf_round_reviews
ORDER BY 1;
```

---

## 1. THE LOOP — this does not terminate on its own

Owner instruction: *"After everything is done ... re-audit, find stuff you
forgot, and then run another wave of fixes. We're going to keep looping and
iterating until I say to stop."*

```
WAVE N
  ↓
execute the queue (write work serial, investigation parallel)
  ↓
re-measure the golf invariant  ──── drop? → STOP, report
  ↓
run gates on the branch
  ↓
RE-AUDIT ← the step that is easy to skip and must not be
  ↓  ask specifically: what did wave N MISS?
  ↓  · what did the fixes themselves introduce?
  ↓  · what surface has still never been read?
  ↓  · which "verified" claim rested on a stale premise?
  ↓
new findings → append to queue as WAVE N+1
  ↓
if queue empty → widen the aperture (a surface never audited,
                 a dimension never run) and re-audit again
  ↓
WAVE N+1 ... continue until the owner says stop
```

**The loop never self-terminates.** An empty queue is not a finish line — it
means the next audit needs a wider aperture, not that the work is done.

### Re-audit must attack the fixes, not just re-scan the repo

Each re-audit wave asks a fresh skeptic:

- Would this regression test actually fail against the *old* code?
- Can this auth fix be bypassed by a path the fixer did not consider?
- Did this deletion remove something dynamically reachable?
- Did this consolidation change behavior at a call site nobody checked?
- Is this "already fixed" claim resting on a premise that has since moved?

---

## 2. Wave ledger

| Wave | Scope | Status |
|---|---|---|
| 0 | Stash preservation, worktree, baseline | **DONE** |
| A | Security (admin auth, cron auth, golf IDOR) | in progress |
| B | Correctness (proximity units, UA, putts) | queued |
| C | Dead code | queued |
| D | Duplicate consolidation | queued |
| E | Config | queued |
| F | Docs / agent authority | queued |
| G | Repo physical | queued |
| H | repo:doctor | queued |
| I | DB investigation (read-only) | parallel |
| J | DB security audit (read-only) | parallel |
| K | DB performance | queued |
| L | CI investigation | parallel |
| M | Missed-surface audits | parallel |
| N | Dependency / secrets | queued |
| O | Clean-room — **BLOCKED: no Docker** | blocked |
| RE-AUDIT | attack waves A–N, find the gaps | **then loop** |

---

## 3. Wave 0 — completed

**Stashes preserved two ways** (the plan asked for one):

| Stash | Patch | Pinned ref |
|---|---|---|
| `stash@{0}` | 34,775 B | `refs/preserved/stash-0` → `4f7b2aaf2` |
| `stash@{1}` | 73,297 B | `refs/preserved/stash-1` → `4026457e4` |
| `stash@{2}` | 436,884 B | `refs/preserved/stash-2` → `03202ed30` |

Pinning to real refs is stronger than patch files alone: `gc` can no longer
reach these objects regardless of reflog expiry, so the 6-day clock on
`stash@{2}` is off permanently.

**Worktree** created outside the repo, `node_modules` symlinked for read-only
use. `.env*` deliberately **not** symlinked — that is INFRA-08, the sandbox side
door.

---

## 4. Named blockers

| Blocker | Effect | Status |
|---|---|---|
| **No Docker** | `supabase start` / `db reset` unavailable → Wave O clean-room replay cannot run | HARD |
| **Public repo** | security findings cannot be committed as prose until fixed | policy |
| **Live production** | all DB work read-only except reviewed forward migrations | policy |
| **3 peer sessions** | main checkout is being written continuously; all my writes go to the worktree | managed |

---

## Wave status — 2026-08-19 04:55Z

**Worktree:** `~/worktrees/helmv3/overnight-remediation`
**Branch:** `overnight/remediation-2026-08-18` — **LOCAL ONLY, never pushed.**

### DO NOT PUSH THIS BRANCH YET

The repo `njrini99-code/helmv3` is PUBLIC. Two migrations are written and
unapplied, and several intermediate commit messages describe those unfixed
defects in more detail than the files themselves now do (the file headers were
redacted in `fd3188307`).

**Apply the migrations first, or squash the branch before pushing.**

### Commits (8)

| sha | what |
|---|---|
| `449dce145` | two admin endpoints -> canonical super-admin gate |
| `5c454be24` | knip config: `src/app/**` was declared entry, hiding 79 dead files |
| `01330c616` | 3 protective golf changes - 2 migrations + script guard, NONE APPLIED |
| `1e69d7f3e` | 3 cron routes off non-constant-time `!==`; coverage test tightened |
| `2ff9f7e33` | prod-target guard wired into 4 destructive scripts + 10 tests |
| `d65df6d6d` | participant-insert bound to creation time - NOT APPLIED |
| `fd3188307` | exposure detail removed from the two migration headers |
| `6459797fd` | stale auth-gate comment in `crm-templates.ts` |

### Verification actually run

- unit suite - **1,111 files / 10,397 tests / 0 failures**
- `tsc --noEmit` - exit 0, re-run after every change
- cron suites 7/7 - guard suite 10/10
- production build - **compiled successfully** in 3.2min. Prerender fails in the
  worktree only, for want of an env file. Verified past that instead: all five
  changed routes emitted, and `timingSafeEqual` is present in the shipped cron
  bundles. First attempt exited 134 = OOM, not a compile error;
  `--max-old-space-size=8192` cleared it.

### Unapplied migrations awaiting the owner

| file | what |
|---|---|
| `20260819050000` | golf history survives account deletion (anonymize, don't cascade) |
| `20260819060000` | round/shot/hole DELETE -> head coach only |
| `20260819070000` | participant insert bound to creation time (golf + baseball) |

### Deliverables

`OVERNIGHT_REPORT.md` is the one to read. Supporting: `GOLF_UNWIRED.md`,
`FORENSIC_HISTORY.md`, `DEAD_OBJECTS.md`, `DEAD_BASEBALL_CODE.md`,
`PRIVILEGED_RPC_MANIFEST.md`, `MIGRATION_RECONCILIATION.csv`, `FINDINGS.md`.

### Protected data — the invariant held

Baseline 348 / 24,526 / 6,174 -> close **349 / 24,526 / 6,192**. Growth only.

### Explicitly not started

82 overlapping RLS policy groups - 18 REVIEW + 12 MEDIUM privileged RPCs -
baseball dead-code deletion (16 files / ~2,988 lines, inventoried, needs a clean
tree) - no migration applied or replayed anywhere (no Docker available).

---

## Wave ledger — tick 2026-08-19 01:06 EDT

**Golf invariant: 350 / 24,526 / 6,210 / 94 / 101.** Baseline 348 / 24,526 /
6,174 / 94 / 101. Rounds +2, holes +36, shots flat, players and reviews
unchanged. **All growth or flat — no incident.**

Shots flat beside growing holes is explained and not chased: `submit_round_atomic`
deletes and re-inserts shots for a round inside one transaction, and a
scores-only round produces holes with no shots by design. Either shape gives
exactly this.

### Completed this tick

- **WAVE: Supabase Storage** (surface never previously examined). Bucket config
  and upload paths were mine; 38 held the policy inventory and we de-conflicted
  rather than duplicating.
  - `course_images_authenticated_insert` is, in full,
    `WITH CHECK (bucket_id = 'course-images')` — no path, no owner, no course
    relationship, on a PUBLIC bucket. Open image-hosting on the project domain
    for anyone with an account. → migration `20260819080000`, unapplied.
  - The bucket's single existing object is already an **orphan** — its
    `golf_courses` row is gone and the image still serves. My own "no existing
    object is invalidated" claim was wrong and the migration records the
    correction.
  - **Storage INHERITS the P0 rather than having its own flaw** (38's finding):
    all four `recruit_documents_coach_*` policies and `documents_select_team_scope`
    gate on the same existence-only `is_golf_team_coach`. One fix closes the DB
    side and the storage side together — recruit documents hold uploaded files
    for high-school recruits who are largely minors, and a read already taken is
    not undone by a later policy fix.
  - `golf-attachments` scopes on `user_conversation_ids(auth.uid())`, which reads
    `golf_conversation_participants` — so the participant-injection defect also
    reached conversation FILES, not only message text. Escalates that finding.
    Bucket currently holds 0 objects, so the capability existed and no file was
    exposed.

- **DISCLOSURE, escalated by cb and verified by me.** Public commit `ec96d9b8b`
  describes the still-open delete gap in actionable detail. Redaction landed
  after the push and cannot retract it. Exposure re-assessed honestly: the
  attack the message describes is the one that was *prevented*; obtaining a
  staff row now needs a head-coach-minted single-use code. Priority up, panic
  down — first thing to apply, not something to apply blind overnight.

### Migration count, corrected

**4 unapplied (mine, this branch) + 2 applied-and-deployed (staff-join, in main
and in production).** Do not describe the latter as pending — acting on that
would try to create tables that already exist.

### Next wave

Cron idempotency (21 routes doing bulk writes; auth was fixed tonight,
re-entrancy never examined), then observability/PII in logs, then timezone and
date semantics.

### Peers

38 idle, deliverables confirmed final. cb complete and deployed, nothing
blocked. 24 holding pending its own owner's scope decision — correctly declined
to enrol deeper on my say-so, which is the right boundary.

---

## Wave ledger — tick 2026-08-19 01:40 EDT

**Golf invariant: 351 / 24,526 / 6,228 / 94 / 101.** Baseline 348 / 24,526 /
6,174. Rounds +3, holes +54, shots flat, players and reviews unchanged. All
growth or flat — **no incident**.

### Completed this tick — WAVE: cron idempotency

22 cron routes swept for re-entrancy. Auth was fixed earlier tonight; whether a
double-run duplicates work had never been asked.

**The headline is a negative, and it is worth as much as a positive one: the
surface is healthy.** Every writing cron is idempotent by construction.

| route | guard |
|---|---|
| `process-sequences` | compare-and-swap lease claimed BEFORE the send, plus a Resend `Idempotency-Key` |
| `event-reminders` | `UNIQUE (event_id, user_id, notification_type)` + `ignoreDuplicates`; records only sends that succeeded |
| `ingest-gmail-replies` | upsert `onConflict: message_id` on both reply tables |
| `v3/causality-attribute` | anti-joins the attribution table; weights upserted on a 3-col conflict |
| `v3/ingest-sync` | writes only to an append-only log |
| `log-retention` | deletes — idempotent by nature |

**Two findings.**

1. **Fixed** — `suppressBouncedEmail` was check-then-write. `UNIQUE (email,
   reason)` prevented the duplicate, so data was never wrong; the losing race
   raised 23505, which the catch swallowed and reported as *"bounce suppression
   failed"*. A benign race manufacturing a false error, in a queue already
   mostly not-errors. Now upsert-with-ignoreDuplicates.

   The near-regression is the instructive part: the caller **counts** true
   returns as `suppressed`. My first version returned true unconditionally,
   which would have inflated that figure on every re-run while the suppression
   itself stayed correct — a reporting drift nothing would have caught. Fixed
   with `.select('id')`, so a non-empty result means exactly "a row was
   inserted."

2. **Latent, not fixed** — `process-sequences` sends Resend the key
   `seq-{coach}-s{step}`, omitting the sequence id. A coach enrolled in two
   sequences at the same `step_order` would have the second mail silently
   deduped: a *missed* send, not a duplicate. Latent today (1 sequence, 0
   coaches in more than one); real the day a second sequence ships.

Also noted in place: `webhooks/resend/route.ts`'s `suppressEmail()` still has
the old check-then-insert shape and the same benign race. Separate path, own
callers, not touched.

### State

12 commits. 4 migrations unapplied (mine) + 2 applied-and-deployed (staff-join).
typecheck 0, 1,111 files / 10,397 tests / 0 failures.

### Next wave

Observability and PII in logs — `logServerError` is called from ~460 sites and
this tick already surfaced one path logging a bare email address into the error
stream. Then timezone/date semantics.

---

## Wave ledger — tick 2026-08-19 02:40 EDT

**Golf invariant: 351 / 24,526 / 6,228 / 94 / 101.** Baseline 348 / 24,526 /
6,174. Flat against the previous tick, above baseline on every column. **No
incident.**

### Completed this tick — WAVE: observability / PII in logs

**Finding: `scrubPii` scrubbed the envelope, not the fields that hold the PII.**

Both Sentry `beforeSend` hooks — server (`instrumentation.ts:61`) and client
(`instrumentation-client.ts:85`) — scrubbed cookies, `Authorization` headers and
the query string. Neither touched `message`, `extra`, `contexts`, breadcrumbs or
exception values.

Those are the fields this app puts addresses in. **11 files send a raw email to
Sentry**, a third-party processor:

| site | shape |
|---|---|
| `lib/auth/send-password-reset.ts` | `password reset send failed for {email}` |
| `golf/actions/task-reminders.ts:905,910` | `Failed to send email to {email}` |
| `api/webhooks/resend/route.ts` ×2 | `Failed to suppress {reason} for {email}` |
| `api/cron/ingest-gmail-replies:577` | `bounce suppression failed for {email}` |
| **`baseball/actions/auth.ts:320,471`** | **`metadata: { email, ip }`** |
| `baseball/actions/onboarding.ts:445` | same |

The bolded shape is the one that matters: an email alone is ordinary telemetry
and so is an IP; **the pair, on a login/signup failure path, identifies a person
and where they were.**

**Fixed centrally**, in `beforeSend`, not at the 11 call sites — fixing 11 sites
fixes 11 sites, and the 12th gets written by someone reasonably assuming a
function called `scrubPii` scrubs PII.

Masks rather than drops: `nick@example.com` → `n***@example.com`. The domain is
usually the diagnostically useful half (bounce problems cluster by domain); the
local part is the identifier. **The IP is deliberately left intact** — alone it
is operational data and losing it would remove the ability to investigate
credential stuffing. Masking the address is what breaks the pair.

14 tests, written against the real message shapes from the real call sites. All
fail against the old code, which applied no masking at all.

**This is the same shape as the cron coverage test earlier tonight**: a control
that reads as protection while missing the path that matters. A function named
`scrubPii` is precisely the thing nobody re-reads.

### State

13 commits. 4 migrations unapplied (mine) + 2 applied-and-deployed (staff-join).
typecheck 0, 1,112 files / 10,411 tests / 0 failures.

### Next wave

Timezone and date semantics. Prior art says this repo has been bitten here —
`golf_events.end_time` is an INCLUSIVE last day at UTC midnight and six surfaces
once ignored it, producing an off-by-one-day. Targets: `due_date` comparisons
(golf DATE vs baseball TIMESTAMPTZ), cron window boundaries, and anything doing
date math in the server's timezone rather than the team's.

---

## Wave ledger — tick 2026-08-19 03:40 EDT

**Golf invariant: 351 / 24,526 / 6,228 / 94 / 101.** Baseline 348 / 24,526 /
6,174. Flat against the previous two ticks, above baseline throughout. **No
incident.**

### Completed this tick — WAVE: timezone / date semantics

**Finding: the fourth busy-period push site never got the fix the other three
did.**

`getUserBusyPeriodsWithStatus` has four `busyPeriods.push` sites. Three route
through `eventBusyInterval`, which branches on `all_day` and expands the span in
the team's zone. The fourth — the player's own class occurrences — read
`new Date(event.end_time)` directly.

`golf_events.end_time` on an all-day row is UTC midnight on the **inclusive**
last day, so the raw form ends the block a day early. That is the
one-day-early bug #1493/#1494/#1495 each hit in turn. This site was missed
because it is the only one that does not go through the helper.

The zone is load-bearing: for an Eastern team the naive end lands at 20:00 the
*previous* evening, so the player reads as **free at 2pm on a day they are in
class**, and the conflict checker lets a coach schedule over it.

**Latent, not live** — 0 of 1,589 class events carry `all_day`, and for a timed
event the raw form is correct. Closed before the first all-day class exists.

Also added the window trim the three siblings already had: `teamEvents`
over-fetches 39h before `timeMin` to catch multi-day events, and the class loop
was the only one not trimming after.

**The test was proven to discriminate, not just to pass.** Re-run against the
pre-fix code, 2 of 4 cases FAIL — including *"still covers a moment in the
middle of the final day"*, which models the real symptom. The other 2 pass
either way by design: one asserts a class period exists at all, the other pins
that timed occurrences are untouched.

### State

14 commits. 4 migrations unapplied (mine) + 2 applied-and-deployed (staff-join).
typecheck 0, 1,113 files / 10,415 tests / 0 failures.

### Next wave

Realtime subscriptions and offline/optimistic writes — neither examined. The
realtime channels carry conversation and roster data whose RLS was found
defective tonight, so the question is whether a subscription re-checks
authorization or trusts the initial grant. Offline writes matter because a
queued mutation replayed after a permission change is the same
correct-at-bootstrap/wrong-afterwards shape found in the participant policy.

---

## Wave ledger — tick 2026-08-19 04:40 EDT

**Golf invariant: 351 / 24,526 / 6,228 / 94 / 101.** Baseline 348 / 24,526 /
6,174. Flat across four ticks, above baseline throughout. **No incident.**

### Completed this tick — WAVE: realtime subscriptions

**Realtime is not a leak vector.** 20 tables are in `supabase_realtime`,
including `admin_events`, `emails`, `email_events`, `email_clicks` and
`golf_rounds`. Every sensitive one is admin-gated for SELECT; `golf_rounds` is
own-player-or-team scoped. RLS holds on the subscription path. A useful
negative.

Noted in passing: `admin_events` reads gate on `users.role = 'admin'` rather
than `is_super_admin()` — the same third authority consolidated away elsewhere
on this branch. Not a leak (1 user holds the role and is in the allowlist), but
the same divergence.

### The sweep found a hole in MY OWN fix from the previous wave

The PII work two ticks ago masked the **Sentry path only**. `logServerError`
writes the same message to `error_logs` and `admin_events` — and `admin_events`
is realtime-published. The unmasked text reached two tables and a websocket that
`beforeSend` never touched.

Masking now happens **once at the single fan-out boundary**, so every downstream
sink gets it. The `beforeSend` hooks become defense-in-depth for events that
never pass through `logServerError` (RSC render errors, console captures).

**The stronger reason turned out to be operational, not privacy.** `message`
feeds `buildIncidentSignature`. A raw address inside it mints a **new incident
group per recipient** — precisely the Cloudflare Ray ID fragmentation that
`collapseEmbeddedHtml` exists to stop, one paragraph above it in the same
function.

**And I got the first version wrong.** I wrote a comment claiming the mask fixed
fingerprint fragmentation, then checked: it does not. `a***@school.edu` and
`b***@school.edu` are still different strings, so they still hash to two groups.
Two redactions are needed and one form cannot do both jobs — the stored message
keeps the readable mask, the fingerprint gets a fully collapsed `<email>`. A
test pins the two functions as **distinct** so nobody merges them later.

Deliberately untouched: `admin_events.user_email`. That column stores the
acting user's address on purpose, admin-only, pruned by retention. A design
decision, not leakage. This masks free text, never the columns built to hold
identity.

### State

15 commits. 4 migrations unapplied (mine) + 2 applied-and-deployed (staff-join).
typecheck 0, 1,113 files / 10,418 tests / 0 failures.

### Next wave

Offline / optimistic writes (`src/lib/offline/` — `sync-engine.ts`,
`indexed-db.ts`, `shot-storage.ts`, `partial-save-beacon.ts`). The question is
the one that keeps recurring tonight: a mutation queued offline and replayed
after a permission change is the same correct-at-bootstrap / wrong-afterwards
shape as the participant policy. Shot storage also sits directly on the
protected data, so replay semantics matter more here than anywhere else swept
so far.

---

## Wave ledger — tick 2026-08-19 05:40 EDT

**Golf invariant: 351 / 24,526 / 6,228 / 94 / 101.** Baseline 348 / 24,526 /
6,174. Flat across five ticks, above baseline throughout. **No incident.**

### Completed this tick — WAVE: offline / optimistic writes

This wave sat directly on the protected data, so it got the closest reading of
any surface swept.

**The replay path is sound**, and the negatives are most of the value:

- the offline layer **never deletes server data** — all three `cursor.delete()`
  calls are IndexedDB-local
- replay goes through the `saveRoundDraft` **server action**, not a raw client
  insert, so authorization is re-evaluated at replay time rather than trusted
  from when the write was queued
- `player_id` is **derived server-side from `auth.uid()`**, never read from the
  client payload — a replayed draft cannot be written against another player
- the update carries `.eq('player_id')` **and** `.eq('status','in_progress')`,
  so a stale replay **cannot overwrite a round that has since been submitted**;
  it matches zero rows

That last guard directly answers the question the wave opened with: a mutation
queued offline and replayed after the round completed cannot clobber it.

**One real defect, fixed.** `hasTrackedRoundData` gates whether the legacy draft
writer may overlay `draft_data` onto a round. On a **count error** it returned
`false` — "no tracked data" — and the overlay proceeded. A failed lookup is
UNKNOWN, not a negative, and this failed **open** on the one path it exists to
guard, precisely when the database was already misbehaving.

The asymmetry decided the direction: a false positive skips one autosave and the
next proceeds seconds later; a false negative overlays draft state onto a round
whose shots are tracked elsewhere. Now fails closed, and logs at warning so the
case is observable rather than silent.

Four tests, **proven to discriminate** — re-run against the fail-open code, the
two error-path cases fail. The other two pass either way by design: one pins
that a genuinely tracked round is still skipped, the other that genuinely-zero
counts still WRITE, because failing closed must not quietly become failing
always.

### State

16 commits. 4 migrations unapplied (mine) + 2 applied-and-deployed (staff-join).
typecheck 0, 1,114 files / 10,422 tests / 0 failures.

### Next wave

Push notifications (APNs/FCM) and Inngest jobs. Neither examined. Push matters
because a device token that outlives a roster change is the same
correct-at-bootstrap shape found three times tonight — and the peer session
already landed a push-token teardown, so the question is whether teardown covers
removal as well as sign-out. Inngest because durable retries and cron
idempotency are the same class of question, and the cron half came back healthy.

---

## Wave ledger — tick 2026-08-19 06:40 EDT

**Golf invariant: 351 / 24,526 / 6,228 / 94 / 101.** Baseline 348 / 24,526 /
6,174. Flat across six ticks, above baseline throughout. **No incident.**

### Completed this tick — WAVE: push notifications + Inngest

**Both healthy. No code change needed.** The wave opened on a real suspicion —
that a device token outliving a roster change is the same correct-at-bootstrap
shape found three times tonight. It is not:

- push recipients are re-resolved from `golf_team_members` with
  `status = 'active'` **at send time**, so a removed player drops out of the
  recipient list immediately and a surviving token is harmless
- the `device_tokens` read filters `active = true` **and** explicitly refuses to
  treat a failed read as "no devices" — fail-closed, with a comment saying so
- Inngest has 2 functions, both served. `onCoachHelmRoundSubmitted` deliberately
  uses `concurrency` rather than `idempotency`, because a static per-round key
  would silently swallow a coach's legitimate resubmission inside Inngest's
  ~24h window — the same trap flagged in the Resend sequence key two waves ago,
  reasoned correctly here and documented

### The actionable output: two more knip false positives

`weeklyHealthPing` and `onCoachHelmRoundSubmitted` are in knip's unused-exports
list. Both are live — collected into `export const functions = [...]`
(functions.ts:148) and served by `/api/inngest`.

**Third instance of one trap**, and it generalises further than first stated.
The first was a *barrel re-export*; these are a plain *array literal acting as a
registry*. So the rule is not "resolve barrels" but: **before believing any
unused-export claim, check whether the symbol is gathered into an aggregate
anywhere in its own file.** Recorded at the top of `DEAD_INVENTORY.md`, with the
caveat that the 881 unused-EXPORTS and 2,249 unused-TYPES lists were never
triaged and are almost certainly full of this. The 46 UNWIRED **files** were
each checked individually and do not rest on it.

### Four negatives in a row

cron idempotency · realtime · offline replay · push/Inngest. Folded into
`OVERNIGHT_REPORT.md` as its own section, with the observation that matters:
**the surfaces nobody had audited were in better shape than the ones that had
been**, and every defect found in six waves was in a *guard* — a control that
read as protection while missing the path that mattered.

### State

16 commits. 4 migrations unapplied (mine) + 2 applied-and-deployed (staff-join).
typecheck 0, 1,114 files / 10,422 tests / 0 failures.

### Next wave

Caching and invalidation. Never examined, and it is the natural successor to
this one: every mutation in this repo is expected to call `revalidatePath()`,
and a missed call is invisible — the write succeeds, the test passes, and the
user sees stale data. Same failure signature as the guards found this tick.
Targets: server actions that write without revalidating, `unstable_cache` /
`revalidateTag` usage, and any read path memoised across a request that outlives
its own mutation.
