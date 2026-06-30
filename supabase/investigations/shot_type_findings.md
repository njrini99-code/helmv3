# golf_shots.shot_type compatibility findings (#108)

## Status

Pending production query execution. Run `supabase/investigations/shot_type_investigation.sql` with a read-only role and fill in the sections below.

## Canonical allowed values

- `tee`
- `approach`
- `around_green`
- `putting`
- `penalty`

## Legacy alias mapping (application layer)

| Stored alias | Canonical |
|--------------|-----------|
| `putt` | `putting` |
| `drive` | `tee` |
| `chip`, `pitch` | `around_green` |
| `iron` | `approach` |

## Observed distinct values

| shot_type | row_count | classification |
|-----------|-----------|----------------|
| _pending_ | _pending_ | _pending_ |

## NULL count

_pending_

## Constraint validation state

| conname | convalidated | notes |
|---------|--------------|-------|
| golf_shots_shot_type_check | _pending_ | _pending_ |

## Compatibility verdict

_pending_

## Defensive code assessment

`normalizeShotType()` in `src/lib/utils/golf-stats-calculator-shots.ts` and legacy handling in `src/app/golf/actions/shot-analytics.ts` should be classified as:

- **Required** if non-canonical or legacy-alias values exist in production
- **Defensive/dead** if production contains only canonical values

## Remediation branch

- **If legacy values found:** add a forward-only normalization migration remapping aliases to canonical values, then `VALIDATE CONSTRAINT` if needed.
- **If no legacy values:** leave defensive code in place; optional follow-up to simplify application aliases.
