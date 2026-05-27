# Helm Database, Vercel, Supabase, and CoachHelm Deep Dive

Date: 2026-05-27

Repository: `/Users/ricknini/Downloads/helmv3`

Primary question:

> Is Vercel reading an empty Helm database, are the new CoachHelm features at risk from the recent migration churn, and is the live database correct or are the docs correct?

## Executive Conclusion

Production is not pointed at the empty database.

Production Vercel is configured to use the live Supabase project:

```text
qmnssrrolpinvwjjnufo
Helm-Production
https://qmnssrrolpinvwjjnufo.supabase.co
```

The empty database is real, but it appears to be a separate Supabase/Vercel integration artifact referenced by local prefixed variables such as `helm_POSTGRES_URL_NON_POOLING`. The app does not read those prefixed `helm_*` variables for normal Supabase operation.

The more important problem is that Vercel Preview is missing canonical Supabase environment variables. Production and development have canonical Supabase variables. Preview, from the pulled env snapshot, does not. That means preview deployments can look empty, broken, unauthenticated, or placeholder-backed even while production is correctly connected.

The live production database schema is mostly correct for the CoachHelm v3 work. The generated TypeScript database types match live production. The docs are directionally correct about what exists in production, but misleading about migration hygiene. The broken piece is the migration history and fresh-database replay path.

In plain English:

```text
Production DB: mostly correct
Generated types: correct
Production Vercel env: points at production DB
Preview Vercel env: missing Supabase vars
Docs: mostly right about shipped objects, wrong/incomplete about schema-as-code discipline
Migration ledger: stale/broken after May 18
Fresh DB replay: unreliable
PR #105 schema edits: not a trustworthy alignment strategy
PR #111: only makes Supabase CI non-blocking; it is not the real schema fix
```

## High-Level Diagnosis

There are four separate states that got blurred together:

1. Live production schema
2. Supabase migration ledger
3. Fresh local migration replay
4. Vercel runtime environment

The live schema can be correct while migration replay is broken.

The generated types can be correct while the historical migration files are not replayable.

Production can be wired correctly while Preview is missing the DB env vars.

CoachHelm can have its tables and rows while some higher-level surfaces still fall back because AI/provider keys are missing.

That is exactly what is happening here.

## What I Reviewed

I reviewed these layers:

### Git And PR State

- Current branch
- Last six days of first-parent git history
- `origin/main`
- PR #105
- PR #111
- Open PR checks
- Recent migration commits
- Recent CoachHelm v3 wave commits
- Inngest hotfix history

Key commands:

```bash
git branch --show-current
git status --short
git rev-parse origin/main
git log --since='6 days ago' --first-parent --oneline --decorate --all --max-count=80
gh pr checks 105 --repo njrini99-code/helmv3 --watch=false
gh pr checks 111 --repo njrini99-code/helmv3 --watch=false
gh pr view 105 --repo njrini99-code/helmv3 --json number,title,headRefName,baseRefName,mergeable,reviewDecision,isDraft,commits,url
gh pr view 111 --repo njrini99-code/helmv3 --json number,title,headRefName,baseRefName,mergeable,reviewDecision,isDraft,commits,url
```

### Vercel Project And Environment

- `.vercel/project.json`
- Vercel project list
- Production env
- Preview env
- Development env
- Production deployment inspect
- Preview deployment inspect
- Whether another Vercel project was obviously being used

Key commands:

```bash
cat .vercel/project.json
vercel project ls
vercel env list production
vercel env list preview
vercel env list development
vercel env pull /tmp/helmv3-vercel-production.env --environment=production
vercel env pull /tmp/helmv3-vercel-preview.env --environment=preview
vercel env pull /tmp/helmv3-vercel-development.env --environment=development
vercel inspect helmv3.vercel.app
```

Safe env inspection pattern:

```bash
for f in /tmp/helmv3-vercel-production.env /tmp/helmv3-vercel-preview.env /tmp/helmv3-vercel-development.env; do
  test -f "$f" || continue
  echo "FILE $(basename "$f")"
  grep -E '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY|OPENAI_API_KEY|AI_GATEWAY|ANTHROPIC|ARCCOS_|GARMIN_|TRACKMAN_|RESEND_API_KEY|VAPID_|CRON_SECRET|COACHHELM_INTERNAL_SECRET)=' "$f" \
    | sed -E 's/(KEY|SECRET|TOKEN|PASSWORD)=.*/\1=<set>/' \
    | sed -E 's/(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL)="?([^"[:space:]]+).*/\1=\2/'
done
```

### Local Env Files

- `.env.local`
- `.env.development.local`
- `.env.production.local`
- `.vercel/.env.production.local`
- Which variables are canonical vs integration-prefixed

Key search:

```bash
rg -n "NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|helm_POSTGRES|helm_SUPABASE|placeholder.supabase" .env* .vercel src
```

### App Code Env Resolution

I checked which variables the app actually reads.

Relevant files:

- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/admin.ts`
- `src/lib/supabase/middleware.ts`
- `middleware.ts`
- `src/lib/notifications/push.ts`
- `src/lib/auth/supabase-rate-limit.ts`

Key command:

```bash
rg -n "placeholder.supabase|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY" src middleware.ts
```

Important result:

```text
src/lib/supabase/client.ts reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
src/lib/supabase/server.ts reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
src/lib/supabase/middleware.ts reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
src/lib/supabase/admin.ts reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
```

The app does not use `helm_SUPABASE_URL`, `helm_POSTGRES_URL`, or other prefixed Vercel integration variables as canonical runtime configuration.

### Supabase Live Project

I checked the live project identity, generated types, migration history, and key tables.

Tools used:

- Supabase MCP/plugin where available
- Supabase CLI
- `psql`
- `pg_dump` from earlier work
- Type generation

Key commands:

```bash
npx supabase gen types typescript --project-id qmnssrrolpinvwjjnufo > /tmp/helmv3-prod-types.ts
diff -u src/lib/types/database.ts /tmp/helmv3-prod-types.ts
```

For direct DB checks without printing secrets:

```bash
set -a
source .env.local >/dev/null 2>&1
set +a

psql "$HELM_PROD_DB_URL_DIRECT" -v ON_ERROR_STOP=1 -Atc "
select
  current_database() || chr(9) ||
  current_user || chr(9) ||
  (select count(*) from information_schema.tables where table_schema = 'public') || chr(9) ||
  (select count(*) from pg_namespace where nspname = 'storage') || chr(9) ||
  (select count(*) from pg_namespace where nspname = 'auth');
"
```

For the empty database:

```bash
set -a
source .env.local >/dev/null 2>&1
set +a

psql "$helm_POSTGRES_URL_NON_POOLING" -v ON_ERROR_STOP=1 -Atc "
select
  current_database() || chr(9) ||
  current_user || chr(9) ||
  (select count(*) from information_schema.tables where table_schema = 'public') || chr(9) ||
  (select count(*) from pg_namespace where nspname = 'storage') || chr(9) ||
  (select count(*) from pg_namespace where nspname = 'auth');
"
```

Observed result:

```text
helm_POSTGRES_URL_NON_POOLING: public table count = 0
HELM_PROD_DB_URL_DIRECT: public table count = 176
```

That is the cleanest proof that the "other Helm database" exists and is empty, but the production app points elsewhere.

### Supabase Migration Ledger

The production `supabase_migrations.schema_migrations` ledger only records migrations up to May 18, even though the live schema contains many later CoachHelm v3 objects.

Representative query:

```sql
select version, name
from supabase_migrations.schema_migrations
where version >= '20260518000000'
order by version;
```

Observed state:

```text
20260518123207 fix_crm_email_events_security_invoker
20260518124505 fix_live_db_lint_errors
```

This is the smoking gun for migration-history drift. The schema moved after May 18, but the migration ledger did not keep an authoritative record of those changes.

### CoachHelm v3 Schema And Data

I checked the live existence, RLS state, policy counts, columns, and row counts for the core v3 tables.

Representative table list checked:

```text
golf_metrics
golf_pga_standards
golf_player_standing
golf_goals
golf_goal_suggestions
golf_coach_player_intent
golf_coachhelm_llm_budget
golf_coachhelm_llm_calls
golf_coachhelm_chat_conversations
golf_coachhelm_chat_messages
golf_player_genome
golf_insight_outcome_attribution
golf_coachhelm_coach_weights
golf_ingest_connections
golf_ingest_sync_log
golf_practice_sessions
golf_drills
golf_drills_tagged_with_metric
```

Representative live counts:

```text
golf_metrics: 28
golf_pga_standards: 28
golf_player_standing: 199
golf_goals: 5
golf_goal_suggestions: 0
golf_coach_player_intent: 0
golf_coachhelm_llm_budget: 2
golf_coachhelm_llm_calls: 39
golf_coachhelm_chat_conversations: 0
golf_coachhelm_chat_messages: 0
golf_player_genome: 25
golf_insight_outcome_attribution: 0
golf_coachhelm_coach_weights: 0
golf_ingest_connections: 0
golf_ingest_sync_log: 0
golf_practice_sessions: 0
golf_drills: 63
golf_drills_tagged_with_metric: 63
```

Interpretation:

- Seeded/reference objects exist where expected.
- Backfilled objects exist where expected.
- Zero-row tables mostly correspond to unused/newly activated behavior, not missing schema.
- Chat tables being empty means no live chat history yet, not necessarily broken schema.
- Ingest tables being empty is expected because providers are stubs and provider credentials are absent.
- Causality/weights being empty can be expected until enough surfaced insights age into attribution windows.

### CoachHelm Runtime Config

I checked the v3 runtime dependencies that can make a feature fall back even when schema exists.

Relevant files:

- `src/lib/coachhelm/v3/llm/compose.ts`
- `src/lib/coachhelm/v3/llm/types.ts`
- `src/lib/coachhelm/v3/ingest/providers/arccos.ts`
- `src/lib/coachhelm/v3/ingest/providers/garmin.ts`
- `src/lib/coachhelm/v3/ingest/providers/trackman.ts`
- `docs/END-OF-RUN-2026-05-26.md`
- `vercel.json`

Key search:

```bash
rg -n "OPENAI_API_KEY|AI_GATEWAY|ANTHROPIC|generateText|streamText|model\\(|provider|Gateway" src/lib/coachhelm src/app/api/cron src/lib -g '!node_modules'
```

Important finding:

`docs/END-OF-RUN-2026-05-26.md` says:

```text
AI_GATEWAY_API_KEY + non-zero golf_coachhelm_settings.llm_budget_usd_per_day required
or all calls fall back to template.
```

The pulled Vercel env snapshot did not show `AI_GATEWAY_API_KEY`. The code is designed to catch `generateText` errors and fall back cleanly, so this is probably not a hard crash. It is a "feature silently becomes template mode" risk.

Provider ingest is also intentionally not complete:

```text
ARCCOS_CLIENT_ID + ARCCOS_CLIENT_SECRET required
GARMIN_CONSUMER_KEY + GARMIN_CONSUMER_SECRET required
TRACKMAN_API_KEY required
Provider HTTP-client implementation still required
```

The provider adapters report unconfigured/stub state instead of crashing.

### Docs

I reviewed:

- `docs/v3-master-plan.md`
- `docs/v3-wave-sequence.md`
- `docs/END-OF-RUN-2026-05-26.md`
- `CLAUDE.md`
- `AGENTS.md`
- generated database types

Important doc tension:

`docs/v3-wave-sequence.md` says many waves were applied and verified in production. Live schema mostly supports that claim.

But `docs/v3-master-plan.md` also lays down strict migration discipline:

```text
One purpose per migration
Schema verification before migration writes
One wave = one branch = one PR = one ship
Migration ships with the code that uses it
Idempotent migrations always
```

The current production migration ledger does not support the idea that all of that discipline was followed end-to-end.

So the docs are not simply "wrong". They are accurate about much of what exists, but they overstate the reliability of how it got there.

## Thought Process

I used a layer-by-layer root-cause approach instead of treating all red checks as one problem.

### Question 1: What does production Vercel actually read?

The scary hypothesis was:

```text
Maybe Vercel is pointed at the empty Helm database.
```

To test that, I compared:

- Vercel production env
- Vercel preview env
- Vercel development env
- local `.env*` files
- actual code paths that read env vars

Production pulled env showed:

```text
NEXT_PUBLIC_SUPABASE_URL=https://qmnssrrolpinvwjjnufo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<set>
SUPABASE_SERVICE_ROLE_KEY=<set>
```

Development also had canonical Supabase vars.

Preview did not.

Conclusion:

```text
Production is not using the empty database.
Preview is missing Supabase env and can produce misleading behavior.
```

### Question 2: Is the empty database real?

Yes.

The local `.env.local` has integration-prefixed variables for another Supabase project. I queried that DB without printing secrets and it had zero public tables.

But the app code does not read those prefixed names.

Conclusion:

```text
The empty DB exists, but it is not the production app's canonical DB.
```

### Question 3: Is `database.ts` lying?

I regenerated types from the live production project:

```bash
npx supabase gen types typescript --project-id qmnssrrolpinvwjjnufo > /tmp/helmv3-prod-types.ts
diff -u src/lib/types/database.ts /tmp/helmv3-prod-types.ts
```

The diff was only a trailing newline.

Conclusion:

```text
src/lib/types/database.ts matches production.
```

That means the generated types are a good practical snapshot of the live schema.

### Question 4: Are the migrations replayable?

No.

The Supabase CI failure history and direct migration-ledger inspection both show that fresh replay is not reliable.

The repo has many migration files after May 18, and the live database has many schema objects from those waves, but production's migration ledger does not record those migrations.

Conclusion:

```text
The live DB moved ahead of the repo migration ledger.
Fresh replay is broken because migration files assume prod-only state that is not present on a new DB.
```

### Question 5: Did the whack-a-mole fixes prove anything useful?

Yes, but not what they initially appeared to prove.

They proved that many later migrations assume dashboard-era or live-prod-only schema state.

They did not prove that a sequence of historical migration edits is the right fix.

The `round_status` change in PR #105 is the clearest warning. It may help one replay path because older migrations had `round_status`, but live production has `status`. That means editing history to satisfy local replay can move the repo farther from production truth.

Conclusion:

```text
PR #105 contains useful app/review-gate cleanup, but its migration edits should not be treated as canonical schema alignment.
```

### Question 6: Are the new CoachHelm features broken?

Schema-wise, mostly no.

Runtime-wise, some surfaces may degrade or be inactive because config/provider work is incomplete.

Examples:

- LLM tables exist and call logs exist.
- If `AI_GATEWAY_API_KEY` is missing, the LLM wrapper should fall back to template mode.
- Ingest tables exist, but Arccos/Garmin/TrackMan adapters are explicitly stubs.
- Drills are tagged, so Practice Rx has the needed drill catalog state.
- Preview deployments are not reliable for testing CoachHelm unless Preview Supabase env is fixed.

Conclusion:

```text
The new CoachHelm schema was not obviously destroyed by the iterations.
But preview env and runtime provider configuration can make features appear broken.
```

## Specific Findings

### Finding 1: Production Vercel Uses Helm-Production

Evidence:

```text
NEXT_PUBLIC_SUPABASE_URL=https://qmnssrrolpinvwjjnufo.supabase.co
```

Supabase project:

```text
Project ref: qmnssrrolpinvwjjnufo
Project name: Helm-Production
Status: ACTIVE_HEALTHY
Region: us-east-1
Postgres: 17.6.1.063
```

Impact:

Production is not accidentally reading the empty database.

### Finding 2: The Empty DB Exists But Is Not Canonical

Evidence:

```text
helm_POSTGRES_URL_NON_POOLING: public table count = 0
HELM_PROD_DB_URL_DIRECT: public table count = 176
```

Impact:

This explains the confusion. There is another Helm/Supabase integration database, but the app's runtime code is not wired to it by canonical env var names.

### Finding 3: Vercel Preview Is Missing Supabase Env

Production env snapshot included:

```text
NEXT_PUBLIC_SUPABASE_URL=<set to qmnssrrolpinvwjjnufo>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<set>
SUPABASE_SERVICE_ROLE_KEY=<set>
```

Development env snapshot included the same canonical Supabase set.

Preview env snapshot only showed non-Supabase operational keys such as:

```text
COACHHELM_INTERNAL_SECRET=<set>
CRON_SECRET=<set>
RESEND_API_KEY=<set>
```

Impact:

PR previews can be misleading. Some routes will use placeholder Supabase clients; admin-backed routes will throw missing credentials. This can make a good database look empty or broken.

### Finding 4: `database.ts` Matches Production

Evidence:

```bash
npx supabase gen types typescript --project-id qmnssrrolpinvwjjnufo > /tmp/helmv3-prod-types.ts
diff -u src/lib/types/database.ts /tmp/helmv3-prod-types.ts
```

Observed:

```text
Only trailing newline difference
```

Impact:

The generated types are trustworthy as a practical source of production schema truth.

### Finding 5: Migration Ledger Is Stale

Evidence:

Production migration history only listed post-May-18 records:

```text
20260518123207 fix_crm_email_events_security_invoker
20260518124505 fix_live_db_lint_errors
```

But git history and live schema show W9-W42 schema objects added after that.

Impact:

Supabase CLI operations that depend on migration history can fail or lie. Fresh replay is not the same as production.

### Finding 6: Live CoachHelm v3 Schema Mostly Exists

Confirmed live objects include:

```text
golf_metrics
golf_pga_standards
golf_player_standing
golf_goals
golf_goal_suggestions
golf_coach_player_intent
golf_coachhelm_llm_budget
golf_coachhelm_llm_calls
golf_coachhelm_chat_conversations
golf_coachhelm_chat_messages
golf_player_genome
golf_insight_outcome_attribution
golf_coachhelm_coach_weights
golf_ingest_connections
golf_ingest_sync_log
golf_practice_sessions
golf_drills
```

Impact:

The recent migration iterations did not obviously erase or corrupt the main CoachHelm v3 schema.

### Finding 7: Some CoachHelm Features Are Config-Gated

LLM:

```text
AI_GATEWAY_API_KEY required for real LLM output.
Fallback template path exists.
```

Ingest:

```text
ARCCOS_CLIENT_ID/SECRET required
GARMIN_CONSUMER_KEY/SECRET required
TRACKMAN_API_KEY required
Provider HTTP clients still need implementation
```

Email:

```text
RESEND_API_KEY present in pulled env snapshot.
```

Push:

```text
VAPID keys were not shown in the latest sanitized pull output, though prior docs mention VAPID was configured for prod/dev.
Needs live recheck before push notification claims.
```

Impact:

The database being correct does not mean every CoachHelm v3 surface is fully live. Some are intentionally fallback/stub/inactive until provider env and implementation work is finished.

### Finding 8: PR #105 Is Not Safe As A Schema Alignment PR

PR #105 has useful work:

- Review Gate cleanup
- semgrep/ast-grep tuning
- real server-action fixes
- v3 composite null guard
- chip/pitch reader repairs
- security definer hardening

But it also includes migration edits that came from repeated CI failures.

Risk example:

```text
9028774c fix(migrations): correct status -> round_status in 050 golf_rounds indexes
```

Live production has `golf_rounds.status`, not `round_status`.

Impact:

Merging PR #105 as-is may preserve useful app fixes, but its migration edits should not be considered the authoritative schema repair.

### Finding 9: PR #111 Is Only A Temporary Gate Change

Current PR #111 contains:

```text
.github/workflows/ci.yml change to make Supabase lint/RLS non-blocking
```

It does not contain the actual schema baseline anymore.

Impact:

PR #111 is an operational pressure valve, not the fix.

## Timeline From Git History

### May 24-25

CoachHelm v3 wave work landed rapidly:

- W9-W12 foundation, RLS helpers, metrics, PGA standards, standing
- W13-W29 UI, generator, goals, qualifying, composite, intent work
- W30-W42 LLM, chat, genome, causality, weekly recap, practice Rx, ingest, notification preferences

### May 26

Infra and tooling changes landed:

- CodeRabbit/Greptile strict config
- CircleCI
- auto-regen docs
- Inngest integration
- Playwright/Lighthouse/promptfoo/testing bundle

### May 27

Production broke on Inngest v4 API mismatch and was fixed by:

```text
da9b1d8e fix(inngest): align with v4 API to unblock Vercel typecheck (#106)
```

PR #105 then chased Review Gate and Supabase replay failures.

PR #111 was reduced to a non-blocking Supabase CI gate.

## Current PR State

### PR #105

```text
Title: fix(coachhelm): helm-review 2026-05-27 - composite null guard + log noise + GATED_OUT defense
Head: chore/helm-review-2026-05-27
Base: main
Commits: 21
Mergeable: MERGEABLE
Review decision: REVIEW_REQUIRED
```

Latest checks observed:

```text
Vercel: pass
build: pass
Review Gate analyzers: pass
Supabase lint + RLS tests: fail
CircleCI lighthouse-preview: fail
Playwright: fail/cancelled depending run
```

Interpretation:

PR #105 is much healthier on application/review-gate checks than it was, but it is still blocked by DB replay and browser/perf/test fallout.

### PR #111

```text
Title: chore(ci): make Supabase lint+RLS non-blocking until proper alignment lands
Head: fix/supabase-schema-baseline
Base: main
Commits: 1
Mergeable: MERGEABLE
Review decision: REVIEW_REQUIRED
```

Latest checks observed:

```text
build: pass
Vercel: pass
Supabase lint + RLS tests: fail
many Review Gate jobs: fail
CircleCI lighthouse-preview: fail
Playwright: pending
```

Interpretation:

PR #111 branches from main and does not include PR #105's review-gate cleanup, so it shows more analyzer failures.

## Why The Supabase Failure Kept Moving

The failures moved because each later migration assumed a piece of production-only schema state.

Examples from the whack-a-mole sequence:

```text
golf_shots.shot_type missing
golf_shots.round_id missing
golf_shots.hole_number missing
golf_shots.result enum vs text mismatch
baseball_conversations.created_by text vs uuid mismatch
golf_rounds.status vs round_status mismatch
golf_events.status enum vs text mismatch
golf_qualifier_entries.score missing
golf_documents.player_visible vs is_public rename
storage.objects owner privilege problem
```

That pattern means the problem is not one bad migration. It is a broken replay chain.

## Why `storage.objects` Is A Special Case

Supabase Storage tables live under the `storage` schema and are managed by Supabase's local stack/infrastructure.

When a migration tries to create, alter, comment on, or own policies on `storage.objects`, local CI may fail with owner-permission errors even if related policies exist or work in production.

That does not mean "ignore storage security". It means storage policy migrations need their own verified pattern:

- use Supabase-supported policy DDL
- avoid owner-only comments/operations in replay
- test in Supabase local stack, not plain Postgres stubs
- separate storage policy checks from app-table schema replay

## Answer To The Main Question

### Is the database correct?

Mostly yes, for live production schema.

The live production DB has the CoachHelm v3 schema and the generated TypeScript types match it.

### Are the docs off?

Partially.

The docs are mostly right about what exists in production. They are off or incomplete about how reliably those changes are represented in migration files and Supabase migration history.

### Is Vercel reading the empty DB?

Production: no.

Preview: not exactly. Preview appears to be missing Supabase env vars, so it may fall back to placeholders or fail admin routes. That can produce symptoms similar to "empty DB" even though it is really "no canonical DB configured".

### Is CoachHelm going to be broken because of the iterations?

The schema does not look broken in production.

The risks are:

1. Preview env makes preview validation unreliable.
2. Migration replay remains broken.
3. LLM surfaces may fall back if `AI_GATEWAY_API_KEY` is absent.
4. Ingest integrations are stubs until provider keys and HTTP clients are implemented.
5. PR #105 historical migration edits can create fresh-replay/prod-truth divergence if treated as canonical.

## Recommended Fix Plan

### Phase 1: Stop The False Signals

Fix Vercel Preview env.

Add canonical vars to Preview:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Preferred target:

```text
Seeded staging Supabase project
```

Acceptable temporary target:

```text
Production Supabase project, but only if everyone understands previews are reading prod
```

Avoid:

```text
Missing env vars with placeholder fallback
```

Add a build/runtime guard so deployed production/preview cannot silently use placeholder Supabase values.

Candidate guard:

```ts
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
if (!url || url.includes('placeholder.supabase.co')) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
}
```

Use this carefully so local/test workflows still have an intentional stub path if needed.

### Phase 2: Decide The DB Environment Policy

Pick one:

1. Production only
2. Production plus staging
3. Supabase branching
4. Local replay only

Recommended:

```text
Production + staging
```

Why:

- Preview should not mutate prod.
- Preview should not be placeholder-backed.
- A seeded staging DB lets Playwright/Vercel previews test real auth/schema/data flows.

### Phase 3: Make Schema Truth Explicit

Declare this hierarchy:

```text
1. Live Helm-Production schema is current operational truth.
2. src/lib/types/database.ts is the current typed snapshot of that truth.
3. Existing migration files are historical records but not currently replay-trustworthy.
4. Supabase migration ledger is stale after May 18.
```

Then repair from there.

### Phase 4: Build The Real Schema Alignment PR

Do not keep editing historical migrations one error at a time.

Create a new dedicated branch:

```bash
git checkout -b codex/supabase-schema-alignment-2026-05-27
```

Inputs:

- production `pg_dump --schema-only`
- generated `database.ts`
- fresh replay DB schema
- existing migrations
- Supabase migration ledger

Recommended workflow:

```bash
# 1. Dump production schema
pg_dump "$HELM_PROD_DB_URL_DIRECT" --schema-only --no-owner --no-privileges > /tmp/prod_schema.sql

# 2. Build fresh local replay DB
supabase start
supabase db reset

# 3. Dump replay schema
pg_dump "$LOCAL_DB_URL" --schema-only --no-owner --no-privileges > /tmp/replay_schema.sql

# 4. Diff schemas
migra /tmp/replay_schema.sql /tmp/prod_schema.sql
# or
atlas schema diff --from file:///tmp/replay_schema.sql --to file:///tmp/prod_schema.sql

# 5. Create one forward-only alignment migration
npx supabase migration new align_dashboard_era_schema

# 6. Re-run replay
supabase db reset

# 7. Regenerate types and compare
npx supabase gen types typescript --local > /tmp/local-types.ts
diff -u src/lib/types/database.ts /tmp/local-types.ts
```

Important migration contract:

```text
The alignment migration must work on a fresh DB replay path.
It must not wrap table fixes in guards that skip because the tables are created later.
It must not blindly treat existing historical migrations as production truth.
It must bridge known rename/type drift toward production truth.
Storage policies must be handled separately.
```

### Phase 5: Repair Migration Ledger Intentionally

After confirming which migrations were truly applied to production, use Supabase migration repair only for verified versions.

Example pattern:

```bash
supabase migration list --linked
supabase migration repair --linked --status applied <version>
```

Do not mark migrations applied just because the file exists.

Only repair after proving the schema effect exists in prod.

### Phase 6: Reconcile PR #105

Split PR #105 into categories:

Keep:

- app bug fixes
- Review Gate configuration
- semgrep/ast-grep false positive scoping
- real server-action fixes
- search path hardening
- CoachHelm composite/chip/pitch fixes

Extract or revert into schema-alignment work:

- historical migration edits
- replay-only drift hacks
- `round_status` changes that conflict with production truth

This prevents a useful app PR from becoming the permanent schema repair vehicle.

### Phase 7: Keep Supabase CI Non-Blocking Only Temporarily

PR #111 is acceptable as a temporary pressure valve if the team needs to merge unrelated work while schema alignment is underway.

But it should have:

- issue link
- owner
- expiry condition
- nightly/full check still visible
- no hiding of the failure from dashboards

Good policy:

```text
Supabase replay is non-blocking for normal PRs until alignment PR lands.
Supabase replay remains required in the dedicated alignment PR.
The check must still run and report.
```

### Phase 8: Verify CoachHelm Runtime Config

Check these in Vercel Production and Preview:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
AI_GATEWAY_API_KEY
RESEND_API_KEY
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
CRON_SECRET
COACHHELM_INTERNAL_SECRET
ARCCOS_CLIENT_ID
ARCCOS_CLIENT_SECRET
GARMIN_CONSUMER_KEY
GARMIN_CONSUMER_SECRET
TRACKMAN_API_KEY
```

Expected state today:

```text
Required for core app: Supabase vars
Required for LLM real prose: AI_GATEWAY_API_KEY
Required for email: RESEND_API_KEY
Required for push: VAPID keys
Required for ingest: provider keys plus implementation
```

## Tools And Integrations That Help Fix This

### Supabase Plugin / MCP

Use for:

- listing projects
- checking project identity
- running SQL safely
- listing migrations
- advisors
- docs lookup

Best uses:

```text
Confirm the project ref before any DB action.
Run read-only evidence queries.
Run advisors before and after schema changes.
Avoid guessing Supabase CLI behavior.
```

### Supabase CLI

Use for:

- type generation
- migration list
- migration repair
- local stack reset
- migration creation
- advisors if CLI supports it

Commands:

```bash
supabase --version
supabase db --help
supabase migration list --linked
supabase migration list --local
supabase migration new align_dashboard_era_schema
supabase gen types typescript --project-id qmnssrrolpinvwjjnufo
supabase db reset
supabase migration repair --linked --status applied <version>
```

### `psql`

Use for:

- precise SQL checks
- row counts
- schema ledger checks
- environment target verification

Safe rule:

```text
Never echo connection URLs.
Never paste secrets into docs.
Use env vars and print only counts/refs.
```

### `pg_dump`

Use for:

- authoritative schema capture
- comparing production to replay
- building a baseline artifact

Recommended command:

```bash
pg_dump "$HELM_PROD_DB_URL_DIRECT" --schema-only --no-owner --no-privileges > /tmp/prod_schema.sql
```

Do not commit raw production dump without sanitizing.

### `migra`

Use for:

- schema diff from replay DB to production DB
- generating candidate SQL delta

Best role:

```text
First-pass diff engine, not blind migration author.
```

Review its SQL manually.

### Atlas

Use for:

- declarative schema diff
- CI drift detection
- schema inspection
- repeatable schema comparisons

Good fit:

```text
CI check that fresh replay schema matches production snapshot or desired schema.
```

### Sqitch

Use for:

- disciplined migration deploy/revert/verify model
- preventing "migration file exists but DB ledger disagrees" drift

Best fit if the team wants:

```text
Strict database change management beyond Supabase's default migration folder.
```

### pgTAP

Use for:

- RLS behavior tests
- schema contract tests
- function behavior tests

Examples:

```text
table exists
RLS enabled
policy exists
coach can read team player
player cannot read coach-only chat table
storage object access follows bucket rules
```

### GitHub Actions

Use for:

- fast PR checks
- Supabase replay visibility
- generated types drift check
- env placeholder static guard
- migration lint

Recommended jobs:

```text
typecheck
build
review-gate analyzers
db types drift
Supabase replay
RLS pgTAP tests
Atlas/migra schema diff
Vercel env smoke check
```

### Vercel CLI

Use for:

- env inspection
- deploy inspection
- preview vs production truth

Commands:

```bash
vercel project ls
vercel env list production
vercel env list preview
vercel env pull /tmp/helmv3-vercel-production.env --environment=production
vercel env pull /tmp/helmv3-vercel-preview.env --environment=preview
vercel inspect helmv3.vercel.app
```

### GitHub CLI

Use for:

- PR checks
- PR metadata
- logs
- diff review

Commands:

```bash
gh pr checks 105 --repo njrini99-code/helmv3 --watch=false
gh pr checks 111 --repo njrini99-code/helmv3 --watch=false
gh run view <run-id> --log-failed
gh pr diff 105 --repo njrini99-code/helmv3
```

### CodeRabbit

Use for:

- line-level static analysis
- PR review comments
- custom rule enforcement
- migration review warnings

Best role:

```text
Catch local line-level issues and rule violations before merge.
```

It cannot replace live DB verification.

### Greptile

Use for:

- whole-codebase architectural drift
- SDK version/call-shape mismatches
- duplicated logic
- docs/code mismatch

Best role:

```text
Catch "this code does not match installed SDK or project architecture" problems.
```

This is exactly the class of issue that caused the Inngest v4 deploy break.

### Codex Security

Use for:

- validating security findings
- reviewing RLS-sensitive paths
- checking service-role exposure
- attack-path analysis on real issues

Good targets:

```text
service role leakage
server actions before auth
RLS bypass risks
storage bucket policy mistakes
security definer functions
public views without security_invoker
```

Do not use it as a substitute for product-correctness testing.

### Semgrep / ast-grep / SQLFluff / Squawk

Use for:

- static migration rules
- no service role in client bundles
- destructive write patterns
- missing RLS in migration
- unqualified table names
- SQL style and Postgres footguns

Recommended custom checks:

```text
New public table must enable RLS.
New public table must include at least one policy.
Server actions must call supabase.auth.getUser() before DB call.
No DELETE-then-INSERT in save/submit/sync paths.
No placeholder Supabase URL in deployed env.
No createFunction 3-arg Inngest v3 call shape when package is Inngest v4.
```

## CI Guardrails To Add

### Guardrail 1: Deployed Env Must Not Use Placeholder Supabase

Add a CI or build-time check:

```bash
node scripts/check-required-env.mjs
```

Rules:

```text
If VERCEL_ENV=production or preview:
  NEXT_PUBLIC_SUPABASE_URL must be set
  NEXT_PUBLIC_SUPABASE_ANON_KEY must be set
  SUPABASE_SERVICE_ROLE_KEY must be set for server/admin routes
  URL must not contain placeholder.supabase.co
```

### Guardrail 2: Generated Types Drift

Nightly or manual:

```bash
npx supabase gen types typescript --project-id qmnssrrolpinvwjjnufo > /tmp/prod-types.ts
diff -u src/lib/types/database.ts /tmp/prod-types.ts
```

Fail if diff is not expected.

### Guardrail 3: Fresh Replay Schema Diff

After schema alignment:

```bash
supabase db reset
npx supabase gen types typescript --local > /tmp/local-types.ts
diff -u src/lib/types/database.ts /tmp/local-types.ts
```

Or use Atlas/migra:

```bash
atlas schema diff --from "$LOCAL_DB_URL" --to "$PROD_DB_URL"
```

### Guardrail 4: RLS Contract Tests

Use pgTAP or equivalent:

```text
coach can read own team player standing
coach cannot read another team's coach chat
player can read own player genome
player cannot read coach-only intent notes if policy says coach-only
anon cannot read private v3 tables
storage policies allow intended object reads/writes only
```

### Guardrail 5: Migration Ledger Check

CI should compare:

```text
supabase/migrations filenames
supabase_migrations.schema_migrations live ledger
known allowed exceptions
```

This would have caught the post-May-18 ledger drift earlier.

## Recommended Immediate Decisions

### Decision 1: Preview DB Target

Choose one:

```text
Option A: Preview points to production temporarily
Option B: Preview points to seeded staging
Option C: Preview is intentionally DB-disabled and tests skip DB surfaces
```

Recommendation:

```text
Option B: seeded staging
```

### Decision 2: PR #105 Handling

Choose one:

```text
Option A: merge as-is after checks
Option B: split app fixes from migration edits
Option C: abandon and rebuild smaller PRs
```

Recommendation:

```text
Option B: split app fixes from migration edits
```

### Decision 3: PR #111 Handling

Choose one:

```text
Option A: merge temporary non-blocking CI gate
Option B: wait for real schema alignment
Option C: close it and keep Supabase blocking
```

Recommendation:

```text
Option A only if accompanied by a tracked alignment issue and an expiry condition.
Otherwise Option B.
```

### Decision 4: Schema Alignment Strategy

Choose one:

```text
Option A: keep whack-a-mole editing old migrations
Option B: build forward-only alignment migration from prod truth
Option C: squash/baseline all migrations after snapshot
```

Recommendation:

```text
Option B now, with possible Option C later if the migration folder remains too damaged.
```

## The Exact Fix Order I Would Use

1. Add/fix Vercel Preview Supabase env.
2. Add deployed-env placeholder guard.
3. Confirm production and preview both resolve canonical Supabase project refs.
4. Split PR #105 app fixes away from historical migration edits.
5. Create dedicated schema alignment branch.
6. Dump production schema.
7. Rebuild fresh replay schema.
8. Diff replay vs prod using migra or Atlas.
9. Write one forward-only alignment migration.
10. Treat storage policy migration separately.
11. Regenerate local types after replay.
12. Diff local generated types against production `database.ts`.
13. Add pgTAP/RLS contract checks.
14. Repair Supabase migration ledger only for verified applied migrations.
15. Re-enable Supabase lint/RLS as blocking.
16. Verify CoachHelm runtime keys: AI Gateway, VAPID, provider stubs.
17. Run browser smoke on production and preview.

## Useful Smoke Tests After Env Fix

### Confirm Preview Has Supabase Env

```bash
vercel env pull /tmp/helmv3-vercel-preview.env --environment=preview
grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)=' /tmp/helmv3-vercel-preview.env
```

Expected:

```text
all three present
URL points to chosen preview DB
no placeholder URL
```

### Confirm Production DB Identity

```bash
set -a
source .env.local >/dev/null 2>&1
set +a

psql "$HELM_PROD_DB_URL_DIRECT" -Atc "
select current_database(), current_user;
select count(*) from information_schema.tables where table_schema = 'public';
select count(*) from public.golf_players;
"
```

Expected:

```text
public table count around current production count
golf_players count non-zero
```

### Confirm Generated Types

```bash
npx supabase gen types typescript --project-id qmnssrrolpinvwjjnufo > /tmp/prod-types.ts
diff -u src/lib/types/database.ts /tmp/prod-types.ts
```

Expected:

```text
no meaningful diff
```

### Confirm CoachHelm Core Tables

```sql
select
  c.relname,
  c.relrowsecurity,
  count(p.polname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relname in (
    'golf_metrics',
    'golf_pga_standards',
    'golf_player_standing',
    'golf_goals',
    'golf_coachhelm_llm_budget',
    'golf_coachhelm_llm_calls',
    'golf_coachhelm_chat_conversations',
    'golf_coachhelm_chat_messages',
    'golf_player_genome',
    'golf_drills'
  )
group by c.relname, c.relrowsecurity
order by c.relname;
```

Expected:

```text
tables exist
RLS enabled
policies present
```

## Red Flags To Avoid

Do not:

- keep editing old migrations one failure at a time
- assume Vercel Preview proves production behavior
- use `.env.local` integration-prefixed vars as app truth
- mark Supabase migrations repaired without verifying live schema effect
- let placeholder Supabase URL be valid in deployed preview/prod
- treat `database.ts` as wrong just because migration replay is failing
- treat docs as fully authoritative without checking live DB
- merge schema drift hacks as part of unrelated app cleanup

## Final Mental Model

Use this model going forward:

```text
Live prod schema: operational truth
database.ts: typed snapshot of operational truth
docs: useful intent/history, but verify against DB
migrations: currently damaged historical replay chain
Supabase migration ledger: stale after May 18
Vercel production: wired to Helm-Production
Vercel preview: missing canonical Supabase env
empty DB: separate integration artifact, not production runtime
CoachHelm v3 schema: mostly present
CoachHelm runtime: partially config-gated/fallback/stubbed
```

## Bottom Line

The core issue is not "the database is wrong" and not "Vercel production is pointed at the empty DB".

The core issue is:

```text
Production schema moved forward outside a clean, replayable migration history,
while Vercel Preview lacks canonical Supabase env vars,
and some CoachHelm v3 surfaces are runtime-config gated.
```

That creates a lot of false signals:

- CI says migrations fail, but prod schema exists.
- Preview can look empty, but prod is wired.
- Docs say waves shipped, and many did, but migration history does not prove it.
- CoachHelm tables exist, but LLM/ingest surfaces may fall back or remain inactive.

The fix is a deliberate alignment and environment cleanup project, not another ten rounds of one-off migration edits.

