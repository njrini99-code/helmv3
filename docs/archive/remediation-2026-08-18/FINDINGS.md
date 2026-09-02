# Migration divergence — converged findings

**Project:** `qmnssrrolpinvwjjnufo` (production)
**Pass:** 2026-08-19 03:40:40Z → 03:55Z · read-only throughout
**Deliverables:** `MIGRATION_RECONCILIATION.csv` (302 rows) ·
`DUPLICATE_NAME_ANALYSIS.md` · `MIGRATION_WRITERS.md`

---

## 1. The 193 duplicate groups are mostly ours

27 pre-existed; `helmv3-cb`'s repair created 166 tonight. Two independent
derivations agree (live shape census; pre/post diff vs a frozen dump). The
mechanism hunt is over 27 groups, not 193.

**Mechanism (the real 27): dual-path application.** The same file reaches prod via
the Dashboard/Management API (stamps its own execution-time version, records
`created_by`) *and* via CLI `db push` (uses the filename version). Two rows, one
name. Still active — and it **reproduced twice DURING this investigation**, in a
peer session's own work, while the mechanism was being written up (verified
2026-08-19 04:12Z):

| local file | ledger version | `created_by` |
|---|---|---|
| `20260819030000_golf_staff_invite_single_use.sql` | `20260819031356` | `njrini99@gmail.com` |
| `20260819040000_golf_staff_invite_codes.sql` | `20260819033336` | `njrini99@gmail.com` |

Applied via MCP, stamped at **execution time**; neither filename version had a
ledger row, which would have made them unmatched migrations #33 and #34.

> ### ✅ RESOLVED 04:18Z — and the resolution is the most instructive part
>
> `helmv3-cb` stamped the two filename versions (additive `INSERT` only).
> **Independently verified:** ledger 805 → **807**, both `20260819030000` and
> `20260819040000` present, and local files with no ledger row back to **32**.
> The unmatched set did **not** grow tonight.
>
> **But duplicate-name groups went 193 → 195.** Stamping the filename version of a
> migration already recorded under its execution-time version *creates a
> duplicate-name pair* — the dual-path signature, this time produced deliberately,
> as the remedy.
>
> **So the duplicate-name count is not a health metric.** The correct fix for a
> real defect *raises* it. Anyone who opens the morning review, sees 195, and
> proposes "cleaning up the duplicates" would be undoing a repair. A duplicate
> name is cosmetic; a failing replay is not. That trade is right, and it is the
> reason §1's headline number should never be read as a scoreboard.
>
> cb chose stamping over making the files replay-safe deliberately:
> `DROP POLICY IF EXISTS` would put a drop statement into a golf migration on the
> night of a no-delete directive. The files stay correct for a fresh database
> (`CREATE POLICY` on an empty schema is fine); the ledger now prevents the only
> dangerous case, replay against a DB that already has them.

The defect that made this urgent, recorded because the shape recurs:

> ### ⚠ What would have happened: `supabase db push` would have FAILED
>
> Both were already applied in production, but the CLI keys on `version` and would
> have seen `20260819030000` / `20260819040000` as unapplied and re-run them.
> **Neither file is idempotent** — each has an unguarded `CREATE POLICY`
> (`golf_staff_invite_redemptions_select`, file line 50;
> `golf_staff_invite_codes_select`, line 51) and Postgres has **no
> `CREATE POLICY IF NOT EXISTS`**. The replay would have aborted with "policy
> already exists" *partway through*, having already run the statements above it —
> manufacturing a fresh partially-applied migration, the exact condition this
> investigation exists to map.
>
> Same failure mode as the June-24 forward-fix hazard in §3, reached independently
> from the opposite direction within the same hour. It is a property of the
> dual-path workflow, not of either migration.

Rejected, so nobody re-runs them: the deleted `001`–`069` numbered series (0 of 27
groups involve it) and the `tools/continuous-improvement/supabase/config.toml`
lead (`project_id` names the *local* stack; it cannot redirect a remote push).

## 2. Three causes, routinely conflated as one "drift" problem

| Symptom | Cause |
|---|---|
| Duplicate names | Dashboard **and** CLI applying the same file |
| The unmatched 32 | Dashboard **without** CLI — applied, never stamped under the filename version |
| History can't rebuild prod | `d25c639e1` (2026-01-14) deleted migrations `001`–`069`; their 67 ledger rows remain |

## 3. cb's 248-row repair: sound, with a narrow real residue

Verified against the **live catalog**, never against the name match (name is not a
key here — at 03:47Z: 805 rows, 805 distinct versions, 193 duplicate names; by
04:18Z those were 807 / 807 / 195. `version` is the key and has never had a
duplicate; `name` has 195.)

163 fully present · 67 not statically verifiable (ALTER/DO/data-only) ·
**18** where the ledger asserts applied and DDL is unaccounted for. All 18 are the
single **June-24 baseball batch** — the same evening that carries the ledger's only
double-push (6 groups, ~11 min apart) and all 24 impossible-clock version strings
(`000060` = 00:00:60). One evening in June accounts for most of the drift.

The largest apparent gaps were **not** gaps: the baseball lifting module was
rebuilt under the `helm_lifting_` prefix (33 live, zero `baseball_lift*` /
`strength*` / `readiness*` / `soreness*` / `bodyweight*` / `availability*`).

### Convergence, and its scope limit

`helmv3-cb` independently parsed the batch for created tables: 103 distinct, 26
absent, 24 explained by the rename, **2 genuinely absent**. After extending the
rename suppression, this reconciliation independently reports the same **2**.
Two methods, no shared intermediate step, same answer.

**But that convergence covers tables only.** cb measured tables (plus one index it
checked by name). The residue this reconciliation reports is:

| Kind | Count |
|---|---:|
| index | 62 |
| policy | 16 |
| trigger | 6 |
| table | **2** (converged) |
| function | 2 |

So "the only real gaps are 3" is correct **within cb's scope** and would be wrong
if it propagated as a total. The 62 indexes / 16 policies / 6 triggers / 2
functions are **not** covered by that verification and remain
HIGH-CONFIDENCE-UNSAMPLED (full `pg_class`/`pg_policy`/`pg_proc`/`pg_trigger`
dump; ~13 items spot-checked with `to_regclass`, all confirmed absent).

**The 16 policies must be rename-checked BEFORE anything is written — this is a
blocker, not a review note.** Several are plausibly renames neither pass could
prove: `baseball_timeline_acks_*` against live `baseball_timeline_event_acks_*`
has exactly the shape of the `baseball_event_acks_*` → `baseball_event_acknowledgements_*`
rename that *was* confirmed. The failure mode is worse than duplication:
`CREATE POLICY` on a name that already exists **raises an error**, so a forward-fix
migration that recreates an already-renamed policy fails **mid-apply** — landing
part of its DDL and adding a fresh partially-applied migration to the very problem
it was written to close.

### The one live correctness bug

**`baseball_seasons_one_current_per_team`** (from `20260624000095`) is a **UNIQUE**
index and is absent while `baseball_seasons` exists — so nothing prevents two
current seasons per team. Confirmed independently by both passes. Everything else
in the residue is performance or fail-safe.

Missing `DELETE` policies (`baseball_ai_audit_delete`, `baseball_decision_log_delete`,
`baseball_stat_uploads_delete`) are **fail-safe, not holes**: RLS is on and those
tables carry SELECT/INSERT/UPDATE policies, so DELETE is denied.

### Agreed remedy — forward-only, not un-stamping

cb is **not** un-stamping any of the 18. Re-applying a 73-object migration whose 33
objects already exist is a partial-replay hazard, and this repo is forward-only.
The correct fix is a **new additive migration**: the one UNIQUE index, the two
tables (`baseball_stat_facts`, `baseball_import_field_mappings`), and whichever of
the 62 indexes are still wanted. That also leaves the ledger truthful — the DDL
*did* run, it just didn't fully land. **Not written; handed over as a scoped item.**
None of it touches golf data.

## 4. Protected golf data — clean

Across all 302 migrations, created objects on `golf_round*`/`golf_shot*`/`golf_hole*`
absent in prod: **2**, both explained — `golf_shots_select_own` and
`golf_shots_select_team` were deliberately dropped and consolidated into
`golf_shots_select` by `20260817121500` (lines 115–116), which **is** applied.
Zero unexplained gaps.

Live: `golf_rounds` rls=on/10 policies · `golf_shots` rls=on/12 · `golf_holes` rls=on/9.

**Cascade audit:** exactly one migration defines an `ON DELETE CASCADE` reaching
those tables — `20260527000000_prod_public_baseline`. Nothing since the 2026-05-27
baseline adds, widens, or alters one. Direct `pg_constraint` dump independently
confirms `golf_rounds→golf_teams` and `golf_rounds→golf_courses` are **not**
cascades.

**Baseline, both ends.** Open 03:40:40Z: 348 / 24,526 / 6,174. Close 03:47:20Z:
349 / 24,526 / 6,192. It **moved, upward** — verified as genuine new inserts
(1 round + 18 holes with `created_at` inside the window, newest 03:45:23Z), not
net-of-deletes. *Honest limit:* counts alone cannot prove absence of deletion, and
the `created_at` check rules it out only for rows that still exist.

## 5. Instrument failures found in this pass

Recorded because each would have produced a confident wrong answer.

1. **Vacuous verification.** The first check of cb's 248 short-circuited on
   "version in ledger" *before* testing object presence, so it reported 0 problems
   by construction. Fixed by testing presence from the catalog only — the ledger is
   the thing under test and cannot be an input to its own verification.
2. **False all-clear from a regex.** The cascade sweep returned `0` because the
   baseline is `pg_dump` style with quoted identifiers (`"public"."golf_rounds"`)
   and the pattern only allowed bare ones. Caught because 0 was implausible against
   8 known live cascades.
3. **Scope artifact.** 41 "missing" objects were `storage.objects` policies while
   the catalog dump covered `public` only.
4. **Truncated-column claim.** An early "0 protected objects missing" reading came
   from a CSV field capped at 400 chars; re-derived from the full object list.
5. **The naming confound — read this before auditing this batch again.**
   Probing for an object named after the **migration** produces false absences.
   `20260624000020_baseball_import_lineage` creates `baseball_import_runs` and
   `baseball_player_external_ids`; both are live, yet a name-derived probe calls
   the migration missing. This single confound is the difference between "26
   absent tables, a catastrophe" and "2, the truth". The next person to audit
   this will reach for the same wrong instrument. **Parse each file for the
   objects it actually `CREATE`s and probe those** — never infer object names
   from the migration's name. (Identified independently by `helmv3-cb`.)

## 6. Cross-cutting finding: stored claims decay invisibly

This is a finding in its own right, not a footnote to the instances that produced
it. **Every stale claim encountered tonight died on contact with a fresh
measurement — and not one of them announced that it was stale.**

| Stored claim | Reality when measured |
|---|---|
| `golf_rounds → golf_teams/golf_courses` cascade | SET NULL, not CASCADE — the FK query filtered `confdeltype='c'` on the final hop only |
| `tools/continuous-improvement/supabase/config.toml` misdirects pushes | `project_id` names the *local* stack; cannot redirect a remote push |
| `get_baseball_conversations_with_details` is an open HIGH cross-tenant leak | Fixed in prod — uses `auth.uid()`, `anon` has no EXECUTE |
| Baseball row counts (268 stats, 229 messages…) = real user data | Seed data; the owner confirmed nobody uses it |
| "193 duplicate groups is a pre-existing condition" | 27 pre-existed; 166 were created hours earlier by our own repair |

The mechanism is uniform: **a stored claim keeps reading as confident long after
the state it described has moved.** Row counts, function bodies, FK actions and
ledger counts are all cheap to re-measure and all were quoted from memory instead.

The perfect artifact is in this repo: `.claude/rules/code-review-tooling.md`
carries `verified: unverified` in its own frontmatter — a document that
accurately reports its own unreliability, and is still read as authoritative.

### Age is not the variable — the instrument is

The comfortable reading of the table above is "documentation hygiene". That
reading is wrong, and the sixth instance is what kills it, because the stale claim
came from **a live peer measuring in good faith, minutes earlier**:

`helmv3-cb` was one command from un-stamping all 19 rows I had reported, with the
inverse SQL already written and a prior it had stated in writing. Before running
it, it re-derived from `pg_catalog` rather than from my list — and found 24 of 26
absent tables were the `helm_lifting_` rename. Un-stamping would have instructed a
tool to re-create 134 objects under deliberately retired names.

**The confound, and it is the transferable part:** verifying a migration by probing
for an object named after the **migration** produces false absences.
`20260624000020_baseball_import_lineage` creates `baseball_import_runs` and
`baseball_player_external_ids`; nothing named `baseball_import_lineage` exists or
ever did. That single confound moved the answer from 26 to 2.

Neither of us was careless — I sampled and labelled confidence honestly, cb stated
its prior before acting. **The failure mode does not require sloppiness**, which is
exactly why it earns a standalone finding.

So: **"re-measure before acting" is necessary but insufficient.** A measurement
minutes old was equally wrong, because the instrument had a blind spot. The rule
that actually holds is:

> **Re-measure with an instrument that could show the opposite result.**

Every instrument bug caught tonight (§5) fits it — the vacuous ledger check that
could only ever return "fine", the cascade regex that could not match quoted
identifiers, the `reltuples <= 0` test that could not distinguish "empty" from
"never analyzed". None was a stale document. Each was a live measurement whose
instrument could not have produced the answer that was true.

What made all of this survivable: measuring cost ~4 minutes of catalog queries;
acting on the wrong reading carried an unbounded and silent cost.

## 7. Measurement stability

**FROZEN** (re-verifiable, will not move): the 27/166 split · the 32-file map ·
the 2 converged absent tables · the cascade audit.

**FLOOR** (moving target): total rows · distinct names · duplicate-group count.
The ledger went 803 → 804 → 805 → **807** across this pass, and duplicate-name
groups 193 → **195**. Last measured 04:18Z. **Re-measure before quoting** — and
note from §1 that the duplicate count moving *up* can mean a defect was repaired,
not that anything got worse.

**Protected-data baseline**, measured four times across the pass and never
decreasing: 348/24,526/6,174 → 349/24,526/6,192 (verified as new inserts, not
net-of-deletes) → unchanged at 04:12Z and 04:18Z.
