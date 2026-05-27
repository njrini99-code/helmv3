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

### Diff approach (revised)

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

> Filled in by Phase 7.

## Provider stub status

> Filled in by Phase 7.3.
