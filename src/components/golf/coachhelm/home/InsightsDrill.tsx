'use client';

/**
 * ============================================================================
 * InsightsDrill — `?view=insights` (spec §5.3, "full feed")
 * ----------------------------------------------------------------------------
 * The secondary insight feed (ported from `FairwayPlayerCoachHelm`'s "More
 * for you" section) — hierarchical THEMES (flag on + present) REPLACE the
 * flat feed, exactly as the monolith did; the top insight itself lives on
 * the bento home, so this feed is the REST of the evidence (deduped).
 *
 * FIX 1: `topInsightDrills` carries the OVERFLOW of the top insight's
 * prescribed drills — `PlayerHomeBento` renders only the first attached
 * drill (space-constrained bento cell), so anything beyond that (indices
 * 1+, still ranked/capped at 3 by `insight-delivery.ts`) surfaces here via
 * `PracticeRxPanel` so every attached drill stays visible somewhere.
 * ========================================================================== */

import { useMemo, useState } from 'react';

import { DrillPanel, useStage } from '@/components/fairway/modules';
import {
  InsightCard,
  InsightPanel,
  EmptyState,
  Surface,
  type InsightPanelAction,
  type InsightPriority,
} from '@/components/fairway';
import { StandingStrip } from '@/components/fairway/charts/StandingStrip';
import { PracticeRxPanel } from '@/components/fairway/pages/coachhelm/PracticeRxPanel';
import { CategoryInsightsPanel } from '@/components/golf/coachhelm/insights/CategoryInsightsPanel';
import { getThemeDef } from '@/lib/coachhelm/v3/themes/taxonomy';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { EvidenceInsight, InsightAttachedDrill } from '@/app/golf/actions/insight-delivery';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { CauseNode, ThemeNode } from '@/lib/coachhelm/v3/themes/types';
import { Disclosure } from '@/components/golf/coachhelm/root-map/Disclosure';
import { DrillSummary, shortDay } from './DrillSummary';

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

/** Overline: the evidence metric's display label (never a raw metric id),
 *  else the category's taxonomy label. The old "<Category> · Signal" line
 *  repeated the group heading above the card. */
function insightOverline(i: EvidenceInsight): string | undefined {
  const label = i.evidence?.metric_label;
  if (typeof label === 'string' && label.trim()) return label;
  const def = i.category ? getThemeDef(i.category) : null;
  return def?.displayLabel ?? undefined;
}

interface InsightCategoryGroup {
  key: string;
  label: string;
  insights: EvidenceInsight[];
}

/**
 * Groups the flat (themes-disabled) feed by game category using the SAME
 * taxonomy labels the theme scaffold renders (`Putting`, `Approach`, `Off
 * the Tee`, ...) so both code paths read consistently. Category-less rows
 * fall into a trailing "General" group rather than being dropped. Insertion
 * order is preserved per group (the incoming `insights` array is already
 * priority-ordered), so the first group encountered surfaces the
 * highest-priority category first.
 */
function groupInsightsByCategory(insights: EvidenceInsight[]): InsightCategoryGroup[] {
  const GENERAL_KEY = '__general__';
  const byKey = new Map<string, InsightCategoryGroup>();
  for (const insight of insights) {
    const def = insight.category ? getThemeDef(insight.category) : null;
    const key = insight.category ?? GENERAL_KEY;
    const label = def?.displayLabel ?? 'General';
    let group = byKey.get(key);
    if (!group) {
      group = { key, label, insights: [] };
      byKey.set(key, group);
    }
    group.insights.push(insight);
  }
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.key === GENERAL_KEY) return 1;
    if (b.key === GENERAL_KEY) return -1;
    return 0;
  });
}

export interface InsightsDrillProps {
  insights: EvidenceInsight[];
  standingByMetric: Record<string, PlayerStanding>;
  themesEnabled: boolean;
  themes: ThemeNode[];
  onRate: (insightId: string, rating: 'helpful' | 'not_helpful' | 'acknowledged' | 'dismissed') => void;
  onMakePlan: (cause: CauseNode, theme: ThemeNode) => void;
  makePlanPendingId: string | null;
  /** FIX 1: overflow of the top insight's prescribed drills (index 1+) —
   *  `PlayerHomeBento` already rendered the first one. Empty/undefined when
   *  the top insight has 0 or 1 attached drills. */
  topInsightDrills?: InsightAttachedDrill[];
}

export function InsightsDrill({
  insights,
  standingByMetric,
  themesEnabled,
  themes,
  onRate,
  onMakePlan,
  makePlanPendingId,
  topInsightDrills = [],
}: InsightsDrillProps) {
  const { home } = useStage();
  const [openInsight, setOpenInsight] = useState<EvidenceInsight | null>(null);

  const showThemes = themesEnabled && themes.length > 0;

  // Fallback (themes flag off / no theme scaffold yet): group the flat feed
  // by game category too, so "organize by category" holds regardless of
  // which path renders — same taxonomy labels the theme scaffold uses.
  const groupedInsights = useMemo(() => groupInsightsByCategory(insights), [insights]);

  const newest = shortDay(
    insights.reduce<string | null>((max, i) => (max === null || i.created_at > max ? i.created_at : max), null),
  );
  const topGroup = groupedInsights[0] ?? null;

  return (
    <DrillPanel title="Insights" backLabel="Home" onBack={home}>
      <div className="flex flex-col gap-6">
        {insights.length > 0 ? (
          <DrillSummary
            slot="insights-summary"
            eyebrow="More reads on your game"
            value={String(insights.length)}
            unit={insights.length === 1 ? 'insight' : 'insights'}
            takeaway={
              topGroup && insights.length > 0
                ? groupedInsights.length > 1
                  ? `Most are about ${topGroup.label.toLowerCase()}. Tap one for the evidence and a drill.`
                  : `All about ${topGroup.label.toLowerCase()}. Tap one for the evidence and a drill.`
                : 'Grouped by theme below. Tap one for the evidence and a drill.'
            }
            visual={insights.length > 0 ? <CategorySplit groups={groupedInsights} total={insights.length} /> : null}
            basis={newest ? `Newest from ${newest} · your top insight lives on Today` : 'Your top insight lives on Today'}
          />
        ) : null}

        {topInsightDrills.length > 0 ? (
          <Disclosure
            slot="insights-top-drills"
            headingLevel={2}
            title="More drills for your top insight"
            meta={<CountText n={topInsightDrills.length} one="drill" many="drills" />}
          >
            <PracticeRxPanel drills={topInsightDrills} variant="sheet" />
          </Disclosure>
        ) : null}

        {showThemes ? (
          <CategoryInsightsPanel
            themes={themes}
            onMakePlan={onMakePlan}
            makePlanPendingId={makePlanPendingId}
          />
        ) : insights.length > 0 ? (
          <div className="flex flex-col">
            {groupedInsights.map((group, gi) => (
              <Disclosure
                key={group.key}
                slot="flat-category-section"
                headingLevel={2}
                defaultOpen={gi === 0}
                title={group.label}
                meta={<CountText n={group.insights.length} one="insight" many="insights" />}
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {group.insights.map((insight) => {
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
                        <span className="line-clamp-3" data-slot="insight-content">
                          {insight.content}
                        </span>
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
                              pga_omitted={st.pga_omitted}
                              pga_omitted_reason={st.pga_omitted_reason}
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
              </Disclosure>
            ))}
          </div>
        ) : (
          <Surface elevation="border" padding="lg">
            <EmptyState
              title="No more insights right now"
              description="Your top insight is on Today. Log a few more rounds and CoachHelm will surface the next pattern here."
            />
          </Surface>
        )}
      </div>

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

function CountText({ n, one, many }: { n: number; one: string; many: string }) {
  return (
    <span className="shrink-0 text-caption font-normal text-text-tertiary">
      <span className="font-fw-mono tabular-nums text-text-secondary">{n}</span> {n === 1 ? one : many}
    </span>
  );
}

/** One bar: the feed split by category, in proportion, largest first. */
function CategorySplit({ groups, total }: { groups: InsightCategoryGroup[]; total: number }) {
  const sorted = [...groups].sort((a, b) => b.insights.length - a.insights.length);
  const SHADE = [100, 70, 50, 34, 24];
  const summary = sorted.map((g) => `${g.label} ${g.insights.length}`).join(', ');
  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`Insights by category: ${summary}`}
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
        data-slot="insights-split"
      >
        {sorted.map((g, i) => (
          <div
            key={g.key}
            className="h-full min-w-1.5"
            style={{
              width: `${(g.insights.length / total) * 100}%`,
              background: `color-mix(in oklch, var(--fw-color-accent-500) ${SHADE[i] ?? 20}%, var(--fw-color-surface))`,
            }}
          />
        ))}
      </div>
      <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary">
        {sorted.map((g, i) => (
          <li key={g.key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: `color-mix(in oklch, var(--fw-color-accent-500) ${SHADE[i] ?? 20}%, var(--fw-color-surface))` }}
            />
            {g.label} <span className="font-fw-mono tabular-nums text-text-primary">{g.insights.length}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
