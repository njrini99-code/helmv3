# Database ↔ Codebase Cross-Reference (Zero False Positive Mode)

Find tables and columns in Supabase that are genuinely dead — not referenced anywhere in code, policies, functions, triggers, edge functions, migrations, or dynamic patterns.

**Accuracy target: ZERO false positives. If there is ANY doubt, mark as KEEP.**

---

## Phase 1: Full Schema Extraction via Supabase MCP

Run ALL of these queries using `execute_sql`. Do not skip any.

### 1a. All public tables
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

### 1b. All columns with types
```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```
### 1c. All RLS policies (full policy SQL)
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public';
```

### 1d. All database functions (full body)
```sql
SELECT p.proname AS function_name,
       pg_get_functiondef(p.oid) AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public';
```

### 1e. All triggers
```sql
SELECT trigger_name, event_object_table, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public';
```

### 1f. All foreign keys
```sql
SELECT
  tc.table_name AS source_table,
  kcu.column_name AS source_column,
  ccu.table_name AS target_table,
  ccu.column_name AS target_column,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schemaJOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public';
```

### 1g. All views (views reference tables)
```sql
SELECT viewname, definition
FROM pg_views
WHERE schemaname = 'public';
```

### 1h. All indexes
```sql
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public';
```

### 1i. Realtime publication tables (Supabase Realtime)
```sql
SELECT * FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';
```

### 1j. Cron jobs (if pg_cron exists)
```sql
SELECT jobname, schedule, command
FROM cron.job;
```
(If this errors, skip — pg_cron may not be enabled.)
---

## Phase 2: Deep Codebase Analysis

### DO NOT use simple grep. Follow this multi-pass process:

### Pass 1 — Map ALL Supabase client wrappers

Before searching for table names, first find every file that creates or re-exports a Supabase client:

```
Search for: createClient, createBrowserClient, createServerClient, createRouteHandlerClient, createServerComponentClient, createMiddlewareClient
```

Then find all files that import from those modules. These are your "Supabase usage files" — the primary search surface.

Also find any utility/helper functions that wrap Supabase calls. For example:
```typescript
// Someone might write:
export async function fetchFromTable(table: string, query: object) {
  return supabase.from(table).select()
}
```
If wrapper functions like this exist, trace every CALLER of that function to find what table name strings are passed in.

### Pass 2 — Direct string literal search

Search ALL source files (`src/`, `app/`, `lib/`, `utils/`, `components/`, `hooks/`, `actions/`, `api/`, `server/`, `supabase/functions/`) for each table name as:

1. **Exact quoted string**: `'table_name'` or `"table_name"` or `` `table_name` ``
2. **Inside .from()**: `.from('table_name')`
3. **Inside .rpc()**: `.rpc('function_that_touches_table')`
4. **Type references**: `Tables['table_name']`, `Database['public']['Tables']['table_name']`5. **In comments or TODOs**: even a commented-out reference means someone intends to use it

Exclude ONLY:
- `node_modules/`
- `.next/`
- `dist/`
- `database.types.ts` / `database.types.gen.ts` (auto-generated, doesn't count as a "usage")

**DO NOT exclude** test files, config files, seed files, or scripts — these count as valid references.

### Pass 3 — Dynamic / computed reference detection

This is critical for accuracy. Search for patterns that construct table names at runtime:

1. **String concatenation**: `'prefix_' + variable`, `` `${prefix}_table` ``
2. **Template literals with table-like suffixes**: `` `${x}_stats` ``, `` `${x}_settings` ``
3. **Arrays/objects of table names**:
   ```typescript
   const tables = ['users', 'teams', 'matches']
   const tableMap = { users: 'user_profiles', ... }
   ```
4. **Enum or const objects** that map to table names
5. **Config files** that list table names (e.g., realtime subscriptions, sync config)
6. **Any variable passed to `.from()`** that isn't a string literal — trace it back to its assignment

For EVERY `.from(variable)` or `.from(someFunction())` call found:
- Follow the variable backward to find all possible string values it can hold
- If you cannot determine all possible values, mark ALL tables with matching patterns as KEEP
- If a function returns a table name dynamically, mark ALL tables that could plausibly match as KEEP
### Pass 4 — camelCase / PascalCase / alias detection

For each table name, also search for:
- **camelCase**: `player_game_stats` → `playerGameStats`
- **PascalCase**: `player_game_stats` → `PlayerGameStats`
- **Singular form**: `teams` → `team`, `matches` → `match`
- **Plural form**: `team` → `teams`
- **Common abbreviations**: `stats` → `statistics`, `info` → `information`
- **Supabase select aliases**: `.select('alias:column_name')` or `.select('table_name!inner(...)')`

### Pass 5 — Edge Function + migration scan

- Search ALL files in `supabase/functions/` for table/column references
- Search ALL files in `supabase/migrations/` — if a recent migration (last 3 months of files by filename timestamp) references a table, it's active
- Search any `seed.sql` or `seed.ts` files

### Pass 6 — Indirect dependency chain

A table is ALSO considered "referenced" if:
- It is a **foreign key target** of any referenced table (deleting it would break FK constraints)
- It is referenced in a **trigger** on a referenced table
- It is referenced in an **RLS policy** on a referenced table
- It is referenced in a **view** that is used by code
- It is in the **Supabase Realtime publication** (even if code doesn't query it directly, it may be subscribed to)
- It is referenced by a **database function** that is called via `.rpc()`

Build the full dependency graph. Walk it recursively. If table A is referenced in code, and table B is a FK target of A, and table C is used in an RLS policy on B — then A, B, and C are ALL considered referenced.
---

## Phase 3: Classification

For each table, assign ONE of these statuses:

### ✅ CONFIRMED REFERENCED
- Found direct string literal reference in application code
- No ambiguity

### ✅ REFERENCED VIA DEPENDENCY
- Not directly in code, but is a FK target, trigger dependency, RLS dependency, or view dependency of a confirmed-referenced table
- Mark which table creates the dependency

### ✅ REFERENCED IN INFRASTRUCTURE
- Referenced in RLS policies, database functions called via RPC, triggers, Realtime publication, or cron jobs
- Not in application code but serves a database-level purpose

### ⚠️ POSSIBLY REFERENCED (KEEP — NEEDS HUMAN REVIEW)
- A dynamic `.from(variable)` pattern exists that COULD resolve to this table name
- A string concatenation or template literal COULD construct this table name
- A wrapper function COULD pass this table name
- The table name is a common word that might match non-table usages (high noise)
- The table was created in a recent migration (last 3 months)
- **DEFAULT TO THIS CATEGORY IF ANY DOUBT EXISTS**

### ❌ CONFIRMED UNREFERENCED
- Zero string literal matches in ALL source files, edge functions, migrations, seeds
- Zero matches for camelCase/PascalCase/singular/plural variants- Not a FK target of any referenced table
- Not in any RLS policy, trigger, view, or function
- Not in Realtime publication
- Not in any cron job
- No dynamic pattern could plausibly construct this name
- Not created in a recent migration
- **ONLY flag a table here if you are 100% certain**

---

## Phase 4: Column Analysis

Only analyze columns for tables marked ✅ CONFIRMED REFERENCED.

For each column (skip `id`, `created_at`, `updated_at`, `deleted_at`, `uuid`, `created_by`, `updated_by`):

1. Search for exact column name string in code
2. Search for camelCase variant
3. Check if column is used in any RLS policy `qual` or `with_check`
4. Check if column is used in any database function
5. Check if column is a foreign key (source or target)
6. Check if column has a default value or is auto-generated (may be write-only)
7. Check if column appears in any `.select()`, `.insert()`, `.update()`, `.eq()`, `.order()` call
8. Check for `select('*')` patterns — if the table uses `select('*')` ANYWHERE, ALL columns are considered referenced

**Column false positive rate is inherently higher than tables.** Classify columns as:
- ✅ Referenced
- ⚠️ Possibly referenced (default if unsure)
- ❌ Unreferenced (only if zero hits across ALL checks above AND no `select('*')` on that table)
---

## Phase 5: Report

Generate a markdown report with these exact sections:

### Summary
Total tables, total confirmed referenced, total dependency-referenced, total possibly-referenced, total confirmed unreferenced.

### ❌ Confirmed Unreferenced Tables
For each: table name, column count, FK dependencies (should be none), when it was created (from migration filename if available), and your confidence level (should be 100%).

### ⚠️ Needs Human Review
For each: table name, reason it's ambiguous, what to check manually.

### ✅ Referenced Tables
For each: table name, number of code files referencing it, reference type (direct / dependency / infrastructure).

### ❌ Confirmed Unreferenced Columns
For each: table.column, reason you're confident it's unused.

### ⚠️ Columns Needing Review
For each: table.column, reason it's ambiguous.

### Recommended Removal Steps
For confirmed-unreferenced items only:
1. Create a new migration with `ALTER TABLE x RENAME TO _deprecated_x`
2. Deploy to preview/staging
3. Run full test suite
4. Manual smoke test for 1 week
5. If nothing breaks, create a DROP migration6. Warn about any storage, webhooks, or external integrations that might reference the table outside the codebase

---

## Absolute Rules

- **NEVER classify something as ❌ UNREFERENCED if there is any doubt. Default to ⚠️.**
- **Do NOT flag tables as unused because they have zero rows.** Empty tables are expected in early-stage apps.
- **NEVER run DROP TABLE or ALTER TABLE.** Report only.
- **If a `.from(variable)` pattern exists ANYWHERE in the codebase, assume ANY table could be dynamically referenced and flag all ambiguous tables as ⚠️.**
- **Check EVERY search path**: src/, app/, lib/, pages/, components/, hooks/, utils/, actions/, api/, server/, scripts/, supabase/functions/, supabase/migrations/, tests/, __tests__/, cypress/, e2e/
- **A single reference ANYWHERE — even in a comment, test, or disabled code — means the table is REFERENCED.**