# HelmV3 Database Audit Review

Use this with `npm run ctx:db`.

## Goal

Audit HelmV3 database schema, generated types, SQL scripts, and migration hygiene for drift, risky policies, missing indexes, naming inconsistencies, and production-readiness issues.

## Rules

- Ground findings in SQL, generated types, or decisive repo evidence.
- Do not claim production data correctness without raw Supabase SQL or exported data evidence.
- Flag service-role paths, RLS gaps, destructive mutations, and search_path risks separately.
- Distinguish generated type drift from schema drift.
- Prefer migration-safe fixes and include rollback notes when relevant.

## Output

1. Overall database verdict.
2. Security and RLS findings.
3. Data integrity and schema drift findings.
4. Performance/index findings.
5. Required Supabase/Vercel/Sentry evidence.
6. Exact local and production-safe verification commands.
