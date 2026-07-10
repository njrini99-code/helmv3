/**
 * Player-facing standing matrix — /dashboard/my-standing (W16).
 *
 * Displays one StandingBar per (player, metric) row in
 * `public.golf_player_standing`, grouped by metric category. Mobile-first
 * layout per master plan Part XX (player UX = phone-first).
 *
 * Empty state: player has no standing rows yet (cold-start; <5 rounds
 * logged) — surface a friendly "log 5 rounds to unlock" empty state.
 *
 * Server component. No client interactivity needed for v1; future waves
 * (W17 counterfactual chips, W18 goal-from-standing CTA) layer client
 * pieces on top.
 */

import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { getGolfSessionProfile } from '@/lib/auth/session';

import { loadPlayerStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import {
  METRIC_RENDER_CONFIG,
  type MetricRenderConfig,
} from '@/lib/coachhelm/v3/standing/metric-config';
import {
  METRIC_IDS,
  type MetricId,
} from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { loadPlayerScoringBaseline } from '@/lib/coachhelm/v3/counterfactual/baseline-loader';
import {
  computeCounterfactual,
  formatCounterfactualLine,
} from '@/lib/coachhelm/v3/counterfactual/compute';
import { fairwayScope } from '@/lib/redesign/flag';
import { StandingStrip, Surface, EmptyState as FairwayEmptyState } from '@/components/fairway';
import { CoachHelmShell } from '@/components/fairway/pages/coachhelm/CoachHelmShell';

export const metadata: Metadata = {
  title: 'My Standing | Helm Golf',
  description: 'See how you stack up vs your team and PGA Tour across every tracked metric.',
};

export const revalidate = 300;

// Group ordering for the page. Matches the categories in golf_metrics.
const CATEGORY_ORDER: ReadonlyArray<{
  category: string;
  label: string;
  description: string;
}> = [
  { category: 'sg',           label: 'Strokes Gained',  description: 'Per-round vs field — Mark Broadie’s SG framework.' },
  { category: 'putting',      label: 'Putting',          description: 'Make % by distance and miss patterns.' },
  { category: 'approach',     label: 'Approach',         description: 'Proximity to hole + greens in regulation.' },
  { category: 'short_game',   label: 'Short Game',       description: 'Scrambling by lie type.' },
  { category: 'scoring',      label: 'Scoring',          description: 'Per-par scoring vs PGA + cohort.' },
  { category: 'course_mgmt',  label: 'Course Mgmt',      description: 'Penalty avoidance + big-number rate.' },
  { category: 'pressure',     label: 'Pressure',         description: 'Tournament vs practice + opening-hole tax.' },
];

function metricCategory(metricId: string): string {
  // golf_metrics.category mirror — derive from METRIC_RENDER_CONFIG by walking
  // the canonical METRIC_IDS list and matching the metric_id.
  // (For now we don't carry category in METRIC_RENDER_CONFIG; derive from id.)
  if (metricId.startsWith('sg_')) return 'sg';
  if (metricId.startsWith('putts_made_') || metricId.startsWith('putt_miss_bias_')) return 'putting';
  if (metricId.startsWith('approach_') || metricId === 'gir_pct') return 'approach';
  if (metricId.startsWith('scrambling_')) return 'short_game';
  if (metricId.startsWith('scoring_par_')) return 'scoring';
  if (metricId === 'penalty_rate_per_round' || metricId === 'big_number_rate') return 'course_mgmt';
  if (metricId === 'practice_tournament_delta' || metricId === 'opening_hole_delta') return 'pressure';
  return 'sg';
}

export default async function MyStandingPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  const { player } = session;
  if (!player) {
    // Coaches landing here get bounced — this is a player-only view.
    redirect('/golf/dashboard');
  }

  const [standingMap, playerBaseline] = await Promise.all([
    loadPlayerStandingMap(player.id),
    loadPlayerScoringBaseline(player.id),
  ]);

  // Bucket standing rows by category.
  const byCategory = new Map<string, Array<{ id: MetricId; standing: PlayerStanding; cfg: MetricRenderConfig }>>();
  for (const id of METRIC_IDS) {
    const standing = standingMap.get(id);
    if (!standing) continue;
    const cfg = METRIC_RENDER_CONFIG[id];
    const cat = metricCategory(id);
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push({ id, standing, cfg });
  }

  const totalRows = Array.from(byCategory.values()).reduce((a, b) => a + b.length, 0);
  const isEmpty = totalRows === 0;

  // Same loaded standing map + the SAME StandingStrip vocabulary the stats
  // cockpit uses, grouped by category, in a calm single column.
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto w-full max-w-[860px] px-4 py-2 md:px-6">
        <CoachHelmShell
          active="standing"
          {...{ role: 'player' as const }}
          eyebrow="My Standing"
          title="Where you stack up"
          description={
            `${isEmpty ? 'No standing data yet' : `${totalRows} metric${totalRows === 1 ? '' : 's'} tracked`} · you vs your team and PGA Tour, refreshed nightly.`
          }
        >
          {isEmpty ? (
            <Surface elevation="border" padding="lg">
              <FairwayEmptyState
                title="More rounds needed"
                description="Log 5+ rounds and you’ll see where you stack up vs PGA Tour and your team. Standing refreshes nightly."
              />
            </Surface>
          ) : (
            <div className="flex flex-col gap-10">
              {CATEGORY_ORDER.filter((g) => (byCategory.get(g.category) ?? []).length > 0).map((group) => {
                const rows = byCategory.get(group.category) ?? [];
                return (
                  <section key={group.category} className="flex flex-col gap-3">
                    <div className="px-1">
                      <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.16em] text-text-tertiary">
                        {group.label}
                      </p>
                      <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">{group.description}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {rows.map(({ id, standing, cfg }) => {
                        // F028: the "strokes you'd save vs Tour" projection.
                        // Computed server-side (compute + format are pure).
                        // Suppressed when omitted (no credible anchor), below
                        // the 0.3-strokes floor, or when the player has no
                        // 30-day baseline.
                        const counterfactualText = standing.pga_omitted
                          ? ''
                          : formatCounterfactualLine(
                              computeCounterfactual({
                                metric_id: id,
                                direction: cfg.direction,
                                player_value: standing.player_value,
                                pga_value: standing.pga_value,
                                player_30d_scoring_avg: playerBaseline,
                              }),
                            );
                        return (
                          <div key={id} className="flex flex-col">
                            <StandingStrip
                              metric_id={id}
                              metric_label={cfg.display_label}
                              player_value={standing.player_value}
                              team_avg={standing.team_avg}
                              team_n={standing.team_n}
                              team_pct={standing.team_pct}
                              pga_value={standing.pga_value}
                              pga_omitted={standing.pga_omitted}
                              is_womens={standing.is_womens}
                              direction={cfg.direction}
                              unit={cfg.unit}
                              scale={cfg.default_scale}
                              size="card"
                            />
                            {counterfactualText ? (
                              <p className="mt-1.5 px-1 font-fw-sans text-caption italic text-text-tertiary">
                                {counterfactualText}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </CoachHelmShell>
      </div>
    </div>
  );
}
