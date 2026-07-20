'use client';

/**
 * ============================================================================
 * InsightsDrill — `?view=insights` (spec §5.3, "full feed")
 * ----------------------------------------------------------------------------
 * The secondary insight feed (ported from `FairwayPlayerCoachHelm`'s "More
 * for you" section) — hierarchical THEMES (flag on + present) REPLACE the
 * flat feed, exactly as the monolith did; the top insight itself lives on
 * the bento home, so this feed is the REST of the evidence (deduped).
 * ========================================================================== */

import { useState } from 'react';

import { DrillPanel, useStage } from '@/components/fairway/modules';
import { InsightCard, InsightPanel, type InsightPanelAction, type InsightPriority } from '@/components/fairway';
import { StandingStrip } from '@/components/fairway/charts/StandingStrip';
import { PracticeRxPanel } from '@/components/fairway/pages/coachhelm/PracticeRxPanel';
import { ThemesPanel } from '@/components/fairway/cards-insight/themes';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { CauseNode, ThemeNode } from '@/lib/coachhelm/v3/themes/types';

function toInsightPriority(p: EvidenceInsight['priority']): InsightPriority {
  switch (p) {
    case 'urgent':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    default:
      return 'low';
  }
}

function insightOverline(i: EvidenceInsight): string {
  const cat = i.category ? i.category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Insight';
  return `${cat} · Signal`;
}

export interface InsightsDrillProps {
  insights: EvidenceInsight[];
  standingByMetric: Record<string, PlayerStanding>;
  themesEnabled: boolean;
  themes: ThemeNode[];
  onRate: (insightId: string, rating: 'helpful' | 'not_helpful' | 'acknowledged' | 'dismissed') => void;
  onMakePlan: (cause: CauseNode, theme: ThemeNode) => void;
  makePlanPendingId: string | null;
}

export function InsightsDrill({
  insights,
  standingByMetric,
  themesEnabled,
  themes,
  onRate,
  onMakePlan,
  makePlanPendingId,
}: InsightsDrillProps) {
  const { home } = useStage();
  const [openInsight, setOpenInsight] = useState<EvidenceInsight | null>(null);

  const showThemes = themesEnabled && themes.length > 0;

  return (
    <DrillPanel title="Insights" backLabel="Home" onBack={home}>
      {showThemes ? (
        <ThemesPanel
          themes={themes}
          // eslint-disable-next-line jsx-a11y/aria-role
          role="player"
          onMakePlan={onMakePlan}
          makePlanPendingId={makePlanPendingId}
        />
      ) : insights.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {insights.map((insight) => {
            const m = insight.evidence.metric;
            const cfg = getMetricRenderConfig(m);
            const st = cfg ? standingByMetric?.[m] : undefined;
            return (
              <InsightCard
                key={insight.id}
                variant="compact"
                priority={toInsightPriority(insight.priority)}
                overline={insightOverline(insight)}
                title={insight.title}
                interactive
                role="button"
                tabIndex={0}
                onClick={() => setOpenInsight(insight)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpenInsight(insight);
                  }
                }}
              >
                {insight.content}
                {st && cfg ? (
                  <div className="mt-3">
                    <StandingStrip
                      size="inline"
                      metric_id={m}
                      metric_label={cfg.display_label}
                      player_value={st.player_value}
                      team_avg={st.team_avg}
                      team_n={st.team_n}
                      team_pct={st.team_pct}
                      pga_value={st.pga_value}
                      is_womens={st.is_womens}
                      direction={cfg.direction}
                      unit={cfg.unit}
                      scale={cfg.default_scale}
                      show_cohort_text={false}
                    />
                  </div>
                ) : null}
              </InsightCard>
            );
          })}
        </div>
      ) : (
        <p className="font-fw-sans text-body-sm text-text-tertiary">
          No more insights right now — log a few more rounds and CoachHelm will surface the next pattern.
        </p>
      )}

      {openInsight ? (
        <InsightPanel
          mode="sheet"
          open
          onOpenChange={(o) => {
            if (!o) setOpenInsight(null);
          }}
          priority={toInsightPriority(openInsight.priority)}
          overline={insightOverline(openInsight)}
          title={openInsight.title}
          evidence={
            openInsight.evidence?.metric_label ? (
              <span>
                <span className="font-medium text-text-primary">{openInsight.evidence.metric_label}:</span>{' '}
                {openInsight.evidence.your_value_display || String(openInsight.evidence.your_value ?? '')}
              </span>
            ) : undefined
          }
          evidenceLabel={openInsight.evidence?.metric_label ? 'The evidence' : undefined}
          actions={
            [
              {
                key: 'acknowledge',
                label: 'Acknowledge',
                onClick: () => {
                  onRate(openInsight.id, 'acknowledged');
                  setOpenInsight(null);
                },
              },
              {
                key: 'dismiss',
                label: 'Dismiss',
                onClick: () => {
                  onRate(openInsight.id, 'dismissed');
                  setOpenInsight(null);
                },
              },
            ] satisfies InsightPanelAction[]
          }
        >
          {openInsight.content}
          <PracticeRxPanel drills={openInsight.drills ?? []} variant="sheet" />
        </InsightPanel>
      ) : null}
    </DrillPanel>
  );
}
