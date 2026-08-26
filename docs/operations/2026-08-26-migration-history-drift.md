# Migration History Drift — 13 Production-Only Ledger Rows

Read-only investigation. Nothing was applied, repaired, or written to
production for this doc. Project: `qmnssrrolpinvwjjnufo`.

## The finding, up front

`supabase_migrations.schema_migrations` in production carries 13 versions
with no file of that version number under `supabase/migrations/`. For all 13,
the SQL that ran is recorded verbatim in the ledger's `statements` column, and
every one of them traces to a repo migration file that does the same thing —
usually the *same file*, applied under a different version-number stamp than
the one it was recorded with in production. **None of the 13 is unrecoverable
drift.** The repo can already reproduce the effect of each one; what it cannot
reproduce is the exact version number production recorded, because these were
applied directly (by the owner, via SQL/MCP) during live incident response and
then written into a migration file afterward under a fresh timestamp, rather
than the file being run and letting the tool assign the version.

This is the same defect `docs/operations/SUPABASE_DRIFT_GUARD.md` and
`docs/audits/SUPABASE_DRIFT_REPORT_2026-07-03.md` already named for the
period since 2026-05-26 — "local migration filenames and the versions
actually recorded in `supabase_migrations.schema_migrations` are
systemically mismatched" — just now confirmed by direct row-for-row
inspection instead of by pattern description, and extended to one case where
the *name* also differs, not only the version.

## Method

For each of the 13 versions:

1. Queried `supabase_migrations.schema_migrations` for `name`, `created_by`,
   and `statements[1]` (this project stores the whole applied SQL as a
   single recorded statement per version, confirmed by inspecting
   `information_schema.columns` first).
2. Searched `supabase/migrations/*.sql` by the recorded `name` (not by
   version number, since the version numbers are exactly what's missing).
3. Where a same-named file existed, compared its content against the
   recorded `statements[1]` text and length.
4. Cross-checked the resulting object in the live catalog today
   (`pg_proc.prosecdef`, `pg_get_functiondef`, function/trigger existence)
   to confirm the change is actually live, independent of what any file
   claims.

All 13 rows have `created_by = njrini99@gmail.com` — the owner's own
account, not a service role or CI identity. These are hand-applied
incident-response patches, not an unattended process writing to production.

## The 13, classified

Every row below is classification **(i) — applied out-of-band, effect also
present in a repo file.** None classified as (ii) real drift or (iii)
unclear; each one had a traceable repo equivalent and a catalog cross-check
confirming it is live.

| Production version | Production `name` | Repo file (same effect) | Evidence |
|---|---|---|---|
| `20260820172125` | `single_flight_partial_round_save` | `20260820170000_single_flight_partial_round_save.sql` | Full statement text pulled and compared line-for-line against the repo file body: byte-identical. |
| `20260821114110` | `single_flight_round_submit` | `20260821043500_single_flight_round_submit.sql` | The recorded statement's own header says so: `"(Applied from supabase/migrations/20260821043500_single_flight_round_submit.sql, merged in PR #1554 after db-migration-review. See that file for the full header...)"`. |
| `20260821165627` | `feature_health_excludes_resolved_incidents` | `20260821050000_feature_health_excludes_resolved_incidents.sql` | The recorded statement's own header says so, same pattern: `"(Applied from supabase/migrations/20260821050000_feature_health_excludes_resolved_incidents.sql, merged in PR #1576 after db-migration-review...)"`. Full statement pulled and compared body-for-body against the repo file: identical function body, identical `COMMENT`, identical self-verifying `DO $guard$` block. Live catalog cross-check today: `(length(prosrc) - length(replace(prosrc,'resolved IS NOT TRUE',''))) / length('resolved IS NOT TRUE')` on `public.get_feature_health` returns exactly `7` — the same count this migration's own guard block requires, confirmed independently of the ledger. |
| `20260823233504` | `preserve_started_round_identity` | `20260823000000_preserve_started_round_identity.sql` | Full statement pulled and byte-diffed against the repo file: zero differences. |
| `20260823233509` | `harden_golf_round_lifecycle_boundaries` | `20260823213049_harden_golf_round_lifecycle_boundaries.sql` | Full statement pulled and byte-diffed against the repo file: zero differences. |
| `20260823235118` | `allow_derived_stats_cache_updates` | `20260823235000_allow_derived_stats_cache_updates.sql` | Full statement pulled and diffed: identical SQL body; the ~245-byte length difference is five instances of a two-line `raise exception using / errcode` reformatted onto one line each, no semantic change. |
| `20260824023141` | `allow_completed_round_reclassify` | `20260824030000_allow_completed_round_reclassify.sql` | **See caveat below — the repo file itself says this was not applied. It was.** |
| `20260825121238` | `fix_active_round_stranding_trigger_record_types` | `20260825035557_fix_active_round_stranding_trigger_record_types.sql` | Catalog cross-check, two levels: (1) all four table-specific trigger functions the file creates exist today and the old one-size-fits-all `helm_private.prevent_active_round_stranding` it drops does not; (2) joining `pg_trigger`/`pg_class`/`pg_proc` today shows the actual triggers on `golf_qualifier_entries`, `golf_qualifiers`, `golf_team_members`, `golf_teams` are wired to those four new functions by name — not just that the functions exist, but that they are the ones actually firing. |
| `20260825121310` | `permit_completed_round_recap_write` | `20260825041628_permit_completed_round_recap_write.sql` | The file's `'round_recap'` branch (permitting only `ai_recap`/`ai_recap_generated_at` to change on a completed round) matches, condition-for-condition, the branch present in `helm_private.guard_golf_round_lifecycle()`'s live definition today. |
| `20260825121433` | `restore_golf_round_lifecycle_contract` | `20260825052141_restore_golf_round_lifecycle_contract.sql` | Recorded statement's opening text matches the repo file exactly. The repo file is self-documented as a replay: `"Production has equivalent objects; this is intentionally idempotent so a fresh local database does not omit them."` |
| `20260825124728` | `allow_protected_atomic_round_submit` | `20260825090000_allow_protected_atomic_round_submit.sql` | Full statement pulled and byte-diffed against the repo file (minus its 11-line header comment, which the recorded statement doesn't carry): the entire function body is identical; the only diff is the trailing `COMMENT ON FUNCTION` string being one Postgres string literal in the recorded statement versus three adjacent literals in the repo file — these parse to the identical string (Postgres concatenates whitespace-separated adjacent string constants), so there is no content difference. |
| `20260825125512` | `restore_atomic_lifecycle_capability_v2` | `20260825093000_restore_atomic_lifecycle_capability.sql` (**name differs — no `_v2` in the repo**) | Both are the identical `DO $$ ... $$` block that string-replaces the `'atomic' AND TG_OP = 'UPDATE'` clause back to unrestricted `'atomic'`, differing only in how one embedded newline is written inside the same `E'...'` literal. The live `guard_golf_round_lifecycle()` definition today shows exactly the unrestricted form this block produces, confirming it ran. |
| `20260825233238` | `fix_round_recap_wrapper_definer` | `20260825233000_fix_round_recap_wrapper_definer.sql` | Full statement pulled and byte-diffed against the repo file: identical header comment, identical function body. The only diffs are `public`/`PUBLIC` case on the `REVOKE`, line-wrapping, and the repo file carrying an inline `-- nosemgrep: helmv3-security-definer-without-search-path` suppression comment the recorded statement doesn't have (expected — that comment is for this repo's own static analyzer, not for Postgres) — the resulting `COMMENT` string literal is identical either way. Live catalog cross-check: `pg_proc.prosecdef = true` for `public.save_round_ai_recap` today, confirming the `SECURITY DEFINER` conversion is live (it was `SECURITY INVOKER` before `20260825041628`). |

## The one real discrepancy: `allow_completed_round_reclassify`

`supabase/migrations/20260824030000_allow_completed_round_reclassify.sql`
opens with:

```text
STATUS: PREPARED, NOT APPLIED. This edits a security control
(`guard_golf_round_lifecycle`) and adds a SECURITY DEFINER function, which
is R3 under memory/system/golfhelm-engineering-os.md — owner executes, and
`db-migration-reviewer` review is mandatory first.
```

The file is not lying about the policy — R3 does require that. It is wrong
about the fact. Production's `guard_golf_round_lifecycle()` definition today
contains the exact `'reclassify'` branch this file adds (gating on
`round_type` / `qualifier_id` / `qualifier_round_number`, transaction-local
`postgres`-only marker), and `public.reclassify_golf_round` exists in the
catalog today as a `SECURITY DEFINER` function. Production's recorded
statement for version `20260824023141` starts at exactly
`create or replace function helm_private.guard_golf_round_lifecycle()` —
the file's own SQL body, minus its comment header and the `begin;`/`commit;`
wrapper — which is consistent with someone extracting and running just the
code block, not the reviewed file as a whole.

This was applied to production one day *before* `20260825035557` and the
other 2026-08-25 migrations were layered on top of it — the current live
guard function has been built on the assumption this branch exists ever
since. **This is not schema drift** in the narrow sense this document
checks: the repo file's DDL is exactly what produced the live `'reclassify'`
branch, so the *content* is accounted for (see "What this means for anyone
rebuilding" below for the separate, more limited question of whether a full
replay would actually reach this file). **It is a process-record drift**:
the file's own status comment is stale and asserts something the catalog
contradicts. Anyone reading that comment today would reasonably conclude the
reclassify capability is not live, and it is — has been, in production,
since 2026-08-24.

I did not find, and am not asserting, who ran it or through what channel
(MCP `execute_sql`, the SQL editor, or something else) — only what the
ledger and the catalog show. That the comment should be corrected (or the
migration's status reconciled some other way) is a decision for the owner,
not something this read-only pass makes.

## What this means for anyone rebuilding from migrations

The narrow claim this investigation supports: **none of these 13 versions
is, by itself, a reason a rebuild from `supabase/migrations/*.sql` would
diverge from production**, because the DDL each one applied is already
present in the tree — under a different version number for 12 of them,
under a different name for the 13th (`restore_atomic_lifecycle_capability`).

That is *not* the same claim as "a fresh `supabase db reset` reproduces
production." It does not, and this document is not the place that says
otherwise — `supabase/migrations/HELD.md`, three rows above the one this
investigation adds, already documents why a full replay diverges today:
`20260708141000` and `20260715141727` are held and must not run,
`20260528011000` is obsolete and applying it breaks `dismissInsight` with
`42501`, and `20260825200811` + `20260826010000` are prepared but not yet
applied and would create objects (the `helm_debug` schema, a rewritten
`submit_round_atomic`/`save_partial_round_atomic`) that don't exist in
production yet. A `db reset` runs all of `supabase/migrations/*.sql`
unconditionally — it does not know to skip `HOLD` or `OBSOLETE` rows — so it
was already going to diverge from production before this document, for
reasons that have nothing to do with these 13 versions. I did not run a
reset to confirm any of this end to end; I'm citing what `HELD.md` already
records and did not re-verify it here.

What I *did* check directly: the specific live catalog objects each of the
13 versions touches (`guard_golf_round_lifecycle`, the four stranding-trigger
functions and their trigger wiring, `save_partial_round_atomic`,
`save_round_ai_recap`, `reclassify_golf_round`, `get_feature_health`) match
what the corresponding repo file would produce. That is the full extent of
what this document verifies.

What a rebuild will *not* reproduce is `supabase_migrations.schema_migrations`
matching production row-for-row. Any tooling — including whatever check is
posting "Supabase Preview" red on `main` — that diffs the ledger by version
number rather than by resulting schema will keep reporting these 13 as
missing indefinitely, because the version numbers genuinely don't exist in
the repo and are not something a file rename alone can retroactively
create. I did not independently trace what implementation posts that
specific check — it isn't defined in this repo's own `.github/workflows/`,
which is consistent with it being the Supabase GitHub App's branching/
preview integration rather than a repo-owned job — so I'm not asserting
its exact mechanism, only that the ledger/file mismatch documented here is
a sufficient, verified explanation for a version-keyed diff to flag all 13.

## Options for the owner

**Option A — Repair-only migration files.** Add 13 new files under
`supabase/migrations/` at exactly the missing version numbers
(`20260820172125_*.sql` etc.), each containing only a comment recording
what was actually applied and pointing at the real DDL's file, with no
executable DDL (or DDL that is a guarded, verified-idempotent no-op against
today's catalog shape, in the same style `restore_golf_round_lifecycle_contract`
already uses). This makes the local file tree's version list match
production's ledger, which should satisfy a version-keyed diff.
*Tradeoff:* 13 more files in a migrations directory that already has a lot
of them, each one a placeholder that must never be mistaken for the
authoritative DDL — a future reader who edits the placeholder instead of the
real file would silently diverge from production. Would need `db-migration-reviewer` review before
merging per the OS's R3/schema-change gate, since these are still files
under `supabase/migrations/**` even though several are no-ops.

**Option B — `supabase migration repair`.** The Supabase CLI has a
`migration repair --status applied|reverted <version>` command built exactly
for reconciling a ledger row without re-running SQL. I did not run it as
part of this investigation — it requires linking against the production
project and writing to `supabase_migrations.schema_migrations`, which this
task was scoped never to do. *Tradeoff:* this is the tool built for the
job and requires no new files, but it is a production write, executed only
by the owner, and I have not verified this project's CLI version supports
it against 13 different version numbers in one pass, or what it does to the
existing rows' `name`/`statements` — that would need to be checked (ideally
against a Supabase branch, not production directly) before running it for
real.

**Option C — Accept the drift, document it.** Leave `schema_migrations` and
`supabase/migrations/` as they are and treat this document as the record of
why they disagree and why it is not schema risk. *Tradeoff:* the
version-keyed check (whatever it is) keeps reporting red for these 13
indefinitely, and every future audit has to re-discover or re-trust this
document instead of the ledger being self-evidently correct. Cheapest by
far, and the only one that adds zero risk of a bad repair, but it leaves a
permanently red check that a future session might reasonably want to fix
"for real" without knowing this document already settled it.

None of these three is applied here. This document is the investigation and
options only, per the task's read-only scope.

## What I could not verify

- The exact mechanism of the "Supabase Preview" CI check — I did not find it
  defined in this repo, so I'm inferring it's the Supabase GitHub App's own
  integration rather than confirming its logic directly.
- Who or what specifically ran these 13 statements (MCP tool, SQL editor,
  CLI) beyond the `created_by` account recorded in the ledger.
- Whether any version of `supabase migration repair` against this project
  would behave as Option B assumes — not run, per the read-only scope.

## Related docs

- `docs/operations/SUPABASE_DRIFT_GUARD.md` — the standing read-only drift
  guard and the prior documentation of the version-mismatch pattern.
- `docs/audits/SUPABASE_DRIFT_REPORT_2026-07-03.md` — the original report
  that first found filename/version mismatches since 2026-05-26.
- `supabase/migrations/HELD.md` — the register for migrations deliberately
  not applied; this document's subject is the opposite case (applied, but
  unrecorded by version number).
