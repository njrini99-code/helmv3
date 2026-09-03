/**
 * Feature flag registry — shared types.
 *
 * These types describe both the source-of-truth YAML shape
 * (`config/feature-flags.yml`) and the typed constant generated from it
 * (`src/lib/flags/registry.generated.ts` via `npm run flags:generate`).
 * `scripts/flags/lib.mjs` is the plain-JS mirror of the validation rules
 * below (Node scripts do not run through `tsc`), so a change to what counts
 * as valid here must be mirrored there — `scripts/check-feature-flags.mjs`
 * re-derives violations independently of the generator on purpose (see
 * FEATURE_FLAGS.md "why two checkers").
 */

/**
 * `release`             — a normal staged/rollout flag for shipped code.
 * `experiment`          — time-boxed, meant to be torn out either way.
 * `operations_kill_switch` — an ops-only pause lever. Never gates auth, RLS,
 *                         tenancy, membership, or required persistence (the
 *                         NEVER-GATE list, enforced by the generator).
 * `temporary_migration`  — bridges an in-progress migration; MUST carry
 *                         `expires_at` (enforced by `flags:check`).
 */
export type FlagType = 'release' | 'experiment' | 'operations_kill_switch' | 'temporary_migration';

/**
 * `archived` flags are inert everywhere and evaluate to `false` regardless
 * of `default`/`environment` — the config row stays as a historical record
 * (see FEATURE_FLAGS.md "rollback = delete the flag row" for when to
 * actually delete instead of archiving).
 */
export type FlagStatus = 'active' | 'archived';

export type FlagEnvironmentName = 'production' | 'preview' | 'development';

/**
 * Per-environment rollout. Booleans ONLY — no percentages. ADR
 * 2026-09-03-control-plane-owner-decisions.md: "flags yes, canary later";
 * percentage/cohort rollout is explicitly out of scope for this
 * infrastructure. `scripts/flags/lib.mjs#validateFlag` rejects a non-boolean
 * value here at generation time.
 */
export interface FlagEnvironmentRollout {
  production: boolean;
  preview: boolean;
  development: boolean;
}

export interface FlagDefinition {
  /** Stable identifier. Also the string passed to `isFlagEnabled()`. */
  feature_id: string;
  /** Who to ask before flipping or removing this flag. */
  owner: string;
  /** One sentence: what this flag controls and why it exists. */
  purpose: string;
  type: FlagType;
  status: FlagStatus;
  /** ISO 8601 date, e.g. "2026-09-03". */
  created_at: string;
  /**
   * ISO 8601 date. Required for `experiment` and `temporary_migration`.
   * Optional for `release` (norm: set one anyway) and
   * `operations_kill_switch` (a permanent ops lever may omit it).
   */
  expires_at: string | null;
  /** Fallback used when the running environment's rollout key is absent. */
  default: boolean;
  environment: FlagEnvironmentRollout;
  /**
   * Required (non-empty) when `type === 'operations_kill_switch'`. Describes
   * what turning the switch off actually disables, what keeps running, who
   * may change it, and how the change is audited — the "ops contract" the
   * reliability extension spec (§14-15) requires.
   */
  kill_switch_behavior: string | null;
  /** How and when this flag gets removed. Required for every flag. */
  cleanup_plan: string;
}

/** One violation found while validating `config/feature-flags.yml`. */
export interface FlagValidationIssue {
  feature_id: string;
  rule:
    | 'never_gate'
    | 'missing_owner'
    | 'missing_cleanup_plan'
    | 'expired_active'
    | 'temporary_migration_missing_expiry'
    | 'temporary_migration_expired'
    | 'non_boolean_environment'
    | 'invalid_type'
    | 'invalid_status'
    | 'missing_kill_switch_behavior'
    | 'duplicate_feature_id'
    | 'schema';
  detail: string;
}
