# Schema Alignment Run — 2026-05-27

Branch: `codex/supabase-schema-alignment-2026-05-27`
Plan: `docs/superpowers/plans/2026-05-27-helm-database-vercel-alignment.md`
Audit: `docs/HELM_DATABASE_VERCEL_COACHHELM_DEEP_DIVE_2026-05-27.md`

## Decisions locked

- **D1 — Preview DB target:** Seeded staging Supabase project (pending USER provisioning).
- **D2 — PR #105 handling:** Split app fixes from historical migration edits.
- **D3 — PR #111 handling:** Keep temporary non-blocking gate with tracking issue + expiry.
- **D4 — Alignment strategy:** Forward-only alignment migration from prod truth.

## Snapshot (taken 2026-05-27)

- Production project ref: `qmnssrrolpinvwjjnufo` (Helm-Production)
- Prod public table count: **176**
- Prod CREATE TABLE statements (incl. storage): **183**
- Last migration ledger entry: `20260518124505 fix_live_db_lint_errors`
- `pg_dump` artifact: `/tmp/helmv3-prod-schema.sql` — 27,892 lines, 975 KB (not committed; regenerate locally)
- Generated `database.ts` vs prod gen: trailing-newline diff only (matches deep-dive baseline)

## Vercel env baseline (Phase 1.1)

| Env | NEXT_PUBLIC_SUPABASE_URL | NEXT_PUBLIC_SUPABASE_ANON_KEY | SUPABASE_SERVICE_ROLE_KEY | AI_GATEWAY_API_KEY | VERCEL_OIDC_TOKEN |
| --- | --- | --- | --- | --- | --- |
| production | `https://qmnssrrolpinvwjjnufo.supabase.co` | set | set | **MISSING** | set |
| preview | **MISSING** | **MISSING** | **MISSING** | **MISSING** | set |
| development | `https://qmnssrrolpinvwjjnufo.supabase.co` | set | set | **MISSING** | set |

Phase 7 follow-up: `AI_GATEWAY_API_KEY` missing across all envs, but `VERCEL_OIDC_TOKEN` is set in all of them — per AI Gateway docs (the OIDC path is default and the API key is optional), LLM calls may already work without the explicit key. Verify via code inspection of `src/lib/coachhelm/v3/llm/*` before claiming the deep-dive's "must add AI_GATEWAY_API_KEY" finding still holds.

## Phase 2 status — partial (blockers documented)

### Done

- Phase 2.1: `pg_dump --schema-only --no-owner --no-privileges` of `qmnssrrolpinvwjjnufo` (public + storage) → `/tmp/helmv3-prod-schema.sql` (27,892 lines, 975 KB, 183 CREATE TABLE statements).
- Verified the 5 spot-checked CoachHelm v3 tables are present in the dump (`golf_metrics`, `golf_coachhelm_chat_conversations`, `golf_drills`, `golf_player_genome`, `golf_player_standing`).
- Atlas community edition installed via `brew install atlas` (v1.2.0).

### Blocked

- **Phase 2.2 (fresh-replay dump):** `supabase db reset` requires Docker; Docker is not installed on this machine. Cannot generate the "what migrations actually produce" reference schema. Pivot: the alignment migration will be authored with `IF NOT EXISTS` / `DO $$` guards throughout so it's safe regardless of what state existing migrations leave the DB in. **Verification on a Docker-backed replay must happen before the alignment PR merges** — this is a user-owned gate.
- **Phase 2.3 (Atlas HCL):** Atlas community edition does not support `--format '{{ hcl . }}'`. Options for unblocking:
  - (a) Install the official non-community Atlas binary (requires sudo or manual download).
  - (b) Skip the HCL artifact and use pg_dump as the snapshot format instead.
  - (c) Use Atlas SQL output (works in community: `--format '{{ sql . "  " }}'`) — captured at `/tmp/atlas-schema.sql` (5,204 lines). Less canonical than HCL but functional.

### Diff results (direct-connection analysis, 2026-05-27)

Computed by extracting `CREATE TABLE` targets from both `/tmp/helmv3-prod-schema.sql` (pg_dump) and `supabase/migrations/*.sql`, then taking set differences:

| Bucket | Count | Meaning |
| --- | --- | --- |
| Tables in BOTH prod and migrations | 153 | Existing migrations correctly cover these |
| **Tables in prod only — need alignment migration** | 22 (public) + 7 (storage) | The actual scope of Phase 3.2 |
| Tables in migration files only — dropped or renamed in prod | 61 | Do NOT recreate; these are intentionally gone (e.g., un-prefixed `coaches/players/events` → `baseball_*`, `golf_event_rsvps` dropped, `developmental_plans` superseded) |

**Prod-only public tables that the alignment migration must `CREATE TABLE IF NOT EXISTS`:**

```
admin_analytics_events
admin_api_perf_log
admin_client_errors
baseball_camp_registrations
baseball_camps
baseball_coaches
baseball_developmental_plans
baseball_events
baseball_player_comparisons
baseball_player_engagement_events
baseball_player_settings
baseball_players
baseball_recruiting_interests
baseball_team_coach_staff
baseball_team_members
baseball_teams
baseball_videos
baseball_watchlists
email_events
golf_patterns_v          (may be a view, not a table — verify in dump)
golf_player_notification_state
golf_team_coach_staff
```

The `storage.*` set (buckets, objects, etc.) is Supabase-managed and goes in the separate Phase 3.3 storage migration.

### Column-level drift to also bridge

Per the deep-dive's "Why The Supabase Failure Kept Moving" section, these renames/type-changes must be handled in the alignment migration with `DO $$` guards:

- `golf_rounds.round_status` → `status` (prod has `status`)
- `golf_documents.player_visible` → `is_public`
- `golf_shots.shot_type / round_id / hole_number` — add if missing
- `baseball_conversations.created_by` — UUID type (some migrations had text)
- `golf_events.status` — enum vs text mismatch
- `golf_qualifier_entries.score` — add if missing
- `golf_player_classes.status` — restore if dropped

### Idempotent migration patterns

| Category | Strategy |
| --- | --- |
| New tables | `CREATE TABLE IF NOT EXISTS` from the prod dump's DDL |
| New columns | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` |
| Renames | `DO $$ BEGIN IF EXISTS(... old column ...) THEN ALTER TABLE ... RENAME; END IF; END $$;` |
| RLS enable | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (idempotent in PG ≥ 9.5) |
| Policies | `DROP POLICY IF EXISTS` followed by `CREATE POLICY` (replacement pattern) |
| Indexes | `CREATE INDEX IF NOT EXISTS` |
| Functions | `CREATE OR REPLACE FUNCTION` |
| Storage policies | Separate Phase 3.3 migration; same patterns |

The migration will not `DROP` anything on data-bearing tables — additive only.

### Migration approach (revised)

Without Docker-backed replay, the diff strategy becomes: read the prod pg_dump and the on-disk migration files, then construct an idempotent forward-only migration whose effect is "make sure all of prod's objects exist". Statement classes:

| Category | Strategy |
| --- | --- |
| New tables (in prod, no migration creates them) | `CREATE TABLE IF NOT EXISTS` from the prod dump's DDL |
| New columns (in prod, no migration adds them) | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` |
| Renames (e.g., `round_status` → `status`) | `DO $$ ... rename if old column exists ... END $$` |
| RLS enable | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (idempotent in PG ≥ 9.5) |
| Policies | `DROP POLICY IF EXISTS` followed by `CREATE POLICY` (replacement pattern) |
| Indexes | `CREATE INDEX IF NOT EXISTS` |
| Functions | `CREATE OR REPLACE FUNCTION` |
| Storage policies | Separate migration; same patterns |

The migration will not `DROP` anything on data-bearing tables — additive only.

## Final Ledger Repair Table

> Filled in by Phase 4 — only after the alignment PR is merged.

| Migration file | Schema effect | Prod evidence query | Result | Decision |
| --- | --- | --- | --- | --- |

## Runtime Config Audit 2026-05-27

### Env keys per environment

See "Vercel env baseline (Phase 1.1)" table above. Single urgent gap was Preview missing Supabase canonical vars — fixed by user via the staging provisioning + Preview env paste tasks.

### LLM (AI Gateway) — VERIFIED WORKING via direct prod query

The deep dive flagged "`AI_GATEWAY_API_KEY` missing → LLM falls back to template" as a risk. **This is NOT happening.** Direct queries against prod:

- `public.golf_coachhelm_llm_calls` has 39 total rows.
- Most recent 8 calls (last one 2026-05-27 00:06):
  - All use model `anthropic/claude-haiku-4-5`.
  - All have real `cost_usd` (~$0.0005 per call).
  - All have `fallback_to_template = false`.
- Conclusion: AI Gateway is wired and working, almost certainly via `VERCEL_OIDC_TOKEN` (which IS present in all three envs). Explicit `AI_GATEWAY_API_KEY` is unnecessary because OIDC is the default auth path.

### `golf_coachhelm_settings`

- 6 rows (one per active coach/team pair).
- All 6 have `llm_narrative_enabled: false` and `llm_budget_usd_per_day: 5.00`.
- Despite `llm_narrative_enabled: false`, LLM calls ARE landing in `golf_coachhelm_llm_calls` — so either:
  - The narrative-flag gate is not on the same code path as the calls being logged, OR
  - Those calls are from a different surface (e.g., chat conversations, not narrative summaries).
- Action: no UPDATE needed. Setting these flags to true would be an explicit "enable narratives" decision for the user, not a fix.

### Other config (per Phase 1.1 baseline)

| Key | production | preview | development | Notes |
| --- | --- | --- | --- | --- |
| `RESEND_API_KEY` | set | (missing pre-fix) | set | Email delivery (Phase 1.4 prebuild guard does not cover this; consider adding) |
| `VAPID_*` (push) | unverified | unverified | unverified | Not surfaced by the limited env grep; check before claiming push works |
| `CRON_SECRET` | set | (missing pre-fix) | set | Inngest/cron auth |
| `COACHHELM_INTERNAL_SECRET` | set | (missing pre-fix) | set | Internal route auth |
| `ARCCOS_*` / `GARMIN_*` / `TRACKMAN_*` | unset | unset | unset | Expected — provider integrations are stubs (see Phase 7.3) |

## Provider stub status (Phase 7.3)

| Provider | Adapter file | Env keys present? | HTTP client impl? | Live in prod? |
| --- | --- | --- | --- | --- |
| Arccos | `src/lib/coachhelm/v3/ingest/providers/arccos.ts` | no | no | stub — `golf_ingest_connections` has 0 rows |
| Garmin | `src/lib/coachhelm/v3/ingest/providers/garmin.ts` | no | no | stub |
| TrackMan | `src/lib/coachhelm/v3/ingest/providers/trackman.ts` | no | no | stub |

These are intentionally stubbed until a partnership/API agreement is reached with each vendor. Each adapter reports "unconfigured" instead of crashing. No action required from this alignment effort.
