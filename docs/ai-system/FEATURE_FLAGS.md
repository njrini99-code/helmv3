# Feature flags + kill switches

Governance for `config/feature-flags.yml`, `src/lib/flags/**`, and the CI
gate. Built against Phase F.4.2 of
[`CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md`](CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md)
(§4 "Feature flags as a config file + a thin reader") and §14-15 of
`GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md`, under owner decision
`FEATURE_FLAG_INFRASTRUCTURE_NET_NEW` in
`memory/decisions/ADR-2026-09-03-control-plane-owner-decisions.md`
("Flags yes"). `CANARY_ROLLOUT_MECHANISM` in the same ADR ("Canary later")
is the reason this system has no percentage rollout: `environment` below is
booleans only, deliberately.

## Why this exists

Before this, every ops toggle in this repo was a bare `process.env.FOO`
read, scattered across call sites with no registry, no owner, no expiry, and
no record of what it was for once whoever added it moved on. Two real
examples — `HELM_FLIGHT_RECORDER_ENABLED`
(`src/app/golf/actions/golf.ts:1207-1209`,
`src/lib/observability/helm-flight-recorder.ts:194`) and
`NEXT_PUBLIC_COACHHELM_ENABLED` (`src/lib/coachhelm/v2/gate.ts`) — are still
read directly by their owning files; `config/feature-flags.yml` describes
both without changing either's runtime behavior (see "What is, and isn't,
wired" below).

## The pieces

```text
config/feature-flags.yml           source of truth (hand-edited YAML)
        │  npm run flags:generate
        ▼
src/lib/flags/registry.generated.ts   typed constant, checked into git
        │
        ▼
src/lib/flags/is-enabled.ts        isFlagEnabled(name, ctx?) — the reader
src/lib/flags/sentry.ts            attaches name+value to Sentry events
src/lib/flags/never-gate.ts        the NEVER-GATE keyword check

scripts/flags/lib.mjs              shared parse/validate/render (plain ESM)
scripts/flags/generate-flags.mjs   the generator (refuses on a violation)
scripts/check-feature-flags.mjs    the CI governance gate (npm run flags:check)
```

**Why two checkers instead of one.** The generator and `flags:check` both
call `validateFlags` in `scripts/flags/lib.mjs`, but independently — the
generator re-parses `config/feature-flags.yml` from disk, and so does
`flags:check`. Neither trusts `registry.generated.ts`. This is deliberate:
`.claude/rules/shipping.md` §1 records a real incident where a
"DO NOT EDIT — regenerated" stamp sat on a silently-wrong file for months
because nothing re-checked the source it claimed to be generated from. A
hand-edited `registry.generated.ts` — adding a flag, or quietly removing a
NEVER-GATE violation — passes neither `tsc` nor `npm run flags:generate --
--check` (byte-for-byte drift comparison, same pattern as
`npm run docs:inventory-check`), and `flags:check` still catches a
governance violation in the *source* YAML regardless of what the generated
file says.

**No YAML parsing at runtime.** `isFlagEnabled()` only ever reads the
compiled `FLAG_REGISTRY` constant — never `config/feature-flags.yml`, never
`process.env.HELM_FLIGHT_RECORDER_ENABLED` or any other raw env var for an
individual flag's value. That is a real limitation, not just an
implementation detail: see "What is, and isn't, wired" below.

## Schema

One entry per flag in `config/feature-flags.yml`'s `flags:` array:

| Field | Required | Notes |
| --- | --- | --- |
| `feature_id` | always | stable id; the string passed to `isFlagEnabled()`; unique |
| `owner` | always | who to ask before flipping/removing this flag |
| `purpose` | always | one sentence: what it controls and why |
| `type` | always | `release` \| `experiment` \| `operations_kill_switch` \| `temporary_migration` |
| `status` | always | `active` \| `archived` |
| `created_at` | always | ISO date |
| `expires_at` | conditional | ISO date or `null`. **Required for `temporary_migration`** (missing = CI failure). Optional for `release`/`experiment` (norm: set one anyway). May be `null` for a permanent `operations_kill_switch`. |
| `default` | always | boolean fallback when the running environment's rollout key is somehow absent |
| `environment` | always | `{ production, preview, development }` — **booleans only, never a percentage** |
| `kill_switch_behavior` | conditional | required (non-empty) when `type: operations_kill_switch`; `null` otherwise |
| `cleanup_plan` | always | how/when this flag gets removed — "no planned removal" is a valid, honest answer for a permanent kill switch |

## The NEVER-GATE list

A flag may never gate: **auth, RLS, tenancy, membership, or required
persistence.** Owner-approved, `FEATURE_FLAG_INFRASTRUCTURE_NET_NEW` in the
ADR above; mirrors `GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md` §14-15's
kill-switch contract ("never auth, data-corruption concealment, critical
observability, RLS, required persistence").

Enforced by substring match on word-start fragments (`auth`, `rls`,
`tenan`, `member`, `persist`) against both `feature_id` and `purpose`,
case-insensitive — `src/lib/flags/never-gate.ts` is the TypeScript source of
truth for the keyword list; `scripts/flags/lib.mjs` mirrors it verbatim
because Node scripts here run un-transpiled and cannot import `.ts`
directly. Both are covered by the same fixture-style tests
(`src/lib/flags/__tests__/never-gate.test.ts`,
`scripts/flags/__tests__/lib.test.mjs`) so the two copies cannot drift
silently.

This is deliberately broad, not a fixed phrase list — a legitimate flag
whose purpose text happens to contain a fragment (e.g. "author") should be
reworded, not exempted. That bias toward rejection matches this repo's
stated risk philosophy (`CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md`
§F.7: "a risk score wrong in the low direction is dangerous; wrong in the
high direction is merely annoying").

Two enforcement points, checked independently (see "Why two checkers"
above):

1. `scripts/flags/generate-flags.mjs` refuses to write
   `registry.generated.ts` at all while any flag has a NEVER-GATE hit.
2. `scripts/check-feature-flags.mjs` (`npm run flags:check`, CI) reports the
   same violation directly against the YAML, independent of the generated
   file.

## The expiry / governance gate — `npm run flags:check`

Runs `flags:generate -- --check` (registry.generated.ts must be current)
then `scripts/check-feature-flags.mjs`, which fails the build on:

- an **expired flag still `active`** — `expires_at` in the past, `status`
  not moved to `archived`
- a flag **missing `owner` or `cleanup_plan`**
- a **`temporary_migration` flag with no `expires_at`**, or one past its
  `expires_at`
- a **NEVER-GATE violation**

Wired into `.github/workflows/ci.yml`'s `Static checks` job as its own
named, `continue-on-error: true` step (same pattern as every other check in
that job — one failure never hides another; the aggregate step fails the
job and prints every non-`success` step by name).

`scripts/check-feature-flags.mjs`'s exit codes follow this repo's
`guards`/`control-plane:verify` convention: `0` clean, `1` a real governance
violation (printed by `feature_id` and rule), `2` the YAML itself could not
be read or parsed — an infrastructure failure, never presented as a pass.

## Runtime evaluation — `isFlagEnabled`

```ts
import { isFlagEnabled } from '@/lib/flags';

if (isFlagEnabled('some_flag')) { /* ... */ }
```

Fail-closed contract (`src/lib/flags/is-enabled.ts`):

- a `feature_id` absent from the registry evaluates to `false` — never
  assume a typo means "on";
- an `archived` flag evaluates to `false` regardless of `default`/
  `environment`;
- a flag past its own `expires_at` evaluates to `false` at runtime too —
  `flags:check` is supposed to catch an expired-but-`active` flag before
  merge, but this is the backstop for a flag that ages past `expires_at` on
  a long-lived deploy between CI runs;
- otherwise, the resolved environment's rollout column applies
  (`environment.production`/`.preview`/`.development`, resolved from
  `VERCEL_ENV`/`NODE_ENV` — see `src/lib/flags/environment.ts`), falling
  back to `default` if that column is somehow absent.

Every evaluation is reported to Sentry — see below.

## Sentry correlation

`src/lib/flags/sentry.ts`'s `recordFlagEvaluationToSentry(name, value)` is
called on every `isFlagEnabled()` evaluation (opt out with
`{ skipTelemetry: true }`, mainly for tests). It records **only the flag
name and its boolean value** — never user-derived data.

`@sentry/nextjs` 10.71.0 ships a real `featureFlagsIntegration` (confirmed
at runtime — `getClient().getIntegrationByName('FeatureFlags')` is the
documented lookup), but `Sentry.init()` lives in `src/instrumentation.ts`
and `src/instrumentation-client.ts`, both owned by the parallel Sentry
session (see `HANDOFF_BRIDGE_CONTROL_PLANE_2026-09-03.md`'s ownership
table) — this PR does not register the integration. Until it is registered,
`recordFlagEvaluationToSentry` falls back to a bounded per-event tag,
`flag.<feature_id>` = `"true" | "false"`. Bounded by construction: the only
names that ever reach this function come from `FLAG_REGISTRY`, so tag
cardinality is capped at the size of `config/feature-flags.yml`, never user
input. When the Sentry session adds `Sentry.featureFlagsIntegration()` to
its `integrations: [...]` array, this helper starts using the real buffered
API with no caller-side change.

## What is, and isn't, wired

Two seed flags describe **real, existing** env-driven toggles without
changing their behavior:

- **`flight_recorder`** describes `HELM_FLIGHT_RECORDER_ENABLED`
  (`src/app/golf/actions/golf.ts:1207-1209`,
  `src/lib/observability/helm-flight-recorder.ts:194` — both files owned by
  the parallel Sentry session, outside this PR's edit scope). Those call
  sites still read `process.env` directly.
- **`coachhelm_v2_availability`** describes `NEXT_PUBLIC_COACHHELM_ENABLED`
  (`src/lib/coachhelm/v2/gate.ts`). That call site still reads
  `process.env` directly too.

Neither is wired through `isFlagEnabled()` by this PR. What this PR proves
instead — `src/lib/flags/__tests__/is-enabled.test.ts`'s
`flight_recorder` parity suite — is that the registry's seeded per-
environment defaults match exactly what
`shouldEmitHelmTraceContext()` (`golf.ts:1207`) evaluates today, for every
`VERCEL_ENV`, with `HELM_FLIGHT_RECORDER_ENABLED` at its **documented
default** (unset). That is a real but limited claim: `FLAG_REGISTRY` is a
build-time snapshot (`registry.generated.ts`'s own header — "reading the
flag registry at request time never touches the filesystem or parses
YAML"), not a live mirror of the env var. If someone manually overrides
`HELM_FLIGHT_RECORDER_ENABLED` in an environment without updating
`config/feature-flags.yml` and regenerating, the flag and the raw read
diverge — the parity test names this gap explicitly rather than hiding it.
Wiring the real call site through `isFlagEnabled('flight_recorder')` closes
that gap (the env var stops being read at all, and the registry becomes the
single live authority) and is left to the session that owns those files.

## How to add a flag

1. Add an entry to `config/feature-flags.yml` following the schema above.
2. `npm run flags:generate` to regenerate `registry.generated.ts`. If the
   generator refuses, it printed exactly which rule failed (NEVER-GATE or
   schema) and on which `feature_id`.
3. `npm run flags:check` — should be clean. Commit both files together.
4. Read the flag with `isFlagEnabled('your_flag_id')` from server-only code.
   Never call it from a Client Component — `src/lib/flags/is-enabled.ts`
   imports `server-only`.

## How to expire / retire a flag

- **Time-boxed and done:** set `status: archived` (keeps the row as a
  historical record — evaluates to `false` everywhere from that point on)
  or delete the row entirely.
- **Rollback = delete the flag row.** There is no separate "rollback"
  mechanism for a flag — removing its entry from `config/feature-flags.yml`
  and regenerating is the rollback. `isFlagEnabled()` on a name no longer in
  the registry fails closed to `false` (see "Runtime evaluation" above), so
  deleting the row is safe by construction even before every call site is
  cleaned up.
- **`temporary_migration` flags must carry `expires_at`.** `flags:check`
  fails a `temporary_migration` row with no `expires_at`, and fails one past
  its `expires_at` — there is no way to ship an eternal "temporary"
  migration flag through this gate.

## The Bridge surface

`/admin/releases` (`src/app/admin/releases/page.tsx`, admin-gated via
`requireSuperAdmin()`) renders every registered flag with its computed
rollout status (`src/lib/admin/data/feature-flags.ts`'s `fetchFeatureFlags`)
— `active` / `expiring_soon` (within 14 days) / `expired` / `archived` /
`no_expiry`. Deliberately does not duplicate `/admin/deploys`' `ReleaseLedger`
or the change-risk-scoring/rollback-recommendation surface a different
track owns (`CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §F.6).

## Not built here

**Percentage/cohort canary rollout is explicitly out of scope.**
`CANARY_ROLLOUT_MECHANISM` in the ADR: "Canary later." `environment` fields
are booleans only — `scripts/flags/lib.mjs#validateFlag` rejects a numeric
or string rollout value at generation time with an explicit "no
percentages — canary is deferred" message, so a future contributor cannot
quietly reinterpret a boolean column as an implicit 0/1 percentage.
