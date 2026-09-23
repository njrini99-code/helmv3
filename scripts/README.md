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

### Type Regeneration

`npm run db:types` regenerates `src/lib/types/database.ts`; the pre-commit hook
reminds you when a migration is staged, and CI's `check:types-drift` compares
it with production (details: `.claude/rules/database.md`).

### Manual Commands

```bash
# Regenerate types manually
SUPABASE_PROJECT_ID=your-id npm run db:types

# Check if types are up to date (useful in CI/local)
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
