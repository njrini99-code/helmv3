# Scripts Directory

> This file only documents the database-type-regeneration workflow below.
> `scripts/` holds 100+ files (baseball seeding/verification, CRM
> outreach, demo-account provisioning, migration/RLS/schema checks, the
> `regen-docs.mjs` inventory generator behind `npm run docs:regen`,
> `knowledge/` context-pack tooling used by CLAUDE.md's routing section,
> `ui-intelligence/` screenshot+atlas tooling, `wf_*`/`baseballhelm-*`
> workflow-runner scripts, etc.) with no per-script index — read a
> script's header comment or run it with no args for usage.

## Database Type Management

### Type Regeneration — manual only, no automated hook or CI gate

There is currently **no pre-commit hook and no CI job** that
regenerates or checks `src/lib/types/database.ts` automatically —
`.husky/` doesn't exist in this repo and no GitHub Actions workflow
runs `db:types` or `db:types:check`. Keeping types in sync is a manual
step:

1. **Manual regeneration**: Run `npm run db:types` after applying a
   migration.

2. **Manual Check**: Run `npm run db:types:check` in a clean worktree to
   regenerate types and then fail if `src/lib/types/database.ts` differs
   from the committed file.

If you want this automated, wire `npm run db:types:check` into
`.github/workflows/ci.yml` and/or add a Husky pre-commit hook — neither
exists today.

### Manual Commands

```bash
# Regenerate types manually
SUPABASE_PROJECT_ID=your-id npm run db:types

# Regenerate and check if types are up to date (useful in CI/local only
# when a generated-file diff is acceptable)
npm run db:types:check
```

### Using the Migration Helper

```bash
# Apply a migration and regenerate types
./scripts/apply-migration.sh supabase/migrations/your-migration.sql
```

This script:
- Prompts you to apply the migration (via Dashboard, MCP, or psql)
- Waits for confirmation
- Automatically regenerates types

### Environment Setup

The automation tries to find `SUPABASE_PROJECT_ID` from:
1. Environment variable `SUPABASE_PROJECT_ID`
2. `.env.local` file (`SUPABASE_PROJECT_ID=...`)
3. Extracted from `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`

Make sure one of these is configured!
