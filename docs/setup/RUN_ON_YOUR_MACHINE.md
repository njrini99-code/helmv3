# Run System Audits on Your Machine

> **2026-05-17 — credentials scrubbed.** The previous version of this file
> committed a hard-coded DB password and project ref in plaintext. Both
> have been removed; the credential is being rotated per
> `docs/operations/2026-05-17-p0-runbook.md` Task 1. Use the patterns
> below to connect with credentials sourced from your local environment.

## Database connection

The project's database connection string is provisioned via the Supabase
dashboard. Do not commit credentials to this repository.

To connect locally:

1. Run `supabase login` and pick the project.
2. Copy the connection string from Supabase dashboard
   (Project Settings → Database → Connection string).
3. Set it as `SUPABASE_DB_URL` in your local `.env.local` (gitignored).

```bash
# .env.local
SUPABASE_DB_URL='postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres'
```

## Option 1: Quick — Run Critical Checks Only (2 minutes)

```bash
cd /Users/ricknini/Downloads/helmv3

# Loads SUPABASE_DB_URL from .env.local
set -a; source .env.local; set +a

# Run critical security check
psql "$SUPABASE_DB_URL" -f AUDIT_BATCH_2_SECURITY_CRITICAL.sql

# Run RLS policies check
psql "$SUPABASE_DB_URL" -f AUDIT_BATCH_3_RLS_POLICIES.sql

# Run functions & triggers check
psql "$SUPABASE_DB_URL" -f AUDIT_BATCH_5_FUNCTIONS_TRIGGERS.sql
```

## Option 2: Complete — Run All System Audits (5 minutes)

```bash
cd /Users/ricknini/Downloads/helmv3

# Run the automated system audit script (reads SUPABASE_DB_URL from env)
node run-system-audits.mjs
```

## Option 3: Supabase Dashboard (No Terminal Needed)

1. Go to your project's SQL editor (Supabase dashboard → SQL → New query).
2. Copy contents of `AUDIT_BATCH_2_SECURITY_CRITICAL.sql`.
3. Paste and run.
4. Repeat for batches 3 and 5.

---

## What's Already Done

Completed via REST API:
- Account fixed (sport='golf')
- Orphaned records check (0 found)
- Data quality check (perfect)
- User distribution (verified)

Results saved in: `AUDIT_RESULTS_API.json`

---

## Expected Results

### AUDIT_BATCH_2 (CRITICAL):
**Should return 0 rows** — all tables must have RLS enabled.

### AUDIT_BATCH_3:
Shows all RLS policies — verify they use `auth.uid()`.

### AUDIT_BATCH_5:
Lists functions and triggers — verify `handle_new_user` exists.

---

## If Connection Fails on Your Machine

Try the IPv6 bracket notation against the same `$SUPABASE_DB_URL` host:

```bash
# Resolve the IPv6 address from Supabase dashboard, then:
psql "postgresql://postgres:<password>@[<ipv6-addr>]:5432/postgres" \
  -f AUDIT_BATCH_2_SECURITY_CRITICAL.sql
```

Or just use Supabase Dashboard (Option 3) — guaranteed to work.
