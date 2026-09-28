import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchFeatureFlags, type FeatureFlagRow, type FlagRolloutStatus } from '@/lib/admin/data/feature-flags';
import { Surface, Inset, StatusPill, InlineNotice, type FwStatusTone } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelPageSkeleton } from '../_components/PanelSkeletons';
import { LocalTime } from '../_components/LocalTime';

export const dynamic = 'force-dynamic';

/**
 * Helm Bridge — Releases.
 *
 * The flag registry (`config/feature-flags.yml` -> `npm run flags:generate`
 * -> `src/lib/flags/registry.generated.ts`) rendered as a governance board:
 * every registered flag, its type, its owner, its per-environment rollout,
 * and how close it is to its own `expires_at` — the same "checked ids
 * always visible, not just violations" shape `/admin/qualifiers` uses,
 * because a flag registry with zero rows shown looks identical to a
 * registry nobody built, and those are very different facts.
 *
 * This surface reads `src/lib/admin/data/feature-flags.ts` only — it has no
 * business logic of its own, matching every other Bridge page's contract.
 * Change-risk scoring and the rollback-recommendation banner
 * (`docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §F.6)
 * are a different track's deliverable against `/admin/deploys`'
 * `ReleaseLedger` — deliberately not duplicated here.
 */

const ROLLOUT_TONE: Record<FlagRolloutStatus, FwStatusTone> = {
  active: 'success',
  expiring_soon: 'warning',
  expired: 'danger',
  archived: 'neutral',
  no_expiry: 'accent',
};

const ROLLOUT_LABEL: Record<FlagRolloutStatus, string> = {
  active: 'active',
  expiring_soon: 'expiring soon',
  expired: 'EXPIRED',
  archived: 'archived',
  no_expiry: 'no expiry',
};

const TYPE_LABEL: Record<FeatureFlagRow['type'], string> = {
  release: 'release',
  experiment: 'experiment',
  operations_kill_switch: 'kill switch',
  temporary_migration: 'temp migration',
};

function EnvironmentDots({ environment }: { environment: FeatureFlagRow['environment'] }) {
  const entries: Array<{ key: keyof FeatureFlagRow['environment']; label: string }> = [
    { key: 'production', label: 'prod' },
    { key: 'preview', label: 'preview' },
    { key: 'development', label: 'dev' },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(({ key, label }) => (
        <span
          key={key}
          className={
            environment[key]
              ? 'inline-flex items-center rounded-full border border-accent-200 bg-accent-50 px-2 py-0.5 text-caption font-medium text-accent-700'
              : 'inline-flex items-center rounded-full border border-border-subtle bg-surface-sunken px-2 py-0.5 text-caption text-text-tertiary'
          }
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function FlagRow({ flag }: { flag: FeatureFlagRow }) {
  return (
    <Inset padding="sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-fw-mono text-sm font-medium text-warm-900">{flag.feature_id}</p>
          <p className="mt-1 text-xs leading-relaxed text-warm-600">{flag.purpose}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusPill tone={ROLLOUT_TONE[flag.rolloutStatus]} dot size="sm">
            {ROLLOUT_LABEL[flag.rolloutStatus]}
          </StatusPill>
          <span className="text-caption text-text-tertiary">{TYPE_LABEL[flag.type]}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <EnvironmentDots environment={flag.environment} />
        <div className="text-right text-caption text-text-tertiary">
          <p>owner: {flag.owner}</p>
          <p>
            {flag.expires_at ? (
              <>
                expires <LocalTime iso={flag.expires_at} />
                {flag.daysUntilExpiry != null ? ` (${flag.daysUntilExpiry}d)` : ''}
              </>
            ) : (
              'no expiry set'
            )}
          </p>
        </div>
      </div>
      {flag.type === 'operations_kill_switch' && flag.kill_switch_behavior ? (
        <p className="mt-2 border-t border-border-subtle pt-2 text-caption leading-relaxed text-warm-600">
          <span className="font-medium text-warm-700">kill switch: </span>
          {flag.kill_switch_behavior}
        </p>
      ) : null}
    </Inset>
  );
}

async function ReleasesPanel() {
  const { flags, countsByStatus } = fetchFeatureFlags();

  if (flags.length === 0) {
    return (
      <InlineNotice tone="info" title="No flags registered">
        config/feature-flags.yml has no entries yet. Add one and run{' '}
        <code className="font-fw-mono">npm run flags:generate</code>.
      </InlineNotice>
    );
  }

  return (
    <div className="space-y-4">
      {countsByStatus.expired > 0 ? (
        <InlineNotice tone="danger" title={`${countsByStatus.expired} flag(s) past expires_at`}>
          `npm run flags:check` should already be blocking merges over this — if a flag reached production still
          expired, its CI gate was bypassed or the flag expired after merge. Archive it or move `expires_at`
          forward with an explicit reason in `cleanup_plan`.
        </InlineNotice>
      ) : null}
      {countsByStatus.expiring_soon > 0 ? (
        <InlineNotice tone="warning" title={`${countsByStatus.expiring_soon} flag(s) expiring within 14 days`}>
          Renew `expires_at` with a reason, or let it lapse and archive the flag.
        </InlineNotice>
      ) : null}
      <Surface elevation="border" padding="none" className="divide-y divide-border-subtle">
        {flags.map((flag) => (
          <FlagRow key={flag.feature_id} flag={flag} />
        ))}
      </Surface>
    </div>
  );
}

export default async function ReleasesPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-warm-900">Releases</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-warm-600">
          Every registered feature flag and kill switch — owner, per-environment rollout, and how close it is to
          its own expiry. Governed by <code className="font-fw-mono">npm run flags:check</code> in CI; see{' '}
          <code className="font-fw-mono">docs/ai-system/FEATURE_FLAGS.md</code>.
        </p>
      </div>
      <PanelBoundary title="Releases" skeleton={<PanelPageSkeleton />}>
        <ReleasesPanel />
      </PanelBoundary>
    </div>
  );
}
