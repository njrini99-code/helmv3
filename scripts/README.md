# Scripts Directory

## Database Type Management

### Automatic Type Regeneration

Database types are now automatically kept in sync with your schema:

1. **Pre-commit Hook**: When you commit migration files (`.sql` files in `supabase/migrations/`), types are automatically regenerated before the commit.

2. **CI Check**: GitHub Actions verifies that `database.ts` is up to date on every PR/push.

3. **Manual Check**: Run `npm run db:types:check` to verify types are current without regenerating.

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
