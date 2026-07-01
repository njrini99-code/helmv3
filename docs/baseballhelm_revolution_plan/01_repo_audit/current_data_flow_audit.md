# Current Data Flow Audit

## Observed data patterns

- Client pages use Supabase client helpers and hooks.
- Dashboard query helper batches dashboard data and reduces N+1 calls.
- Team selection appears centralized in a store/hook.
- Route protection exists in client hooks.

## Risks

- Client-heavy fetching can create inconsistent permission enforcement if not paired with RLS and server-side guards.
- Old recruiting dashboard read models may not match future team-operations data needs.
- Without import history tables, uploaded data cannot be audited or rolled back safely.
- Without event/task normalization, command center cards will require fragile custom queries.

## Future data flow

- Server actions/API routes for writes.
- Typed read models for dashboard cards.
- RLS-first data access.
- `audit_logs` for sensitive changes.
- `imports`, `import_rows`, and `import_errors` for all bulk operations.
- AI modules read from stable summarized views and cite source row IDs.
