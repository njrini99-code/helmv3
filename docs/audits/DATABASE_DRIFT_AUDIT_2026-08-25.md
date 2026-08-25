<!-- markdownlint-disable MD013 -->

# DATABASE DRIFT AUDIT

## Executive Summary

**Final verdict: RED — local cannot yet be treated as a faithful production-parity database.**

The migration chain does rebuild a healthy local database from zero, and the
critical Golf round-save RPC *signatures* match production. Production itself is
not shown to be corrupt by this audit. The immediate risk is instead release,
rollback, and test reliability: application code and the checked-in canonical
types describe production contracts that a fresh local reset did not reproduce.

The root cause is a release-reconciliation failure rather than one bad
migration. Production has 829 migration-ledger entries versus 320 in the reset
local chain, while the repository has 45 migrations absent from the production
ledger. Those 45 are not a single class of work: some are production-equivalent
Golf reliability fixes recorded under different version numbers, some are
intentional unshipped work, some are explicitly held data/security changes, and
some are older out-of-band production captures. That mixture prevents either
database from being blindly declared canonical.

A second mechanism explains the large Baseball gap: the 2026-06 Baseball
model migrations were recorded in production, but several used `CREATE TABLE
IF NOT EXISTS` against older pre-existing table shapes. PostgreSQL correctly
treated those creates as no-ops, while the migration ledger recorded the
version. Later additive production releases supplied the currently required
columns under different timestamps. A ledger match therefore does **not** prove
that a table has the same contract as a fresh local reset.

At least two live production contracts were not reproducible from the current
local migration chain. This audit captured both locally with forward,
idempotent migrations and regression contracts:

1. `public.ncaa_division` now recreates all nine production values locally.
2. `public.golf_teams.season_active` now recreates the production required,
   `true`-by-default column locally.

Two further **deployed-runtime failures** were then proven by comparing literal
application selects to production metadata. They are covered by forward
compatibility migrations and local regression tests, but remain unreleased
until the focused production rollout is reviewed:

1. `baseball_timeline_event_acks` used incompatible actor/timestamp fields in
   the live action and lacked the owner DELETE policy used by withdrawal.
2. `baseball_pitch_events` and `baseball_workload_events` are missing rich
   event fields selected by CoachHelm and Stat Visuals; CoachHelm had treated
   their failed reads as empty data rather than emitting a structured warning.

The literal-selection sweep then identified four additional active-contract
problems. Three were incorrect application selects (`crm_coaches.first_name`,
`crm_coaches.last_name`, `baseball_import_runs.row_count`, and `emails.id`)
that could make an otherwise valid query fail outright. The fourth is a real
camp lifecycle gap: the camps UI already reads and writes `registered_at` and
`attended_at`, but neither production nor a fresh local reset had those
columns. The code query defects are fixed in the working tree; the camp fields
are captured in a forward migration and remain pending production review.

The canonical generated type file was also one RPC behind production:
`save_round_ai_recap`. It has been regenerated from production. It remains a
working-tree change until reviewed and committed.

The major remaining issue is 43 shared table Row contracts that still differ
between fresh local types and freshly generated production types. These are
mostly Baseball/CRM contracts, plus `golf_players`; they must be reconciled
object by object. Do not mass-alter local or production to erase this count.

## Critical Findings

### Finding: incomplete `ncaa_division` local enum

- **Severity:** High
- **Local:** `D2`, `D3` only before this audit.
- **Production:** `D2`, `D3`, `D1`, `NAIA`, `JUCO`, `JUCO_D1`, `JUCO_D2`,
  `JUCO_D3`, `CCCAA`.
- **Application impact:** CRM import/filter/onboarding code and checked-in
  types accept the nine-value contract. Local tests rejected valid D1/NAIA/JUCO
  team data.
- **Root cause:** The baseline migration created the two-value enum; no later
  replayable migration added the remaining production values.
- **Fix:** `20260825211909_reconcile_ncaa_division_production_contract.sql` and
  `ncaa_division_contract.sql`.
- **Status:** Fixed locally and verified by fresh reset. No production change
  was made because production already has the canonical values.

### Finding: missing local `golf_teams.season_active`

- **Severity:** High
- **Local:** Missing before this audit.
- **Production:** `boolean NOT NULL DEFAULT true`.
- **Application impact:** CoachHelm weekly-email logic and Helm Bridge/admin
  team reads select this field. A local integration test could not faithfully
  exercise the same query contract.
- **Root cause:** The field appeared in historical generated production types,
  but no current replayable migration created it.
- **Fix:** `20260825212613_reconcile_golf_team_season_active_production_contract.sql`
  and `golf_teams_season_active_contract.sql`.
- **Status:** Fixed locally and verified by fresh reset. No production change
  was made.

### Finding: generated production types omitted `save_round_ai_recap`

- **Severity:** Medium
- **Local:** Fresh generation and production expose the RPC.
- **Production:** `save_round_ai_recap(p_round_id uuid, p_recap text) -> jsonb`.
- **Application impact:** A future direct call would be untyped; current code
  has no static direct call site.
- **Root cause:** Checked-in types were not regenerated after the production
  RPC appeared.
- **Fix:** Regenerated `src/lib/types/database.ts` from production using the
  repository-pinned CLI.
- **Status:** Fixed in the working tree; must be reviewed/committed.

### Finding: production timeline acknowledgement action had an incompatible write contract

- **Severity:** High
- **Production:** `baseball_timeline_event_acks` requires `team_id`,
  `player_id`, `acked_by`, and `acked_at`, with uniqueness on
  `(timeline_event_id, acked_by)`.
- **Application:** `acknowledgeTimelineEvent` wrote only local
  `user_id`/`acknowledged_at` and used the incompatible conflict key; withdrawal
  also relied on a DELETE policy absent from production.
- **Evidence:** Read-only production metadata and constraint/policy inspection;
  production currently has zero acknowledgement rows, so no existing history
  is altered by the forward reconciliation.
- **Fix:** `20260825222432_reconcile_baseball_timeline_ack_contract.sql`,
  `timeline-acks.ts`, `baseball_timeline_ack_contract.sql`, and the focused
  action regression test.
- **Status:** Verified by local reset, pgTAP, and unit test. Pending its own
  production review and release.

### Finding: rich Baseball event queries fail against production and CoachHelm hid the failure

- **Severity:** High
- **Production:** `baseball_pitch_events` lacks `batter_id`,
  `pitch_type_classified`, `is_called_strike`, and `count_state`; workload
  lacks normalized `count` and `high_intent_count`.
- **Application:** CoachHelm and the pitcher-workload chart select those fields.
  PostgREST rejects an unknown selected column, and the CoachHelm core then
  degraded to empty event data without persisting an operational warning.
- **Evidence:** Read-only production `information_schema` inspection and
  zero-row counts for both tables. The data count means the compatibility
  migration does not need to guess at historical batter identity.
- **Fix:** `20260825223149_reconcile_baseball_event_telemetry_production_contract.sql`
  adds only required columns, safely maps unambiguous legacy values, and leaves
  ambiguous identity/high-intent history null. Engine, action-baseline, and
  outcome-sweep reads now record a structured warning whenever the event source
  cannot be read.
- **Status:** Verified locally by reset, pgTAP, targeted CoachHelm tests,
  typecheck, lint, and local schema lint. Pending focused production review and
  release.

### Finding: active CRM, import, deliverability, and camp queries did not match their tables

- **Severity:** High
- **Production:** `crm_coaches` has a canonical `name`, not split first/last
  name fields; `baseball_import_runs` has `total_rows`, not `row_count`; and
  `emails` is keyed by `resend_message_id`, not `id`. The camps registration
  table had neither `registered_at` nor `attended_at`.
- **Application impact:** the sequence cron could stop an enrollment because a
  coach lookup failed, CoachHelm's import-summary query could reject the whole
  read, the CRM delivery summary could return zero counts, and the camp detail
  page/check-in action could reject its registration timestamp fields.
- **Root cause:** the queries were written for fields that never existed in the
  deployed schemas, while the camp UI was released ahead of its persistence
  columns.
- **Fix:** the three application queries now use real columns and derive split
  CRM names only after a valid full-name lookup. The forward migration
  `20260825224803_reconcile_baseball_active_read_contracts.sql` adds the camp
  fields and captures production-compatible note, import-source, signal, and
  video fields needed for a faithful local read model.
- **Status:** local reset, full pgTAP suite, and focused unit tests pass. The
  schema portion awaits normal production migration review; no production
  mutation was performed.

### Finding: 43 remaining shared table Row-contract mismatches

- **Severity:** High
- **Local:** Fresh reset differs from production in 43 shared table Row shapes.
- **Production:** Canonical type generation is the current deployed contract.
- **Application impact:** The affected tables include heavily-used
  `golf_players`, `crm_coaches`, `baseball_teams`, `baseball_player_stats`,
  `baseball_signals`, and Baseball box-score tables. Local-only tests can give
  false positives or false confidence.
- **Root cause:** Two concurrent product contracts are present in the same
  repository: production retains an older Baseball/CRM model while local
  migrations contain newer Baseball operations/event models. The one Golf
  mismatch is an explicitly unshipped account-history retention migration.
- **Fix:** No mass migration is safe. Reconcile one bounded domain at a time:
  decide whether to ship each newer Baseball model, capture a deployed
  production contract locally where production is authoritative, and keep the
  account-deletion change behind its own rollout decision.
- **Status:** Classified; requires bounded release decisions, not more schema
  guessing.

### Finding: local Golf function bodies intentionally differ from production

- **Severity:** Medium
- **Local:** `save_partial_round_atomic`, `submit_round_atomic`, and
  `reclassify_golf_round` have different definitions/hashes.
- **Production:** Same signatures and security/search-path settings, different
  bodies.
- **Application impact:** The local bodies include later reliability/flight
  recorder work, so local lifecycle behavior is not a byte-for-byte production
  reproduction.
- **Root cause:** unshipped local reliability migrations after the production
  ledger endpoint.
- **Fix:** Keep this explicit and test it; ship only after its own review.
- **Status:** Intentional development divergence, not production-repaired here.

### Finding: focused Golf RLS policy definitions are identical

- **Scope:** `golf_rounds`, `golf_holes`, `golf_shots`, and
  `golf_qualifiers`.
- **Evidence:** Both databases expose the same 36 policy name/command pairs;
  hashes of their effective `USING` and `WITH CHECK` expressions match exactly.
- **Impact:** The current local-versus-production Golf mismatch is not caused
  by a focused RLS policy-body difference. It remains necessary to test the
  different protected-RPC bodies separately.
- **Status:** Verified parity for the focused policy set.

### Finding: deployed Baseball runtime columns are present

- **Scope:** The 12 columns guarded by the repository's existing Baseball
  drift check, including import-source identity, event provenance, decision
  detail, and team/practice settings.
- **Evidence:** A read-only production `information_schema` query returned all
  12 as present; the same guard passes against the rebuilt Docker database.
- **Impact:** The known active Baseball import/read paths are not missing their
  minimum current runtime columns in production. The remaining differences are
  compatibility and model-shape differences, not evidence that these 12
  deployed paths are currently absent.
- **Status:** Verified for this runtime-critical subset.

## Drift Breakdown

| Category | Count | Interpretation |
| --- | ---: | --- |
| Critical schema drift | 3 | Enum, `season_active`, and camp lifecycle columns; the camp forward migration awaits release. |
| Security drift | 0 proven in focused Golf RLS | The 36 focused policy definitions match exactly. Separate advisor findings remain below. |
| Behavioral drift | 3 | Local-only Golf function-body changes with matching signatures. |
| Type-only / generated drift | 1 | `save_round_ai_recap` was missing from tracked production types. |
| Intentional historical drift | 12 | 5 production backups, 1 production CRM view, 1 local backfill manifest, 5 local debug RPCs. |
| Unknown | 1 RPC + release decisions | `can_manage_baseball_lift_group` remains unreferenced; the 43 Row mismatches are now classified by domain and release state below. |

## Database Objects Requiring Attention

| Object | Type | Local | Prod | Risk | Action |
| --- | --- | --- | --- | --- | --- |
| `ncaa_division` | enum | Repaired to 9 values | 9 values | valid teams rejected locally | local repair added |
| `golf_teams.season_active` | column | Repaired: required/default true | required/default true | CoachHelm/admin local contract broken | local repair added |
| `golf_players` | table | includes unshipped anonymization shape; `user_id` contract differs | deployed account contract | local lifecycle test mismatch | reconcile after account-deletion rollout decision |
| `crm_coaches` | table | Row shape differs | active CRM shape | CRM local test mismatch | produce focused contract migration |
| `baseball_camp_registrations.registered_at` / `.attended_at` | columns | Recreated by active-contract migration | missing | camp detail/check-in requests rejected | review and release additive migration |
| Baseball event/stat tables | tables | 40 remaining changed shared Row contracts | deployed Baseball shapes | high local test/release risk | reconcile in bounded groups with domain owners |
| `can_manage_baseball_lift_group` | RPC | second parameter is player-oriented | second parameter is group-oriented | no direct app `.rpc` or policy call found | classify/deprecate or reconcile after lifting owner review |
| `save_partial_round_atomic` / `submit_round_atomic` | RPCs | traced/local newer bodies | production bodies | behavior parity risk, not signature risk | ship/review reliability migration separately |

## Release-Reconciliation Inventory

### Migrations absent from the production ledger

| Classification | Evidence-backed examples | Required action |
| --- | --- | --- |
| Production-equivalent Golf reliability work | `single_flight_partial_round_save`, `single_flight_round_submit`, `feature_health_excludes_resolved_incidents`, `fix_active_round_stranding_trigger_record_types`, `permit_completed_round_recap_write`, and `restore_golf_round_lifecycle_contract` have later production-ledger counterparts with the same purpose. | Compare the exact function bodies and release the local-only follow-ups only after their dedicated tests pass. Do not replay the older migrations into production. |
| Explicitly held or unshipped work | `gate_secdef_ownership_and_redemption`, `baseball_legacy_stats_backfill`, and `preserve_golf_history_on_account_deletion` explicitly say they are held, pending approval, or not yet applied. | Keep these out of production until their owners approve a rollout. Their local state must not be used as production truth. |
| Local development observability | `helm_flight_recorder` creates private `helm_debug` / `helm_private` observability objects. | Treat as a separate feature rollout with security, load, and failure-mode review. |
| Production-object capture / out-of-band repair | `auth_user_created_trigger`, `avatars_storage_bucket_rls`, and `crm_signal_spine` document live production objects that predated their replayable migration. | Verify each live object definition before deciding whether to backfill the production ledger or retain the capture only for new environments. |
| Older application/security/analytics migrations | goals, CRM, Golf statistics, Baseball policies, notification, and lifting migrations. | Classify one domain batch at a time against live metadata and callers; do not infer that an absent ledger row means a missing production behavior. |

### Shared Row contracts still different after the two local repairs

| Domain | Contracts | Classification | Release consequence |
| --- | ---: | --- | --- |
| Golf | 1 (`golf_players`) | Intentional unshipped account-history retention change: nullable `user_id` plus `anonymized_at` locally; production keeps required `user_id`. | Separate data-retention rollout with application/RLS/foreign-key verification. Do not reverse it merely for parity. |
| CRM | 1 (`crm_coaches`) | Deployed production fields and nullability are not fully represented by the local model. | Capture the active CRM contract locally before relying on local CRM integration tests. |
| Helm Lifting | 1 (`helm_lifting_coaches`) | Local-only soft-delete field. | Confirm whether soft deletion is a planned feature or a local-only experiment before any rollout. |
| Baseball core / operations / event models | 40 | Mixed-model divergence: local has newer event, practice, staff, video, and workload fields; production retains alternate/historical fields and nullability. | Split into bounded releases by feature (events, box scores, practice, staff, CRM-style settings). Each needs a contract decision, migration, and regression coverage. |

The full per-table field inventory was generated from fresh local and
production TypeScript contracts during this audit. It is evidence of two
different models, not permission to issue a bulk `ALTER TABLE` sequence.

## RPC Contract Results

| RPC group | Match? | Risk | App usage |
| --- | --- | --- | --- |
| Production public RPC inventory | Yes | Low name-contract risk | All 172 production RPC names occur in fresh local types; local has only five extra `helm_debug_*` observability RPCs. |
| `save_partial_round_atomic` | Yes, signature | Medium body divergence | Golf autosave/partial round path. |
| `submit_round_atomic` | Yes, signature | Medium body divergence | Golf final submit path. |
| `reclassify_golf_round` | Yes, signature | Medium body divergence | qualifier/round lifecycle path. |
| `save_round_ai_recap` | Yes after regeneration | Low | No direct static call site found. |
| Static `.rpc()` call sites | Partial | Medium | Existing source scan covers the normal generated/public calls; dynamic or private-schema calls still require route-level coverage, but no production public RPC is missing from local types. |

## RLS Results

| Table | Local | Prod | Correct? | Action |
| --- | --- | --- | --- | --- |
| `golf_rounds` | RLS enabled, 10 policies | RLS enabled, 10 policies | Policy-count parity only | retain; semantic policy-body review remains part of round reliability work |
| `golf_holes` | RLS enabled, 9 policies | RLS enabled, 9 policies | Policy-count parity only | retain |
| `golf_shots` | RLS enabled, 12 policies | RLS enabled, 12 policies | Policy-count parity only | retain |
| `golf_qualifiers` | RLS enabled, 5 policies | RLS enabled, 5 policies | Policy-count parity only | retain |
| `billing_customers`, `billing_invoices` | RLS enabled, no policies | deny-by-default contract | Intentional | retain; existing pgTAP suite passes |

`admin_allowlist`, `auth_rate_limits`, and the local-only
`baseball_legacy_backfill_manifest` also have RLS enabled without policies.
They require owner confirmation before any change; no permissive policy was
added as a shortcut.

Advisor findings are separate from proven drift: local advisors report four
public security-definer views, one function with mutable `search_path`, and
many performance warnings (RLS init-plan and duplicate-index findings). Those
need a dedicated security/performance remediation pass; this audit did not
weaken RLS or change grants.

## Enum Results

| Enum | Local | Prod | Canonical | Action |
| --- | --- | --- | --- | --- |
| `ncaa_division` | 9 values after repair | 9 values | production + app validation | regression migration and pgTAP test added |

## Untracked Production Changes

Evidence indicates at least these production contracts were not reproducible
from the previous current migration chain:

1. `public.ncaa_division` values `D1`, `NAIA`, `JUCO`, `JUCO_D1`, `JUCO_D2`,
   `JUCO_D3`, `CCCAA`.
2. `public.golf_teams.season_active boolean NOT NULL DEFAULT true`.

They are now represented by additive, idempotent local migrations. Production
already has both contracts, so this audit made no production change.

## Local-Only Objects

- `public.baseball_legacy_backfill_manifest`: introduced by an explicitly held
  historical backfill migration; do not treat as deployable production schema.
- `helm_debug.*` flight-recorder RPCs: local/development observability work.
  Keep out of production until reviewed as part of that feature.
- `golf_players.anonymized_at`: local account-deletion migration state not yet
  present in production; requires a separate production rollout decision.

## Production-Only Historical Objects

- `backup_ci_junk_rounds_20260821`
- `backup_class_semester_20260813`
- `backup_prevyear_classes_20260821`
- `crm_email_templates_backup_20260720`
- `schema_migrations_pruned_20260820`
- `v_crm_coaches_by_school`

No application `.from()` use was found for the five backup tables or the CRM
view. They should remain production historical/operational artifacts until an
owner explicitly chooses archival or removal. Capturing a read-only schema
description may be useful; copying these into the local development contract is
not currently justified.

## Changes Made

- `supabase/migrations/20260825211909_reconcile_ncaa_division_production_contract.sql`
- `supabase/tests/rls/ncaa_division_contract.sql`
- `supabase/migrations/20260825212613_reconcile_golf_team_season_active_production_contract.sql`
- `supabase/tests/rls/golf_teams_season_active_contract.sql`
- `scripts/gen-db-types.sh` — repository-pinned Supabase CLI, preserving its
  existing safe temp-file write behavior.
- `scripts/check-types-drift.sh` — also uses the repository-pinned CLI rather
  than a floating `npx` resolution.
- `scripts/db/check-supabase-drift.mjs` — local Docker connections no longer
  incorrectly require TLS; the rollup-gate check now recognizes the approved
  `__admin_rollup_b_gate` helper; and the function scan excludes aggregates
  before asking PostgreSQL for a function definition.
- `scripts/test-pgtap.sh` and `package.json` — makes `npm run test:rls` execute
  the actual pgTAP suites rather than an empty Vitest project.
- `src/lib/types/database.ts` — regenerated production type contract; adds
  `save_round_ai_recap`.

`src/types/database.types.ts` is an untracked local audit artifact generated at
the user's requested path; it is not the application’s canonical type import.

## Production Changes Proposed

None were executed.

Before any production schema change, first create a reviewed reconciliation
series for the 43 remaining shared Row contracts. The first candidate groups
are: active Baseball box-score/event ingestion contracts, CRM coach contracts,
and the Golf player account-deletion contract. Each migration needs production
metadata evidence and a dedicated regression test.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Fresh Supabase reset | PASS | `supabase db reset --local` completed after both repairs. |
| Migration replay | PASS | Local schema and seed rebuilt from migrations; `HELD.md` was skipped intentionally. |
| Generated types clean | FAIL (expected working-tree change) | production generation adds the missing recap RPC; must be committed after review. |
| TypeScript | PASS | `npm run typecheck`. |
| Lint | PASS | `npm run lint`. |
| Unit tests | PASS | 1,175 files passed; 10,849 tests passed, 6 skipped. |
| Database tests | PASS | 67 real pgTAP files, 1,147 assertions; shared helper excluded correctly. |
| RLS tests | PASS | `npm run test:rls` now runs the pgTAP harness and exits 0. |
| Local read-only drift guard | PASS | `DATABASE_URL=<local Docker connection> npm run db:drift:check`; all 11 checks pass. |
| Integration tests | PASS | 6 files, 29 tests. |
| Build | PASS | `npm run build`; compiled and generated all 179 static pages. |
| Browser/E2E tests | NOT RUN | Requires a separately configured authenticated browser fixture. |
| Full preflight | FAIL, pre-existing baseline ratchets | `lint-ratchet` and Supabase-read baseline are one count behind current known values; not updated because those changes are outside this audit. |

## Remaining Risk

1. Fresh local is now safer, but **not production-parity** while 43 shared Row
   contracts differ.
2. Local Golf round behavior includes unshipped reliability/tracing body
   changes. Passing local round tests do not by themselves prove production
   behavior.
3. Generated type checks only detect production-type staleness. A local-vs-prod
   parity gate cannot be enabled until expected development-only objects and
   the 43 remaining contracts are classified.
4. Security advisor errors need their own reviewed remediation, especially
   public security-definer views. Do not flip them to invoker without validating
   the intended public-profile behavior.

## Final Verdict

RED

The local chain is reproducibly buildable and two concrete app-breaking
contracts are repaired. However, the remaining 43 shared table-contract
differences mean local cannot yet be trusted as a complete representation of
production. The next safe step is bounded reconciliation by domain, not a bulk
schema overwrite.
