# Production rollback captures

One file per production-impacting migration, written **before** that
migration is applied to production. Nothing in this directory is ever
executed by the Supabase CLI (it only reads `supabase/migrations/`); these
files exist so that rolling back never requires reconstructing a prior
definition from memory or git archaeology during an incident.

Every rollback file must carry:

- the **verbatim prior definition** as captured from the live production
  catalog (`pg_get_functiondef` / schema dump), not from a repo file;
- the exact **revert SQL**;
- a **verification query** proving the revert landed;
- metadata: the commit SHA carrying the forward change, the capture date,
  the approval/deployment record to update on apply, and the Sentry
  verification window;
- an honest statement of **what rolling back costs** (a rollback that
  restores an outage must say so).

Apply a rollback the same way forward migrations are applied to
production: explicitly, one reviewed file, owner-approved — never via
`supabase db push`.
