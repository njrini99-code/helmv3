<!-- markdownlint-disable MD013 -->
# Supabase observability coverage matrix

<!-- GENERATED FILE - DO NOT HAND-EDIT.
     Produced by `node scripts/db-observability-coverage.mjs`.
     Verify with `node scripts/db-observability-coverage.mjs --check`.
     Every cell is derived by reading the modules named in
     `scripts/lib/db-observability-coverage.mjs`, with comments stripped
     first - never transcribed from the brief's intent. Edit the detectors,
     not this file. -->

Brief section 79. One row per failure class, one column per observation
channel.

| Cell | Meaning |
| --- | --- |
| `YES` | the code does this; a detector found it |
| `NO` | the code does not do this; a detector looked and found nothing |
| `UNKNOWN` | nobody has established either way - weaker than `NO` on purpose |
| `NOT VERIFIED` | the mechanism exists in code but has never run against a live database or a deployed environment |

`UNKNOWN` is never rendered as `NO` and never left blank. `NOT VERIFIED` is
never rendered as `YES`. The blind spots are the deliverable.

Two columns are worth reading carefully:

- **Sentry** is `UNKNOWN` for most rows, and that is the accurate answer. Only
  `realtime.ts` captures to Sentry from inside the observability layer; every
  other path reaches Sentry only if the error ESCAPES to an action wrapper or
  `onRequestError`, which is a property of the call site rather than of the
  observing module. Reporting `YES` would claim something no detector here
  established.
- **Live verified** is `NOT VERIFIED` for every row because every migration in
  this program is HELD and unapplied. That cell is derived from
  `supabase/migrations/HELD.md`, so it changes on its own once the hold is
  discharged.

A row whose implementing module does not exist on the branch being generated
from reads `UNKNOWN`, not `NO` - the detector found no evidence either way,
which is a weaker statement than "the code does not do this". Several rows
name modules that belong to sibling tracks of the same program; regenerate
after those are integrated and the cells resolve on their own. That is the
intended behaviour of a generated matrix, and the reason the counts live in
the table rather than in prose.

| Failure class | Sentry | Bridge | DB error event | Flight Recorder | SQLSTATE/code | Release | Trace correlation | Metric | Invariant | Alert | Replay | Live verified | Blind spot |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PostgREST select failure | UNKNOWN | YES | YES | YES | YES | YES | YES | YES | NO | UNKNOWN | YES | NOT VERIFIED | Sentry routing is call-site dependent |
| PostgREST mutation failure | UNKNOWN | YES | YES | YES | YES | YES | YES | YES | NO | UNKNOWN | YES | NOT VERIFIED | Sentry routing is call-site dependent |
| RPC SQLSTATE failure | UNKNOWN | YES | YES | YES | YES | YES | YES | YES | NO | UNKNOWN | YES | NOT VERIFIED | Sentry routing is call-site dependent |
| RPC rollback | UNKNOWN | YES | YES | YES | YES | YES | YES | YES | NO | UNKNOWN | YES | NOT VERIFIED | Sentry routing is call-site dependent |
| RPC timeout | UNKNOWN | YES | YES | YES | YES | YES | YES | YES | NO | UNKNOWN | YES | NOT VERIFIED | Sentry routing is call-site dependent |
| RPC unknown commit | UNKNOWN | UNKNOWN | NO | YES | YES | NO | NO | NO | NO | UNKNOWN | NO | NOT VERIFIED | Sentry routing is call-site dependent; no durable event; not on the Bridge; no replay fixture; no metric |
| RLS expected denial | UNKNOWN | UNKNOWN | YES | NO | YES | YES | YES | YES | NO | UNKNOWN | YES | NOT VERIFIED | Sentry routing is call-site dependent; not on the Bridge |
| RLS unexpected denial | UNKNOWN | YES | YES | NO | YES | YES | YES | YES | NO | UNKNOWN | YES | NOT VERIFIED | Sentry routing is call-site dependent |
| Auth API error | UNKNOWN | YES | YES | NO | YES | YES | YES | YES | NO | UNKNOWN | NO | NOT VERIFIED | Sentry routing is call-site dependent; no replay fixture |
| Auth client error | UNKNOWN | UNKNOWN | NO | NO | YES | NO | NO | NO | NO | UNKNOWN | NO | NOT VERIFIED | Sentry routing is call-site dependent; no durable event; not on the Bridge; no replay fixture; no metric |
| Storage error | UNKNOWN | YES | YES | NO | YES | YES | YES | YES | NO | UNKNOWN | NO | NOT VERIFIED | Sentry routing is call-site dependent; no replay fixture |
| Realtime connection error | YES | UNKNOWN | NO | NO | NO | NO | NO | YES | NO | UNKNOWN | NO | NOT VERIFIED | no durable event; not on the Bridge; no replay fixture |
| Realtime silent propagation | YES | UNKNOWN | NO | NO | NO | NO | NO | YES | NO | UNKNOWN | NO | NOT VERIFIED | no durable event; not on the Bridge; no replay fixture |
| Edge Function exception | UNKNOWN | UNKNOWN | YES | NO | YES | YES | YES | YES | NO | UNKNOWN | NO | NOT VERIFIED | Sentry routing is call-site dependent; not on the Bridge; no replay fixture |
| pg_cron failure | UNKNOWN | YES | NO | NO | NO | NO | NO | NO | NO | UNKNOWN | NO | NOT VERIFIED | Sentry routing is call-site dependent; no durable event; no replay fixture; no metric |
| pg_cron missed run | UNKNOWN | YES | NO | NO | NO | NO | NO | NO | NO | UNKNOWN | NO | NOT VERIFIED | Sentry routing is call-site dependent; no durable event; no replay fixture; no metric |
| pg_net failure | UNKNOWN | YES | NO | NO | NO | NO | NO | NO | NO | UNKNOWN | NO | NOT VERIFIED | Sentry routing is call-site dependent; no durable event; no replay fixture; no metric |
| Lock wait | UNKNOWN | YES | NO | NO | NO | NO | NO | NO | NO | UNKNOWN | NO | NOT VERIFIED | Sentry routing is call-site dependent; no durable event; no replay fixture; no metric |
| Deadlock | UNKNOWN | YES | YES | NO | YES | YES | YES | YES | NO | UNKNOWN | YES | NOT VERIFIED | Sentry routing is call-site dependent |
| Connection saturation | UNKNOWN | YES | NO | NO | NO | NO | NO | NO | NO | UNKNOWN | NO | NOT VERIFIED | Sentry routing is call-site dependent; no durable event; no replay fixture; no metric |
| CPU / memory saturation | UNKNOWN | YES | UNKNOWN | NO | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | NO | UNKNOWN | NO | NOT VERIFIED | Sentry routing is call-site dependent; no replay fixture |
| Query performance regression | UNKNOWN | YES | NO | NO | NO | NO | NO | NO | NO | UNKNOWN | NO | NOT VERIFIED | Sentry routing is call-site dependent; no durable event; no replay fixture; no metric |
| Schema drift | UNKNOWN | UNKNOWN | NO | NO | NO | NO | NO | NO | NO | UNKNOWN | NO | NOT VERIFIED | Sentry routing is call-site dependent; no durable event; not on the Bridge; no replay fixture; no metric |
| DB type drift | UNKNOWN | UNKNOWN | NO | NO | NO | NO | NO | NO | NO | UNKNOWN | NO | NOT VERIFIED | Sentry routing is call-site dependent; no durable event; not on the Bridge; no replay fixture; no metric |
| Data integrity violation | UNKNOWN | YES | YES | NO | YES | YES | YES | YES | YES | UNKNOWN | YES | NOT VERIFIED | Sentry routing is call-site dependent |
| Sentry trace missing | UNKNOWN | UNKNOWN | UNKNOWN | NO | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | NO | UNKNOWN | NO | NOT VERIFIED | Sentry routing is call-site dependent; not on the Bridge; no replay fixture |
| DB collector missing | UNKNOWN | YES | NO | NO | NO | NO | NO | NO | NO | UNKNOWN | NO | NOT VERIFIED | Sentry routing is call-site dependent; no durable event; no replay fixture; no metric |
