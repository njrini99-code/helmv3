import { Surface, Inset, StatusPill, type FwStatusTone } from '@/components/fairway';
import { PanelNoData, PanelStale } from '../../_components/PanelStates';
import {
  fetchPendingReleaseRisk,
  fetchRollbackRecommendation,
  type PendingReleaseRisk,
} from '@/lib/admin/release-intel/read-model';
import type { RollbackRecommendationView } from '@/lib/admin/release-intel/read-model';
import type { RiskTier } from '@/lib/admin/release-intel/types';

/**
 * Release Intelligence panel — Phase F remainder
 * (`docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §4 F.6):
 * a rollback-recommendation banner for the live release, and a risk-tier
 * chip per pending (`queued_for_release`) release-queue item. Read-only —
 * never triggers a rollback or a deploy, matching
 * `config/release-policy.yml`'s `emergency.automatic_override: false`.
 *
 * Two independent sources, two independent degradations — a failure in one
 * never blanks the other.
 */

const TIER_TONE: Record<RiskTier, FwStatusTone> = {
  R0: 'success',
  R1: 'neutral',
  R2: 'warning',
  R3: 'danger',
};

const RECOMMENDATION_TONE: Record<RollbackRecommendationView['recommendation'], FwStatusTone> = {
  KEEP: 'success',
  WATCH: 'neutral',
  PAUSE_ROLLOUT: 'warning',
  ROLLBACK_RECOMMENDED: 'danger',
  UNKNOWN: 'neutral',
};

async function RollbackBanner() {
  const result = await fetchRollbackRecommendation();
  if (result.status === 'unconfigured') {
    return <PanelNoData label="Rollback recommendation not configured" description="Release ledger data is unavailable." />;
  }
  if (result.status !== 'ok' || !result.data) {
    return <PanelStale label="Rollback recommendation" error={result.error} />;
  }

  const { recommendation, evidence, candidateSha, gatheringSignal } = result.data;

  return (
    <Inset padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-eyebrow uppercase text-warm-500">Live release</p>
          <p className="font-fw-mono text-sm text-warm-900">{candidateSha ? candidateSha.slice(0, 7) : 'unknown'}</p>
        </div>
        <StatusPill tone={RECOMMENDATION_TONE[recommendation]} dot size="sm">
          {gatheringSignal ? 'GATHERING SIGNAL' : recommendation.replace(/_/g, ' ')}
        </StatusPill>
      </div>
      <ul className="mt-2 space-y-1">
        {evidence.map((e, i) => (
          <li key={i} className="text-xs text-warm-600">
            {e.detail}
          </li>
        ))}
      </ul>
    </Inset>
  );
}

function RiskRow({ item }: { item: PendingReleaseRisk }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 border-t border-warm-200/60 py-2 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-warm-900">{item.id}</p>
        <p className="truncate text-xs text-warm-500">feature: {item.featureId}</p>
        {item.score.inputsMissing.length > 0 ? (
          <p className="mt-0.5 text-xs text-warm-400">
            {item.score.inputsMissing.length} input(s) unread — biased toward the higher tier.
          </p>
        ) : null}
      </div>
      <StatusPill tone={TIER_TONE[item.score.tier]} dot size="sm" className="shrink-0">
        {item.score.tier}
      </StatusPill>
    </li>
  );
}

async function ChangeRiskList() {
  const result = await fetchPendingReleaseRisk();
  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Change-risk scoring not configured"
        description="memory/operations/release-queue.yml could not be read from this runtime."
      />
    );
  }
  if (result.status !== 'ok' || !result.data) {
    return <PanelStale label="Change-risk scoring" error={result.error} />;
  }
  if (result.data.length === 0) {
    return <PanelNoData label="Nothing queued for release" description="No release-queue.yml item carries status: queued_for_release." />;
  }
  return <ul>{result.data.map((item) => <RiskRow key={item.id} item={item} />)}</ul>;
}

export function ReleaseIntelPanel() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Surface padding="sm">
        <p className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
          Rollback recommendation
        </p>
        <div className="mt-3">
          <RollbackBanner />
        </div>
      </Surface>
      <Surface padding="sm">
        <p className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
          Pending release change-risk
        </p>
        <div className="mt-3">
          <ChangeRiskList />
        </div>
      </Surface>
    </div>
  );
}
