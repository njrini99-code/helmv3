---
description: List migrations still on HOLD in supabase/migrations/HELD.md (read-only)
---

`/held` — read `supabase/migrations/HELD.md` and print only the rows of "The
register" table whose `status` column is **HOLD** (skip OBSOLETE and any
other status): migration filename, why, and decided date, plus the file's
review requirement for lifting a hold.

Read-only. Never apply, stamp, or delete a held migration, and never edit
`HELD.md` as part of this command — a status change there is a human
decision, not something this command makes for them.
