import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchFeatureHealth } from '@/lib/admin/data/feature-health';
import { Eyebrow } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelStale } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { FeatureDotGrid } from '../_components/FeatureDotGrid';

export const dynamic = 'force-dynamic';

/**
 * W16 Task 3 — Feature Health board. requireSuperAdmin() FIRST LINE
 * (src/lib/admin/require-super-admin.ts:8,42). Data via
 * fetchFeatureHealth() on the USER-SCOPED client (the get_feature_health
 * RPC gates on auth.uid() via is_super_admin() — service_role would be
 * Forbidden, same rule as W3's get_active_sessions).
 */
export default async function FeatureHealthPage() {
  await requireSuperAdmin();

  async function Body() {
    const { features, generatedAt, degraded } = await fetchFeatureHealth();
    if (degraded) {
      return (
        <PanelStale
          label="Feature health pipeline degraded — get_feature_health() did not respond"
          error="Every feature is rendering neutral, not a fabricated state."
        />
      );
    }
    return (
      <>
        <p className="font-fw-mono text-xs tabular-nums text-warm-400">
          generated {new Date(generatedAt).toLocaleTimeString()}
        </p>
        <div className="mt-4">
          <FeatureDotGrid features={features} />
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <AutoRefresh />
      <div>
        <Eyebrow as="p" tone="accent">
          Feature Health
        </Eyebrow>
        {/* Mobile Doctrine rule 2: eyebrow + long title + paragraph is a
            desktop cover treatment. Below `md` the headline condenses to
            text-h3 and the descriptive paragraph is dropped entirely
            (mirrors admin/page.tsx CommandHeader and admin/baseball's
            masthead) so the feature grid — the actual daily-loop content —
            is reachable at 390px without scrolling past decoration first. */}
        <h1 className="mt-1 text-h3 font-semibold text-warm-900 md:text-2xl">
          Every GolfHelm, CoachHelm, and BaseballHelm feature, at a glance
        </h1>
        <p className="mt-1 hidden max-w-2xl text-sm text-warm-500 md:block">
          Computed from get_feature_health() with 2-window hysteresis — a single blip never flips a dot. Features with
          no feature-tagged data yet render neutral, never red or fake-green. Baseball client errors are promoted into
          feature tags before they reach this board.
        </p>
      </div>
      <PanelBoundary title="Feature Health">
        <Body />
      </PanelBoundary>
    </div>
  );
}
