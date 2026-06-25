'use client';

// =============================================================================
// src/components/lifting/performance/PlayerNutritionPlans.tsx
//
// Helm Lifting Lab — active nutrition plan card for player profiles.
// Displays the athlete's current active nutrition plan with type-specific
// action (open link / download doc / read note).
// Shows acknowledge state when acknowledged_at is provided.
// Honest empty state.
// =============================================================================

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import {
  IconNote,
  IconExternalLink,
  IconDownload,
  IconFile,
  IconInfo,
  IconCheck,
} from '@/components/icons';
import type { ActiveNutritionPlanSummary } from '@/app/lifting/actions/performance-profile';
import type { PlanType } from '@/lib/types/helm-lifting-checkins';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  plan: ActiveNutritionPlanSummary | null;
  /**
   * Optional ISO timestamp from helm_lifting_nutrition_plan_assignments.acknowledged_at.
   * When set, shows an "Acknowledged" badge on the active plan.
   */
  acknowledgedAt?: string | null;
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function planTypeIcon(type: PlanType) {
  switch (type) {
    case 'link':     return <IconExternalLink size={16} className="text-primary-600" />;
    case 'document': return <IconFile size={16} className="text-primary-600" />;
    default:         return <IconNote size={16} className="text-primary-600" />;
  }
}

function planTypeBadge(type: PlanType): string {
  switch (type) {
    case 'link':     return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'document': return 'bg-primary-50 text-primary-700 border-primary-200';
    default:         return 'bg-warm-100 text-warm-700 border-warm-200';
  }
}

function planTypeLabel(type: PlanType): string {
  switch (type) {
    case 'link':     return 'External link';
    case 'document': return 'Document';
    default:         return 'Note';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlayerNutritionPlans({
  plan,
  acknowledgedAt = null,
  loading = false,
}: Props) {
  if (loading) {
    return (
      <Card variant="glass">
        <CardHeader>
          <Skeleton className="h-5 w-40 rounded-lg" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-28 w-full rounded-2xl" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="glass">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <IconNote size={18} className="text-primary-600" />
            <h3 className="font-semibold text-warm-900">Nutrition Plan</h3>
          </div>
          {plan && acknowledgedAt && (
            <Badge className="bg-primary-50 text-primary-700 border border-primary-200 text-micro px-2 py-0.5">
              <IconCheck size={10} className="mr-1" />
              Acknowledged
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {!plan ? (
          <EmptyState
            icon={<IconNote size={24} />}
            title="No active nutrition plan"
            description="Your coach will assign a nutrition plan when available."
          />
        ) : (
          <div className="space-y-3">
            {/* Plan card */}
            <div className="rounded-2xl border border-white/40 glass-standard p-4 shadow-sm hover:bg-cream-50 transition-colors duration-150">
              <div className="flex items-start gap-3">
                {/* Icon container */}
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-50 ring-1 ring-primary-100">
                  {planTypeIcon(plan.plan_type)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-warm-900">
                      {plan.title}
                    </p>
                    <span
                      className={`shrink-0 rounded-md border px-2 py-0.5 text-micro font-semibold ${planTypeBadge(plan.plan_type)}`}
                    >
                      {planTypeLabel(plan.plan_type)}
                    </span>
                  </div>

                  {plan.published_at && (
                    <p className="mt-0.5 text-xs text-warm-400">
                      Assigned {fmtDate(plan.published_at)}
                    </p>
                  )}
                  {plan.file_name && (
                    <p className="mt-0.5 truncate text-xs text-warm-500">{plan.file_name}</p>
                  )}

                  {/* Acknowledged state */}
                  {acknowledgedAt && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-primary-600">
                      <IconCheck size={11} />
                      <span>
                        Acknowledged {fmtDate(acknowledgedAt)}
                      </span>
                    </p>
                  )}
                </div>
              </div>

              {/* Action button */}
              <div className="mt-3 flex gap-2">
                {plan.plan_type === 'link' && plan.external_url && (
                  <a
                    href={plan.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-warm-200 bg-cream-50 px-3 py-1.5 text-xs font-semibold text-warm-800 shadow-sm transition-all hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
                  >
                    <IconExternalLink size={14} />
                    Open plan
                  </a>
                )}

                {plan.plan_type === 'document' && plan.storage_path && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-xl border border-warm-200 bg-warm-100 px-3 py-1.5 text-xs font-medium text-warm-400"
                    title="Download available via your coach's system"
                  >
                    <IconDownload size={14} />
                    Download
                  </span>
                )}
              </div>
            </div>

            {/* Info note */}
            <div className="flex items-start gap-2 rounded-xl bg-warm-50/80 px-3 py-2.5 text-xs text-warm-500">
              <IconInfo size={14} className="mt-0.5 shrink-0 text-warm-400" />
              <span>
                Questions about your plan? Reach out to your strength coach directly.
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
