# Duplicate-name groups in `supabase_migrations.schema_migrations`

**Project:** `qmnssrrolpinvwjjnufo` (production)
**Investigation window:** 2026-08-19 03:40:40Z – 03:47:20Z (UTC)
**Method:** read-only. `SELECT` and catalog introspection only. No `migration repair`,
no writes to `schema_migrations`, no `db push`, no `db reset`.

---

## The headline: the number you were given is mostly ours

The brief asked for the mechanism behind **193 duplicate-name groups**. The
mechanism hunt is over **27** groups, not 193.

| Measurement | Groups | Source |
|---|---:|---|
| Duplicate-name groups **before** tonight's repair | **27** | `remote_hist.json` (cb's frozen pre-repair dump, 555 rows) |
| Duplicate-name groups **after** tonight's repair | **193** | live ledger, 03:47:20Z |
| **Created tonight by `helmv3-cb`'s repair** | **166** | difference, corroborated below |

166 of the 193 groups (86%) did not exist eight hours ago. They are an artifact of
our own remediation, not of historical tooling.

### Two independent derivations agree

This is the strongest evidence in this document: two methods that share no
intermediate step produce the same number.

**Derivation A — shape census of the live ledger.** cb documented its repair as
`INSERT (version, name) … ON CONFLICT (version) DO NOTHING`, populating *nothing*
else, so its rows are identifiable by `statements IS NULL AND created_by IS NULL`.
Grouping the live duplicates by composition:

| Group shape | Groups |
|---|---:|
| size 2 = 1 bodiless/null-author + 1 bodied/authored — **cb's signature** | **166** |
| size 2 = 1 null-author bodied + 1 authored bodied | 20 |
| size 2 = 2 authored bodied | 6 |
| size 3 | 1 |

**Derivation B — pre/post diff.** Of cb's 248 repaired versions, **167** carried a
`name` that already existed in the pre-repair ledger; 81 were new names. 167
collisions land as 166 brand-new groups plus one pre-existing group growing 2→3.

Both give 166 new + 27 pre-existing = 193. The 20 + 6 + 1 = 27 non-cb shapes in
Derivation A are exactly the 27 historical groups in Derivation B.

Because `remote_hist.json` is a frozen artifact, **the 27/166 split stays
verifiable** even as the ledger keeps growing.

---

## The actual historical mechanism (the real 27)

Not restamping, and not a re-apply loop in CI. It is **dual-path application**:
the same migration reaching production through two different tools, each of which
records its own ledger row.

The `created_by` column is the discriminator:

| `created_by` | `statements` | Path |
|---|---|---|
| `njrini99@gmail.com` (339 rows) | always populated | Dashboard SQL editor / Management API / Supabase MCP — records the authenticated user |
| `NULL` **with** statements | populated | Supabase CLI `db push` |
| `NULL` **without** statements (258 rows) | null | direct `INSERT` — 248 of these are cb's repair tonight |

Every one of the 27 historical pairs is one **round, hand-authored** version plus
one **precise, execution-time** version of the same name:

```
fix_round_submit_integrity        20260311223000  +  20260312004447
round_totals_trigger              20260428000100  +  20260428113724
predictions_natural_key_non_partial 20260428182000 + 20260428182006   <- 6 seconds apart
get_db_telemetry                  20260428200000  +  20260428214948
golf_round_ai_recap               20260503000000  +  20260503005245
```

The round version is the **filename**; the precise one is **when it ran**. The
author writes `20260428000100_round_totals_trigger.sql`, applies the SQL through
the Dashboard (which stamps `20260428113724` and records `created_by`), and the
filename version is separately recorded — two rows, one name.

**This mechanism is still live.** It produced rows tonight, hours before this
investigation:

```
20260817121500  golf_shots_select_policy_perf   created_by=NULL            statements=0
20260818010326  golf_shots_select_policy_perf   created_by=njrini99@...    statements=1
20260818060000  fix_putt_break_direction_...    created_by=NULL            statements=0
20260818124738  fix_putt_break_direction_...    created_by=njrini99@...    statements=1
```

### A sharper variant: the June-24 batch was pushed twice

Six of the 27 are distinguishable and worth naming separately:

```
name = "20260624000010_baseball_stat_uploads_reconcile"   versions 20260624194331 + 20260624195441
name = "20260624000020_baseball_import_lineage"           versions 20260624194443 + 20260624195610
name = "20260624000030_baseball_staff_capabilities"       versions 20260624194521 + 20260624195654
name = "20260624000040_baseball_timeline_and_acks"        versions 20260624194558 + 20260624195735
name = "20260624000060_baseball_practices"                versions 20260624195205 + 20260624200830
name = "20260624001500_baseball_signup_creates_profile_row" versions 20260624202456 + 20260624202608
```

Two tells. First, the **whole filename became the `name`**, version prefix and
all — so the writer passed the filename through as a label and generated a fresh
timestamp for the version, rather than splitting `<version>_<name>`. Second, the
pairs are ~11 minutes apart in a single evening: **the same batch was applied
twice.**

That same June-24/25 batch carries **synthetic version strings** that are not
clocks at all — `20260624000082`, `20260625000040`, `20260625000060`,
`20260625000070`, `20260625000080`. `000060` is 00:00:60, an impossible
wall-clock time. Across all 302 local files, 24 have an impossible clock field.
These are counter increments in the `HHMMSS` slot, i.e. script- or
agent-authored, not `supabase migration new` output.

The same batch is the one carrying essentially all of the residual applied-but-absent
DDL (see `MIGRATION_RECONCILIATION.csv`): 19 of the 20 such files are `20260624000*`.
One evening in June accounts for most of the drift in this database.

### Version-shape census of the 302 local files

| Shape | Files | Reading |
|---|---:|---|
| `round-hour` (`HHMMSS` = `HH0000`) | 151 | hand-authored |
| `round-minute` (`SS` = `00`) | 87 | hand-authored |
| `clock-plausible` | 40 | plausibly CLI-generated |
| `impossible-clock` (`MM`/`SS` > 59) | 24 | synthetic counter |

Only 40 of 302 files look like real CLI output. The dominant authoring path in
this repo is a human or agent typing a timestamp, which is precisely what makes
the filename version and the execution version diverge.

---

## Hypotheses tested and rejected

Recording these so nobody re-runs them.

- **"A deleted numbered migration series (`001`–`069`) collided with timestamped
  re-adds."** The ledger does carry 67 short-numeric versions, and commit
  `d25c639e1` (2026-01-14) did delete `supabase/migrations/001_schema.sql` …
  `069_*`. But **0 of the 27** historical groups involve a short-numeric version.
  The legacy rows are orphans — they explain why `supabase/migrations/` cannot
  rebuild production, but they do not produce duplicate names.

- **"The second Supabase config root redirects pushes."**
  `tools/continuous-improvement/supabase/config.toml` has
  `project_id = "continuous-improvement"` against `supabase/config.toml`'s
  `project_id = "helmv3"`. But `project_id` in `config.toml` names the **local**
  stack (container/volume naming); it is not a remote project ref and cannot
  redirect `db push --linked`. A second config root pointing elsewhere would send
  migrations to a *different database*, which would not double-stamp *this* one.
  Disconfirmed.

- **"CI re-applies migrations in a loop."** No workflow in `.github/workflows/`
  or `.circleci/config.yml` applies migrations to production. See
  `MIGRATION_WRITERS.md`.

---

## What this implies (reported, not recommended)

1. **The 166 are cosmetic, and deliberately reversible.** They carry no
   `statements`, so they assert only "this version has been seen". cb kept
   `rollback.sql` as the exact inverse.

2. **Deduplicating by name would be wrong.** `name` is not a key in this ledger
   and never has been — `version` is (804 rows, 804 distinct versions, 0 duplicate
   versions). The duplicates are two legitimate records of two real application
   events.

3. **The dual-path mechanism is still active and will keep producing pairs**
   until one path becomes canonical. That is an owner-level workflow decision,
   not a cleanup task.

**Not recommended, explicitly:** no bulk backfill of the remaining unmatched
files, no ledger dedup, no `migration repair`. `20260708141000` is a held draft
and `20260715141727` is on explicit HOLD.

---

## Measurement stability

| Figure | Status | Value | As of |
|---|---|---|---|
| Historical duplicate groups | **FROZEN** | 27 | pre-repair dump |
| Groups created by tonight's repair | **FROZEN** | 166 | pre/post diff |
| The 32-file map | **FROZEN** | 32 | cb's repair_plan.json |
| Total ledger rows | FLOOR | 805 | 03:47:20Z |
| Distinct names | FLOOR | 611 | 03:47:20Z |
| Duplicate-name groups | FLOOR | 193 | 03:47:20Z |

`helmv3-cb` confirmed it has **not** stopped applying migrations. The ledger moved
803 → 804 → 805 during this pass (max version `20260819033336`). Every FLOOR figure
above is a snapshot of a moving target and should be re-measured before being
quoted. The FROZEN figures are the load-bearing ones and do not move.
