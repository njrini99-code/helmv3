# Run System Audits on Your Machine

Your machine likely has proper IPv6 routing or IPv4 access to Supabase. Run these commands there:

## Option 1: Quick - Run Critical Checks Only (2 minutes)

```bash
cd /Users/ricknini/Downloads/helmv3

# Run critical security check
PGPASSWORD='EHl4yASa9zM1sb1k' psql \
  "postgresql://postgres:EHl4yASa9zM1sb1k@db.dgvlnelygibgrrjehbyc.supabase.co:5432/postgres" \
  -f AUDIT_BATCH_2_SECURITY_CRITICAL.sql

# Run RLS policies check
PGPASSWORD='EHl4yASa9zM1sb1k' psql \
  "postgresql://postgres:EHl4yASa9zM1sb1k@db.dgvlnelygibgrrjehbyc.supabase.co:5432/postgres" \
  -f AUDIT_BATCH_3_RLS_POLICIES.sql

# Run functions & triggers check
PGPASSWORD='EHl4yASa9zM1sb1k' psql \
  "postgresql://postgres:EHl4yASa9zM1sb1k@db.dgvlnelygibgrrjehbyc.supabase.co:5432/postgres" \
  -f AUDIT_BATCH_5_FUNCTIONS_TRIGGERS.sql
```

## Option 2: Complete - Run All System Audits (5 minutes)

```bash
cd /Users/ricknini/Downloads/helmv3

# Run the automated system audit script
node run-system-audits.mjs
```

## Option 3: Supabase Dashboard (No Terminal Needed)

1. Go to: https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc/sql/new
2. Copy contents of `AUDIT_BATCH_2_SECURITY_CRITICAL.sql`
3. Paste and run
4. Repeat for batches 3 and 5

---

## What's Already Done ✅

I completed via REST API:
- ✅ Account fixed (sport='golf')
- ✅ Orphaned records check (0 found)
- ✅ Data quality check (perfect)
- ✅ User distribution (verified)

Results saved in: `AUDIT_RESULTS_API.json`

---

## Expected Results

### AUDIT_BATCH_2 (CRITICAL):
**Should return 0 rows** - all tables must have RLS enabled

### AUDIT_BATCH_3:
Shows all RLS policies - verify they use `auth.uid()`

### AUDIT_BATCH_5:
Lists functions and triggers - verify `handle_new_user` exists

---

## If Connection Fails on Your Machine

Try the IPv6 bracket notation:
```bash
PGPASSWORD='EHl4yASa9zM1sb1k' psql \
  "postgresql://postgres:EHl4yASa9zM1sb1k@[2600:1f13:838:6e16:721e:21f6:fcf7:5acf]:5432/postgres" \
  -f AUDIT_BATCH_2_SECURITY_CRITICAL.sql
```

Or just use Supabase Dashboard (Option 3) - guaranteed to work!
