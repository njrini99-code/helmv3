# Migration Sequence V2


## Migration sequence

1. Inspect live generated Supabase types and current migrations.
2. Map existing `baseball_*` tables to V2 object needs.
3. Add non-destructive columns first.
4. Add new import/AI/timeline/audit tables.
5. Backfill demo/current data.
6. Add indexes and constraints.
7. Add RLS policies.
8. Add read models/server actions.
9. Migrate UI route by route.
10. Run role-based QA.
11. Keep rollback SQL for new tables/columns.
