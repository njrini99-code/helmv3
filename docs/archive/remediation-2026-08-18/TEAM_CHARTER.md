# Team Charter — Overnight Remediation

Read this before asking what to do. It is the standing answer.

**Commander/approver:** this session (helmv3-14c5be2c). Owner-designated.
**Authority limit:** coordination only. I cannot authorize anyone past their own
permissions, and my approval is never the owner's. Your owner's direct
instructions to you are not gated by me.

---

## 1. Mission

Run the full remediation program, then **re-audit, find what we missed, and run
another wave** — looping until the owner says stop.

**An empty queue is not a finish line.** It means the last audit's aperture was
too narrow. Nobody reports "done." You report "wave N complete, wave N+1 is X."

---

## 2. THE OVERRIDING CONSTRAINT

Owner, verbatim: *"you cannot delete players round or shots in golfhelm.
Protect at all costs."*

Baseline (2026-08-19 02:56Z): `golf_rounds` **348** · `golf_shots` **24,526** ·
`golf_holes` **6,174** · `golf_players` **94** · `golf_round_reviews` **101**.
Live data — counts only ever grow. **A decrease is an incident, not a
discrepancy.** Stop, do not commit, message me immediately.

Verified cascade facts (do not re-derive, do not contradict without measuring):

- CASCADE: `golf_players → golf_rounds`; `golf_rounds → shots/holes/reviews/stats_cache`; `golf_holes → golf_shots`
- **SET NULL, not cascade:** `golf_rounds → golf_teams`, `→ golf_courses`, `→ golf_course_tees`, `→ golf_qualifiers`

Deleting a team or course **orphans** rounds; it does not destroy them.

---

## 3. Standing orders — every session, no exceptions

**S1. Never idle.** If you finish, you do not stop and wait. You either (a) start
the next item in your own workstream, or (b) message me for the next assignment.
Idling is a failure state, not a neutral one.

**S2. Come to me first.** Questions, blockers, ambiguity, or anything touching a
shared surface — message me BEFORE acting, not after. Shared surfaces: auth, RLS,
migrations, CI, branch protection, anything within reach of golf round/shot data.

**S3. Heartbeat every ~30 minutes.** One line: what you finished, what you're on,
what's blocking. Silence is indistinguishable from being stuck, and I will assume
stuck.

**S4. Escalate immediately, do not finish your thought first:**
- any signal of golf data loss
- any auth/RLS finding that widens access
- any production write you did not intend
- any discovery that contradicts something in this charter

**S5. Verify before you claim.** Quote the file:line or query result. "I checked"
is not evidence. If you cannot verify it cheaply, say UNVERIFIED rather than
implying confidence you do not have.

**S6. Correct each other.** A peer caught a wrong cascade claim of mine tonight
and it changed the fix. That is the behavior we want, not deference. If my
reasoning is wrong, say so with evidence.

**S7. Stay in your lane's tree.** Nobody but the file's owner writes to
`/Users/ricknini/Downloads/helmv3`. My work is in
`~/worktrees/helmv3/overnight-remediation`. Use your own worktree for writes.

---

## 4. Assignments

| Session | Workstream | Deliverable |
|---|---|---|
| **helmv3-14c5be2c** (me) | Command. Serial write work: Waves A–H in the worktree. The P0 fix. | Draft PR |
| **helmv3-cb** | Staff-join (owner-directed). Owns `teams.ts`, `signup-gate.ts`, `auth.ts`, `staff-invite.ts` + its migrations. | Its own PR |
| **helmv3-38** | Migration reconciliation, read-only | `MIGRATION_RECONCILIATION.csv`, `DUPLICATE_NAME_ANALYSIS.md`, `MIGRATION_WRITERS.md` |
| **helmv3-24** | Available — request an assignment | — |

---

## 5. Hard prohibitions tonight

Production migration repair or ledger writes · `db push`/`db reset` against prod ·
the held baseball legacy backfill (`20260715141727`) · blanket RLS or
`SECURITY DEFINER` rewrites · mass index drops · git history rewrite ·
aggressive `gc` · suppressing any check to reach green · raising a ratchet to
absorb a regression · deleting an unverified Knip finding · committing exploit
prose to this **public** repo.

**Blocked:** no Docker → clean-room `supabase db reset` replay is impossible.

---

## 6. Open P0 — mine, nobody else touches it

`is_golf_team_coach()` is existence-only (no `gtcs.role` check).
`is_golf_team_head_coach()` has the check and is the correct variant.

Three role-agnostic policies trust the wrong one:
`golf_rounds_delete_coach`, `golf_shots_delete_coach`, `golf_holes_delete_coach`.

⇒ an `assistant_coach` can delete rounds directly; CASCADE destroys the shots,
holes and reviews beneath them.

Call-site analysis first — assistant coaches may legitimately delete rounds
today. Players have their own self-scoped delete policies, so tightening the
coach side does not strip player self-service.

---

## 7. Deconfliction matrix — who owns what

**Rule: if you need to touch something in someone else's row, message THEM
directly. Do not route it through me and do not just do it.** Copy me so I keep
the picture, but talk to each other.

| Surface | Owner | Everyone else |
|---|---|---|
| `src/app/golf/actions/teams.ts`, `signup-gate.ts`, `auth.ts`, `staff-invite.ts`, staff-invite migrations | **cb** | read-only |
| `supabase/migrations/**` — reading/mapping the ledger | **38** | ask 38 before analyzing |
| `supabase/migrations/**` — ADDING a migration | **cb** (staff-join), **me** (P0 fix) | announce to 38, it invalidates its map |
| The three `*_delete_coach` RLS policies + `is_golf_team_coach` | **me** | nobody touches |
| `src/app/api/admin/**` | **me** (Wave A) | read-only |
| Team Hub / `team-hub-routes.ts` | **24** | read-only |
| Baseball business logic, notifications/push, realtime/offline | **24** (Wave M audit) | read-only |
| `~/worktrees/helmv3/overnight-remediation` | **me** | nobody enters |
| `/Users/ricknini/Downloads/helmv3` (main checkout) | **cb** in-flight | write only what you own |

### Known live collision risks — coordinate directly

1. **cb is ADDING migrations while 38 MAPS them.** cb has landed two since 38
   started and says it has not stopped. → **cb tells 38 directly** each time a
   migration lands. 38 timestamps its snapshot and states that the ledger moved
   under it rather than implying a stable count.
2. **38 and my `destructive-paths` agent were both assigned the FK-cascade sweep
   of `supabase/migrations/**`.** My error. → **38 keeps it** (it is already in
   those files); my agent drops that item and covers app code, DB functions,
   scripts/cron, and service-role paths instead.
3. **24's notifications audit vs cb's signup/auth work.** #1515 added a
   service-role insert into `notifications`; cb is reshaping signup and role
   grants. → **24 asks cb** what its staff-join flow triggers before auditing the
   fan-out, so it audits the current shape rather than yesterday's.
4. **24's baseball audit vs my Wave C dead-code deletion.** Both reach baseball
   components. → I do not delete any baseball component until 24 confirms it is
   not load-bearing for a finding it is writing up.

### Lateral protocol

- Message the owner of the surface **first**, copy me.
- If two of you disagree, escalate to me with both positions and the evidence —
  not a summary of the disagreement, the actual evidence.
- If you discover something that changes someone else's assumptions, tell them
  **immediately**, do not wait for your report. cb correcting my cascade claim
  mid-run is the standard.

---

## 8. OWNER DIRECTIVE — 2026-08-19 00:01 — DISCOVERY MODE

**"Don't delete any golf database stuff. Just find dead stuff and we can both
review it in the morning."**

This supersedes every deletion task in this charter and in `PROTOCOL.md`.

### The rule

**NOTHING in the golf database is deleted, dropped, or removed tonight.** Not
rows, not tables, not columns, not indexes, not policies, not functions, not
constraints. Not by anyone, not "safely", not with evidence, not even when a
tool proves it unused. The threshold is no longer *proof* — it is *the owner
reviewing it with me in the morning*.

This is broader than the earlier round/shot rule. That one protected player
history. This protects the whole golf schema.

### What we do instead

**Find and document.** Every dead thing gets an entry with the evidence that it
is dead, the blast radius if we are wrong, and a recommendation. Nobody acts on
it.

Applies equally to application code: **stop deleting dead components.** Wave C
becomes an inventory, not a cleanup. A deletion that turns out to be wrong costs
far more at 3am than the dead file costs sitting there until morning.

### Still in scope tonight

- **Additive and protective changes** — the production-target guard for
  destructive scripts, and the migration that makes round history survive
  account deletion. Both *reduce* what can be destroyed. Neither is applied.
- **Read-only investigation** — RLS analysis, privileged RPC manifest, migration
  reconciliation, the never-audited surfaces. All of it continues.
- **Non-golf, non-destructive code fixes** — the admin auth gate, cron auth,
  push-token teardown.

### Out of scope until the morning review

- Dropping any index, policy, function, table, column or constraint in golf
- Deleting any dead component, file, or export
- Removing any branch, ref, stash, or worktree
- Applying any migration to production

### Deliverable

One document, `DEAD_INVENTORY.md`, that the owner and I read together. Organized
by kind — database objects, application code, config, docs — each entry stating
what it is, why we believe it is dead, how confident we are, and what breaks if
we are wrong.

### 8b. REFINEMENT — 2026-08-19 00:03 — the golf/baseball split

Owner: **"Just note the golf stuff. Baseball stuff can be deleted."**
Owner, 00:06, on the baseball row counts: **"Nobody's using it, it's all seed data."**

| | GOLF | BASEBALL |
|---|---|---|
| Dead application code | **NOTE ONLY** | **DELETE** (with reachability proof) |
| Dead / unused DB objects | **NOTE ONLY** | **DELETE** (forward migration, unapplied) |
| Rows | **NEVER** | not protected — seed data, see below |

**Correction to my own caution, recorded because I got it wrong.** At 00:03 I
measured baseball row counts (`baseball_player_stats` 268 · `baseball_messages`
229 · `baseball_notifications` 216 · `baseball_box_score_batting` 185 ·
`baseball_games` 47 · `baseball_players` 35 · `baseball_teams` 13) and read them
as real user data — real messages between real people, a real season of box
scores. **They are seed data. Nobody is using baseball.** The owner confirmed it
directly. My caution was measuring the right thing and inferring the wrong
meaning from it: a row count tells you a table is populated, never that anyone
depends on what populated it.

So: **a baseball object is not protected by having rows in it.** If it is dead,
it goes, and a populated dead table is still a dead table.

**Still required for every baseball deletion** — this part does not relax:
reachability proof (Knip default AND production configs, plus dynamic-import and
framework-convention checks), the deletion isolated in its own commit, and a
build afterwards. The risk that survives is *breaking the app*, not *destroying
data*. Deleting on the strength of a single grep is how a dynamically-imported
component disappears.

**Golf remains note-only in full** — code and schema both, rows absolutely.
Every golf candidate goes into `DEAD_INVENTORY.md` with evidence, confidence and
blast radius, for the owner and me to review together in the morning.

## 9. OWNER DIRECTIVE — 2026-08-19 00:16 — DEAD MEANS UNWIRED, NOT ABANDONED

Owner, verbatim:

> "Take note of all the dead stuff. We'll go through it, some stuff was
> supposed to be wired and never was — same with the database stuff for golf,
> that's why. If you can make those connections that would be helpful."

**This changes the question, not just the priority.** We have been asking "what
is dead?" The owner is telling us the answer is largely "nothing is dead — it
was finished and never connected." Those are opposite conclusions drawn from
*identical evidence*: no importer, no caller, no rows.

### The four classes — every candidate gets exactly one

| | meaning | action |
|---|---|---|
| **UNWIRED** | finished, functional, never connected | **the valuable class.** Name the exact missing connection |
| **SUPERSEDED** | a newer implementation replaced it | removable — but check the replacement didn't drop an affordance |
| **ABANDONED** | incomplete, stubbed, obsolete | genuinely removable |
| **ACTUALLY_REACHABLE** | the instrument was wrong | correct the instrument |

"No importer" is identical evidence for all four. **Only reading the code
distinguishes them.** An inventory that stops at "unreferenced" has not started
the actual work.

### The pairing hypothesis — the thing the owner is really asking for

A zero-row table and an uncalled server action are frequently **the same
unshipped feature seen from two directions**. Neither is dead on its own terms;
together they are one capability built end-to-end and never given a UI.

So the golf dead-database inventory and the golf dead-code inventory must be
read **against each other**, not filed separately. Three specific classes:

- **paired** — dead code + empty table = one unshipped feature
- **code without data** — dead code against a table holding REAL rows. The
  pipeline already works; only the UI is missing. **Cheapest wins available.**
- **data without code** — populated golf table that nothing reads. Something is
  writing it (cron, RPC, trigger, Inngest) and nothing displays it.

### The trap, stated because we already nearly hit it

An empty table is **equally consistent** with "abandoned" and with "not launched
yet." `golf_staff_invite_codes` and `golf_staff_invite_redemptions` are empty
right now purely because cb created them tonight for a feature that has not
shipped. Emptiness is never evidence of death on its own — corroborate from the
code side, always.

### Standing evidence for how real this is

`src/app/golf/admin/page.tsx` imports `admin-data.ts` and one `OverviewTab`.
Sitting unimported beside it: `admin-bi-data.ts`, `admin-people-data.ts`,
`admin-system-data.ts` and roughly 40 components — `CohortRetentionMatrix`,
`SessionHeatmap`, `PlayerDropoffFunnel`, `TeamIntelligenceCard`, an entire
`shared/` primitives folder. That is not 43 dead files. That is one admin
dashboard, built against a data layer, never mounted.

Caveat that must be resolved before anyone believes the number: that page uses
`next/dynamic`, which knip cannot follow. Some of the 40 may be mounted after
all.

### Instrument correction — the knip config was blind

`knip.json` declared `src/app/**` as ENTRY POINTS. An entry point is reachable
by definition, so knip structurally could not report anything in `src/app` —
where most of the code lives. `src/components/ui/**` was in `ignore` on top of
that.

Corrected to real Next.js entry points only (page/layout/route/loading/error/
not-found/template/default/opengraph-image/sitemap/robots/manifest, middleware,
instrumentation): **7 unused files became 86.**

The config change lives OUTSIDE the repo and nothing in the repo was modified.
Generalize the lesson: when a tool reports suspiciously little, suspect its
configuration before concluding the codebase is clean.
