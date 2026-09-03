import 'server-only';
import { FLAG_REGISTRY } from '@/lib/flags/registry.generated';
import type { FlagDefinition } from '@/lib/flags/types';

/**
 * Bridge read model for the Releases surface (`/admin/releases`).
 *
 * Pure and synchronous — `FLAG_REGISTRY` is a build-time constant
 * (`src/lib/flags/registry.generated.ts`), not a database table, so there
 * is no query to fail here. `degraded` is included on the shape anyway for
 * symmetry with every other `src/lib/admin/data/*.ts` module's "render
 * stale, never a fabricated green" contract, and is always `false` today —
 * see `docs/ai-system/FEATURE_FLAGS.md` for why (no I/O in this path).
 */

export type FlagRolloutStatus = 'active' | 'expiring_soon' | 'expired' | 'archived' | 'no_expiry';

export interface FeatureFlagRow extends FlagDefinition {
  rolloutStatus: FlagRolloutStatus;
  /** null when expires_at is null (no expiry set). Negative once past due. */
  daysUntilExpiry: number | null;
}

export interface FeatureFlagsReadModel {
  flags: FeatureFlagRow[];
  countsByStatus: Record<FlagRolloutStatus, number>;
  degraded: false;
}

/** A flag inside this window (but not yet past due) is called out for renewal/cleanup. */
const EXPIRING_SOON_DAYS = 14;

function daysBetween(now: Date, expiresAt: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((Date.parse(expiresAt) - now.getTime()) / msPerDay);
}

/**
 * Pure per-flag status derivation. Exported for direct unit testing with
 * synthetic `FlagDefinition` fixtures — see
 * `src/lib/admin/data/__tests__/feature-flags.test.ts` — rather than only
 * exercising it indirectly through the real (currently expiry-free) seed
 * data in `config/feature-flags.yml`.
 */
export function rolloutStatusFor(flag: FlagDefinition, now: Date): { rolloutStatus: FlagRolloutStatus; daysUntilExpiry: number | null } {
  if (flag.status === 'archived') {
    return { rolloutStatus: 'archived', daysUntilExpiry: flag.expires_at ? daysBetween(now, flag.expires_at) : null };
  }
  if (flag.expires_at == null) {
    return { rolloutStatus: 'no_expiry', daysUntilExpiry: null };
  }
  const days = daysBetween(now, flag.expires_at);
  if (days < 0) return { rolloutStatus: 'expired', daysUntilExpiry: days };
  if (days <= EXPIRING_SOON_DAYS) return { rolloutStatus: 'expiring_soon', daysUntilExpiry: days };
  return { rolloutStatus: 'active', daysUntilExpiry: days };
}

/**
 * Returns every registered flag with its computed rollout/expiry status,
 * newest-created first. `now` is injectable for tests — never read the
 * clock inside a component that renders this so a fixed snapshot doesn't
 * silently go red in CI on a date nobody chose
 * (see `.claude/rules/shipping.md`'s staleness-marker guidance).
 */
export function fetchFeatureFlags(now: Date = new Date()): FeatureFlagsReadModel {
  const flags: FeatureFlagRow[] = [...FLAG_REGISTRY]
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.feature_id.localeCompare(b.feature_id))
    .map((flag) => ({ ...flag, ...rolloutStatusFor(flag, now) }));

  const countsByStatus: Record<FlagRolloutStatus, number> = {
    active: 0,
    expiring_soon: 0,
    expired: 0,
    archived: 0,
    no_expiry: 0,
  };
  for (const flag of flags) countsByStatus[flag.rolloutStatus] += 1;

  return { flags, countsByStatus, degraded: false };
}
