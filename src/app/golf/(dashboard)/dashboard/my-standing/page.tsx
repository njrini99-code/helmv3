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
import { BarChart3 } from 'lucide-react';

import { getGolfSessionProfile } from '@/lib/auth/session';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';

import { StandingBar } from '@/components/golf/coachhelm/v3/StandingBar';
import { CounterfactualLine } from '@/components/golf/coachhelm/v3/CounterfactualLine';
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
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { StandingStrip, Surface, EmptyState as FairwayEmptyState } from '@/components/fairway';

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

  // ── Fairway (warm-premium) fork — flag-gated re-skin. Same loaded standing
  // map + the SAME StandingStrip vocabulary the stats cockpit uses, grouped by
  // category, in a calm single column. Legacy below stays byte-for-byte off-flag.
  if (isRedesignEnabled()) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div className="mx-auto w-full max-w-[860px] px-4 py-6 md:px-6 md:py-8">
          <header className="mb-8">
            <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.16em] text-accent-700">
              Standing
            </p>
            <h1 className="mt-1 font-fw-display text-h1 font-semibold tracking-[-0.02em] text-text-primary">
              Where you stack up.
            </h1>
            <p className="mt-1 font-fw-sans text-body-sm text-text-tertiary">
              {isEmpty ? 'No standing data yet.' : `${totalRows} metric${totalRows === 1 ? '' : 's'} tracked`} · you vs your team
              and PGA Tour, refreshed nightly.
            </p>
          </header>

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
                      {rows.map(({ id, standing, cfg }) => (
                        <StandingStrip
                          key={id}
                          metric_id={id}
                          metric_label={cfg.display_label}
                          player_value={standing.player_value}
                          team_avg={standing.team_avg}
                          team_n={standing.team_n}
                          team_pct={standing.team_pct}
                          pga_value={standing.pga_value}
                          direction={cfg.direction}
                          unit={cfg.unit}
                          scale={cfg.default_scale}
                          size="card"
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <AnimatedPage className="min-h-full">
      <AnimatedItem>
        <LargeTitleHeader
          title="My Standing"
          subtitle={
            isEmpty
              ? 'No standing data yet'
              : `${totalRows} metric${totalRows === 1 ? '' : 's'} tracked`
          }
        />
      </AnimatedItem>

      <AnimatedItem>
        <div className="max-w-[720px] mx-auto px-4 md:px-6 py-6 md:py-8">
          <Reveal>
            <div className="surface-stone rounded-3xl p-6 md:p-10 mb-6">
              <PageHeader
                eyebrow="Standing"
                eyebrowAccent="primary"
                title="Where you stack up."
                subtitle="Every tracked metric, with PGA Tour reference and your team average. Refreshed nightly."
              />
            </div>
          </Reveal>

          {isEmpty ? (
            <EmptyState />
          ) : (
            // Stagger the category sections — filter to non-empty groups
            // FIRST so the Reveal stagger indices stay contiguous (no gap
            // for skipped categories like "pressure" when empty).
            CATEGORY_ORDER
              .filter((g) => (byCategory.get(g.category) ?? []).length > 0)
              .map((group, idx) => {
                const rows = byCategory.get(group.category) ?? [];
                return (
                  <Reveal key={group.category} staggerIndex={idx}>
                    <section className="mb-8">
                      <h2 className="text-base font-medium text-warm-900 tracking-[-0.012em] mb-1">
                        {group.label}
                      </h2>
                      <p className="text-xs text-warm-500 mb-3">{group.description}</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {rows.map(({ id, standing, cfg }) => (
                          <div key={id}>
                            <StandingBar
                              metric_id={id}
                              metric_label={cfg.display_label}
                              player_value={standing.player_value}
                              team_avg={standing.team_avg}
                              team_n={standing.team_n}
                              team_pct={standing.team_pct}
                              pga_value={standing.pga_value}
                              direction={cfg.direction}
                              unit={cfg.unit}
                              scale={cfg.default_scale}
                              size="card"
                            />
                            <CounterfactualLine
                              metric_id={id}
                              direction={cfg.direction}
                              player_value={standing.player_value}
                              pga_value={standing.pga_value}
                              player_30d_scoring_avg={playerBaseline}
                              size="card"
                              className="px-4"
                            />
                          </div>
                        ))}
                      </div>
                    </section>
                  </Reveal>
                );
              })
          )}
        </div>
      </AnimatedItem>
    </AnimatedPage>
  );
}

function EmptyState() {
  return (
    <div className="relative surface-matte rounded-3xl overflow-clip p-16 text-center">
      <div
        aria-hidden="true"
        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/70 border border-white/30 shadow-glass"
      >
        <BarChart3 className="h-6 w-6 text-warm-400" strokeWidth={1.5} />
      </div>
      <h3 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] mb-2">
        More rounds needed
      </h3>
      <p className="text-warm-500 mb-2 max-w-sm mx-auto">
        Log 5+ rounds and you’ll see where you stack up vs PGA Tour and your team.
      </p>
      <p className="text-xs text-warm-400 max-w-sm mx-auto">
        Standing refreshes every night at 04:00 UTC.
      </p>
    </div>
  );
}
