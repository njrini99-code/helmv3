# Round submit / partial save failures — 2026-08-20

**Status:** root cause confirmed against production. One player's round was
destroyed. Fixes below.

**Anchor SHA:** `8dd56c3ae` (run `git rev-list --count 8dd56c3ae..HEAD -- 'src/**'`
to see how far this has drifted).

---

## Summary in one line

`src/lib/supabase/server.ts:43` aborts every HTTP request at **10s**, but
`submit_round_atomic` and `save_partial_round_atomic` set their own
`statement_timeout` to **30s / 20s**. The client gives up while Postgres is
still working — and Postgres then **commits successfully**. The app, believing
the submit failed, runs a DELETE-then-INSERT "fallback" over a round that was
already saved correctly, and wipes it.

The comment on that line — `// 10s HTTP abort — DB statement_timeout is 8s, so
DB error bubbles up first` — is true for ordinary PostgREST queries and **false
for exactly the two functions in the round-submit path**.

---

## The confirmed data loss

Round `8e89c73e-5047-4658-85b4-380250dc6245`
(player `3059fe37-2f16-4c5f-a4a4-e8c9601dcf44`, **James Peach —
`jpeach@guilford.edu`**, Bryan Park Champs, round dated 2026-08-19):

| field | value |
|---|---|
| `status` | `completed` |
| `total_score` | `72` |
| `golf_holes` | **0** |
| `golf_shots` | **0** |
| `draft_data` | **NULL** |

18 holes and 72 shots entered by hand over ~30 minutes are gone. The round is
also **un-resubmittable**: `submit_round_atomic` opens with

```sql
PERFORM 1 FROM golf_rounds
 WHERE id = p_round_id AND player_id = v_player_id AND status != 'completed';
IF NOT FOUND THEN RETURN ... 'Round not found, already completed, or no permission.'
```

so a retry is rejected on `status='completed'`. The row is bricked in place.

Round `97f25c32-fb1d-43bb-aa35-253414f8bc38` — a **different** player,
**Charley Robinson (`crobinson3@guilford.edu`)**, ~45 min later — hit the
identical failure but survived with 18 holes / 76 shots intact, only because
its fallback died at the *clearing* step instead of after it.

> **Do not confuse these two.** Both players are on the same Guilford roster and
> played the same course the same evening, and an early draft of this document
> attributed the wiped round to Robinson. It is **Peach's** round that was
> destroyed; Robinson's survived. Two other sessions picked up the wrong
> attribution from that draft before it was corrected — if a report reaching the
> owner says Robinson lost a round, it is wrong.

**Blast radius — checked, not assumed.** Exactly one round platform-wide is in
this state. Every other `status='completed'` round in `golf_rounds` has holes:

```sql
select r.id from golf_rounds r
 where r.status='completed'
   and not exists (select 1 from golf_holes h where h.round_id=r.id);
-- → 1 row: 8e89c73e-5047-4658-85b4-380250dc6245
```

**Onset — this is new.** Across the last 30 days of `admin_events`, every
`TimeoutError` on a round path falls on 2026-08-19 (9) or 2026-08-20 (13).
Before 2026-08-19: zero. Submits were succeeding at ~1/day through late July and
early August with no timeouts at all. Something changed on the 19th; the
candidates are the six migrations stamped `20260819*` that landed that day.

**The difference between "lost the round" and "kept the round" was which
statement the lock timeout landed on.**

---

## Proof that the RPC committed

This is the load-bearing claim, so it is established by the function body, not
by timestamp arithmetic.

`submit_round_atomic` is the **only** writer that sets `draft_data = NULL`
together with `status = 'completed'`:

```sql
UPDATE golf_rounds SET ... status = 'completed', total_score = ...,
       draft_data = NULL, updated_at = NOW() WHERE id = p_round_id ...
```

The direct fallback's success path writes `draft_data` to
`{ submissionBackup: { ...usedDirectFallback: true } }` (`golf.ts:1183`) — and
that fallback **failed**, so it never ran. `persistRoundSubmissionBackup` had
already written a backup (`backupPersisted: true` in the `admin_events`
metadata), which means `draft_data` was non-null before the RPC.

`draft_data IS NULL` today is therefore only reachable if `submit_round_atomic`
ran to completion and committed. It did.

---

## Mechanism, step by step

Timeline for round `8e89c73e`, straight from `admin_events`:

| time (UTC) | event |
|---|---|
| 03:00:53 | `savePartialRound` — "user session expired mid-round" (hole 15) |
| 03:10:51 | `Auto-save RPC failed: TimeoutError` — hole 17, 18 holes / 65 shots |
| 03:11:35 | `Auto-save RPC failed: TimeoutError` — hole 18, 72 shots |
| 03:12:10 | `Auto-save RPC failed: TimeoutError` — hole 18, 72 shots |
| 03:17:52 | `Round submit RPC failed: TimeoutError` (severity **critical**) |
| 03:19:22 | `Direct round submit fallback failed: Fallback failed while writing shots: TimeoutError` (severity **critical**) |

1. `submit_round_atomic` is called. It is allowed 30s by its own `proconfig`.
2. The `fetch` in `server.ts` aborts at 10s. **Aborting an HTTP request does not
   cancel the Postgres backend** — the function keeps running and commits:
   round marked `completed`, 18 holes and 72 shots written, `draft_data` cleared.
3. The app sees only `TimeoutError` and treats it as a failed submit.
4. `attemptDirectSubmitFallback` runs (`golf.ts:1682`). It snapshots the holes
   and shots the RPC just wrote, then `DELETE FROM golf_shots`,
   `DELETE FROM golf_holes`, re-inserts 18 holes — and the shot insert aborts at
   10s, because the freshly-committed transaction and the still-running
   auto-saves are contending on the same rows.
5. `restoreSnapshot()` runs. It **deletes holes and shots again**, then its
   re-inserts also time out. Every one of those failures is swallowed:

```ts
} catch {
  // Best-effort rollback — the caller surfaces the ORIGINAL failure either way.
}
```

6. Final state: 0 holes, 0 shots, `status='completed'`, no draft, no backup.

The user saw *"Round submission hit a server error, but your round data was
preserved. Reload this round and try again. Do not re-enter it."* That message
was false. The data was not preserved, and reloading shows an empty round.

---

## The full incident list, reconciled

An earlier version of this document chased two rounds and generalised from them.
That under-reported the blast radius. Every group in the dashboard's incident
list, matched by fingerprint:

| fingerprint | sev | occ | rounds | what |
|---|---|---|---|---|
| `6b5a2567` | error | 15 | **8** | `Auto-save RPC failed: TimeoutError` |
| `836ce3b6` | error | 6 | **4** | `Auto-save failed: user session expired mid-round` |
| `fc744993` | critical | 2 | 2 | `Round submit RPC failed: TimeoutError` |
| `2d72640e` | critical | 1 | 1 | `Fallback failed while writing shots` — **the wipe** |
| `0bb6d640` | critical | 1 | 1 | `Fallback failed while clearing holes` |
| `943e1230` | error | 2 | — | the "your data was preserved" message shown to the player |
| `8445987c` | error | 2 | — | the raw `TimeoutError` from the submit RPC |
| `67108f38` | error | 1 | 1 | `Failed to persist round submission backup` |

**Eight rounds hit auto-save timeouts, not two — and all eight are Guilford
players on the same evening:**

| player | score | holes | shots |
|---|---|---|---|
| `jpeach@guilford.edu` | 72 | **0** | **0** |
| `lwise@guilford.edu` | 73 | 18 | 73 |
| `kcentenoglen@guilford.edu` | 78 | 18 | 78 |
| `sbedi@guilford.edu` | 85 | 18 | 85 |
| `crobinson3@guilford.edu` | 76 | 18 | 76 |
| `clynde@guilford.edu` | 74 | 18 | 74 |
| `lfalcone@guilford.edu` | 82 | 18 | 82 |
| `sslate@guilford.edu` | 76 | 18 | 76 |

Seven survived; one was destroyed. **This was a whole-team round session**, and
that is the load pattern the "why is the tail slow" section was missing: not
random slowness, but eight players on one roster auto-saving into
`save_partial_round_atomic` concurrently, each abandoned client-side at 10s while
still holding row locks server-side for up to 20s. The contention was
self-inflicted and predictable, and it will recur on the next team session.

### A second, separate failure in the same list

`836ce3b6` — *"Auto-save failed: user session expired mid-round"*, 6 occurrences
across 4 rounds — is **not** a timeout and is not explained by the timeout
inversion. `savePartialRound` calls `supabase.auth.getUser()` and gets `null`
(`golf.ts:5546`), so the save is refused before it reaches the database.

The idle timeouts do not explain it: `SESSION_IDLE_TIMEOUT_MS` is 8 hours and
`NATIVE_APP_SESSION_IDLE_TIMEOUT_MS` is 30 days
(`src/lib/auth/session-idle-shared.ts`), and a round takes four or five. The
likelier cause is a failed token refresh — these are golfers on phones, on a
course, with intermittent signal, which is exactly the condition a refresh round
trip fails under.

No data was lost to this on 2026-08-19/20: all four affected rounds finished with
their holes intact, because the final submit re-sends the whole round. But it is
a **latent** data-loss path, not a benign one — while the session is dead the
auto-save protection is simply absent, and a player who closes the app in that
window loses everything since their last successful save. It also returns
`'You must be signed in'` to a caller that is a background auto-save, so whether
the player is ever *told* their round has stopped saving is unverified and is the
thing worth checking next.

**This is not fixed.** It needs its own diagnosis.

## Why the tail is slow at all

`pg_stat_statements` (cumulative since last reset — a tail, not a current rate):

| function | calls | mean | max |
|---|---|---|---|
| `save_partial_round_atomic` | 4,888 | 107 ms | **19,445 ms** |
| `submit_round_atomic` | 164 | 291 ms | **14,693 ms** |

The mean is healthy. The tail is not, and the tail is exactly what the 10s abort
converts into user-visible failure. Contributors:

- **Row-by-row `FOR ... LOOP` inserts.** Both functions insert holes, shots,
  putt details and approach details one statement at a time. A full 18-hole
  round with 76 shots is ~100 individual `INSERT`s inside one transaction, each
  firing `golf_holes_recompute_round_totals` / `golf_holes_set_gir` /
  `update_updated_at_column`.
- **`PERFORM recalculate_round_strokes_gained(p_round_id)`** at the end of
  `submit_round_atomic`, inside the same transaction.
- **Auto-save pile-up.** Three auto-saves fired inside 80 seconds. Each was
  abandoned client-side at 10s but kept running server-side for up to 20s,
  holding row locks on the same `round_id` with `lock_timeout=10s`. Each new
  attempt contends with the last one's still-live transaction. This is
  self-amplifying: the slower it gets, the more overlap, the slower it gets.

---

## This is not a round bug

The same 10s cap truncates other server-side work that legitimately needs more
than 10s. Confirmed in the same window, from a parallel triage of the incident
export:

- `getTopInsightForPlayer.urgent failed (continuing without urgent pass):
  TimeoutError` — 7 events, 2026-08-19T23:58Z → 2026-08-20T03:48Z, `/golf/dashboard`
- `fetchShotDriversByCategory failed (continuing without shot drivers):
  AbortError` — 6 events, 2026-08-20T00:40Z → 03:12Z, `/golf/dashboard/coachhelm`

Both catch-and-continue, so the coach sees a dashboard quietly missing its
urgent insight and its shot drivers, with **no error at all**. Arguably worse
than the round case, because nobody reports it.

So this is a platform-wide client timeout budget set below what several
server-side operations need — not one RPC to special-case. A fix framed as
"raise the budget for submit" would leave the insight paths broken.

## Fixes, in the order they must land

### 1. Never run the destructive fallback on an abort — stops the bleeding

An abort means the transaction outcome is **unknown**, and as shown above it is
frequently *success*. Clearing and rewriting a round whose state you do not know
is what destroyed `8e89c73e`. On a timeout/abort the correct response is to
re-read the round and report — never to delete.

This is the change that matters most. It must land before the timeout change,
because raising the client's patience without it means *more* concurrent
transactions per round, not fewer.

### 2. `restoreSnapshot` must not fail silently

The three `nosemgrep: helmv3-destructive-write-pattern` suppressions in
`submitRoundDirectFallback` assert that "every failure path restores it".
Round `8e89c73e` is that claim falsified in production. The repo's own Review
Gate bans DELETE-then-INSERT in save/submit paths; this code suppressed the gate
on a premise that does not hold when the restore itself can time out.

At minimum the bare `catch {}` must log at `critical` with the snapshot it
failed to re-seat, so the data is recoverable from the log rather than gone.

### 3. Make the client abort exceed the DB budget for that call

State it as an invariant, not a number: **the HTTP abort must be longer than the
`statement_timeout` in force for that request**, so failures arrive as Postgres
errors the app can branch on (`57014`, `40P01`, a constraint name) instead of
aborts whose outcome is ambiguous.

Route-aware, mirroring the existing `STORAGE_TIMEOUT_MS` idiom in
`src/lib/supabase/client.ts:36`. Verified safe: no browser-side code calls
either RPC (both are reached only through server actions in
`src/app/golf/actions/golf.ts`), and no `maxDuration` is set on the golf
dashboard routes, so the outer Vercel function limit is not the binding
constraint.

### 4. Single-flight the auto-save per round

One in-flight `savePartialRound` per `round_id`; a new one either coalesces or
is dropped. This removes the pile-up that produces the tail in the first place.

### Follow-up, lower priority

Batch the row-by-row loops in both RPCs into set-based inserts
(`INSERT ... SELECT FROM jsonb_to_recordset`), and move
`recalculate_round_strokes_gained` out of the submit transaction. That attacks
the latency rather than the symptom.

---

---

## What has landed

Fixes 1–3 are implemented; 4 and the follow-up are not.

| # | Change | File |
|---|---|---|
| 1 | Abort-shaped RPC failures no longer trigger the destructive rebuild. The round is read back and reconciled instead. Guard sits inside `attemptDirectSubmitFallback` — one choke point all four call sites pass through, so it cannot be skipped by a future caller. | `src/app/golf/actions/golf.ts` |
| 2 | `restoreSnapshot`'s bare `catch {}` replaced: every stage's error is checked, and a failed restore logs `critical` **with the snapshot attached**, so the round survives in the log even when it cannot be re-seated. | `src/app/golf/actions/golf.ts` |
| 2b | The "your round data was preserved — do not re-enter it" message is now conditional on the backup actually having persisted. | `src/app/golf/actions/golf.ts` |
| 3 | Client abort raised 10s → 35s, above the 30s ceiling any of these functions grants itself, and made storage-aware. | `src/lib/supabase/server.ts` |

The discriminator for "indeterminate" is **SQLSTATE presence**: a Postgres error
always carries one, a client-side abort never does. So a real `57014` still
takes the rebuild path (Postgres rolled back; rebuilding is safe), and only
genuine aborts are treated as unknown-outcome.

Raising the abort does not slow ordinary failures down: `authenticated` still
carries `statement_timeout=8s`, so a normal query returns a DB error at 8s and
never reaches the abort. The abort now only bites on calls that legitimately
hold more DB budget than the old cap allowed.

**Verification.** `src/app/golf/actions/__tests__/golf-round-submit-abort-no-destructive-fallback.test.ts`
asserts the invariant directly — zero DELETEs against `golf_holes` / `golf_shots`
on an abort — rather than asserting end state, because the test fake's inserts
always succeed and a delete-then-reinsert is indistinguishable from never having
deleted. Confirmed by bug injection: with the guard disabled both tests fail on
the delete count.

Scope of that test run, stated precisely: `vitest run --project unit
src/app/golf/actions/__tests__/` — 556 passing, **not** the full suite (`npm
test` is 818 files, which was not run here).

Re-run on a **clean detached worktree at HEAD** (`25433419f`), outside the repo,
because the shared checkout carries four sessions' uncommitted edits and a
measurement taken there is not a measurement of `main`:

- `tsc --noEmit` → **EXIT 0**. The `alreadyMember` error seen earlier in the
  dirty tree does not exist on `main`; it was an artifact of concurrent
  uncommitted work. Anyone who reported that error as a blocker measured the
  wrong tree.
- Same 556 pass / 2 fail. **The two failures are real on `main`** — they are not
  dirty-tree artifacts and not "someone's staged work". See below.

### Unrelated: `main` is red on two signup tests (not mine, but real)

Found while verifying on the clean tree. Both are **stale tests encoding a
contract that `0b83f9ca5` deliberately changed**, not production regressions —
but they are committed on `main`, so `CI aggregate` is red and every future PR
inherits it.

- `auth-signup-gate.test.ts` → *"does not carry a join code for a coach"*.
  The test signs up `role: 'coach'` while holding a **valid team join code**
  (`K7PQX4MN` → `team-1`) and asserts `{success: true, redirectTo: '/golf/coach'}`.
  `0b83f9ca5` makes a roster code outrank the browser-sent role precisely so that
  case becomes an `assistant_request` instead — that is the entire point of the
  change. The test asserts the old contract. It fails with *"We could not find
  the team for that code"* because the test's mocks do not cover the assistant
  branch's own team lookup, **not** because coach signup is broken.
- `program-onboarding.test.ts` → asserts `/already exists/i` against the
  duplicate-organization message, which `0b83f9ca5` rewrote to name the action
  that actually works ("get the team code and enter it at sign-up"). Purely a
  wording assertion.

Both belong to the signup/onboarding owner, not to this incident. Recorded here
only because a clean-tree run is the thing that distinguishes them from the
dirty-tree noise, and someone had already concluded the opposite.

**`save_partial_round_atomic` deliberately gets no guard.** Checked, not missed:
its error path logs and returns, and there is no destructive rebuild behind it —
so an abort there costs the player one auto-save cycle, never data. The two
remaining `attemptDirectSubmitFallback` call sites that pass
`source: 'rpc_result'` are also correctly excluded: a DB-returned failure means
Postgres rolled back, so rebuilding is the safe and correct response there.

**Still owed:** fix 4 (single-flight auto-save per round) and the follow-up
batching. Until 4 lands, the pile-up that produces the tail is unchanged — the
35s budget absorbs it rather than preventing it.

> **Where this actually landed: `c38596d82`.** Not a commit of mine. Four
> sessions were working this repo's single shared index at once, and another
> session committed while these four files were staged — so the round-destruction
> fix is sitting inside a commit titled *"state the join result's type so `main`
> type-checks again"*, alongside an unrelated `teams.ts` change from a third
> session. Content verified intact (`REQUEST_TIMEOUT_MS = 35_000` and the
> `isIndeterminateWriteFailure` guard are both present in that tree); nothing was
> lost. History is not force-rewritten to fix this — that is a worse trade on a
> shared branch.
>
> This is the `git add -A` hazard `.claude/rules/autonomy.md` warns about,
> observed live. Staging explicit paths — which was done here — is **not**
> sufficient protection: it stops *you* sweeping in someone else's work, not
> someone else committing yours. If you are looking for this change by `git log`,
> search the content, not the subject lines.

---

## Recovery — RESOLVED 2026-08-20 16:09 UTC: unrecoverable, round unbricked

**The verdict, checked in the dashboard rather than assumed** (owner opened the
Backups page; PITR tab verified through the browser session):

- **PITR is NOT enabled** on Helm-Production — the Point-in-time tab shows
  "Point in Time Recovery is available as an add-on" with an Enable button.
  No WAL archive exists for the incident window.
- **The daily backups bracket the round on both sides.** Snapshots run daily
  ~04:44–04:49 UTC. The round was created 02:48 UTC Aug 20 and destroyed 03:19
  UTC Aug 20; the Aug 19 backup (04:46) predates the round's existence and the
  Aug 20 backup (04:44) postdates the wipe by 85 minutes. The 18 holes and 72
  shots existed for 31 minutes, entirely between two snapshots.

**James Peach's round data is therefore permanently unrecoverable.** Every
software copy was already ruled out (`draft_data` — nulled by the committed RPC;
`admin_events` / `error_logs` — counts only; no backup table; the 5KB seed).

**Reconstruction from the surviving cache remains not viable.**
`golf_round_stats_cache` pins the *multiset* — 5 birdies, 8 pars, 5 bogeys,
front 36 / back 36, 7 one-putts, 1 three-putt, 2/6 scrambling, 2 penalty
strokes — but not which hole each belongs to, and 72 shot records cannot be
inverted out of four strokes-gained numbers. Fabricated holes and shots would
poison strokes-gained, his trend line and CoachHelm permanently. If Peach kept
a paper scorecard, the cache gives him a checksum to re-enter against: 72
(36/36), and the multiset above.

**The round has been unbricked.** With no PITR extraction left to protect, the
one-row repair went ahead: `status` flipped `completed → in_progress` at
2026-08-20 16:09:05 UTC (conditioned on `status='completed'`, RETURNING
verified). Peach can now re-enter the round through the normal continue-round
flow; his re-submit recomputes the stale cache row via the existing trigger.

## Owner decisions — still open

- **Enabling PITR going forward.** This incident is the exact shape PITR
  exists for: sub-day data destroyed between daily snapshots. It is one click
  ("Enable add-on") on the Backups → Point in time page, and it is a paid
  add-on — cost is the owner's call. Note it protects only from enablement
  forward; nothing retroactive.
- **Deploying.** `vercel.json` carries `deploymentEnabled: {"*": false}`, so
  none of this ships on push; production is an on-demand CLI promote, and env
  vars bake at build time.
