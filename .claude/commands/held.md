---
description: List migrations still on HOLD in supabase/migrations/HELD.md (read-only)
---

`/held` — read `supabase/migrations/HELD.md` and print only the rows of "The
register" table whose `status` column is **HOLD** (skip OBSOLETE, APPLIED and
any other status): migration filename, why, and decided date, plus any ordering
prerequisite the row names.

HELD is guidance, not a human-only decision: a row records why a migration was
not applied. This command only lists; to apply one, read the row's reason,
follow `docs/operations/APPLY_PATH.md` (`--held-override <row anchor> --reason
"..."`), and update the row when you do.
