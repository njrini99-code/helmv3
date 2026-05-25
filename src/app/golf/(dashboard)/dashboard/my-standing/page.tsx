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
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';

import { StandingBar } from '@/components/golf/coachhelm/v3/StandingBar';
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

  const standingMap = await loadPlayerStandingMap(player.id);

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
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8">
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
            CATEGORY_ORDER.map((group) => {
              const rows = byCategory.get(group.category) ?? [];
              if (rows.length === 0) return null;
              return (
                <section key={group.category} className="mb-8">
                  <h2 className="text-base font-medium text-warm-900 tracking-[-0.012em] mb-1">
                    {group.label}
                  </h2>
                  <p className="text-xs text-warm-500 mb-3">{group.description}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {rows.map(({ id, standing, cfg }) => (
                      <StandingBar
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
      <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em] mb-2">
        No standing yet
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
