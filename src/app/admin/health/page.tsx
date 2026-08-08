import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchFeatureHealth } from '@/lib/admin/data/feature-health';
import { fetchAiAvailability } from '@/lib/admin/data/ai-availability';
import { Eyebrow, Skeleton } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelStale } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { FeatureDotGrid } from '../_components/FeatureDotGrid';
import { LocalTime } from '../_components/LocalTime';

export const dynamic = 'force-dynamic';

// Neither panel below is a card, so neither gets a card-shaped fallback:
// AiBody is one status dot beside two lines of copy, and Body is a mono
// timestamp above FeatureDotGrid's `rounded-xl` chip grid.
const AI_SKELETON = (
  <div className="flex items-start gap-3">
    <Skeleton circle className="mt-1.5 h-2.5 w-2.5 shrink-0" />
    <div className="min-w-0 flex-1 space-y-2">
      <Skeleton className="h-4 w-56 max-w-full" />
      <Skeleton className="h-3.5 w-80 max-w-full" />
    </div>
  </div>
);

const HEALTH_SKELETON = (
  <div>
    <Skeleton className="h-3 w-36" />
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  </div>
);

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
    const { features, generatedAt, degraded, degradedReason } = await fetchFeatureHealth();
    if (degraded) {
      return (
        <PanelStale
          label="Feature health pipeline degraded — get_feature_health() did not respond"
          // Show the RPC's own words. This panel replaces the entire board, so
          // without them "degraded" covers everything from a dead database to a
          // payload the function rejected — states with very different fixes.
          // Super-admin-gated route (requireSuperAdmin() above), so the raw
          // Postgres message is not an exposure.
          error={
            degradedReason
              ? `${degradedReason} — every feature is rendering neutral, not a fabricated state.`
              : 'Every feature is rendering neutral, not a fabricated state.'
          }
        />
      );
    }
    return (
      <>
        <p className="font-fw-mono text-xs tabular-nums text-warm-400">
          generated <LocalTime iso={generatedAt} variant="time" />
        </p>
        <div className="mt-4">
          <FeatureDotGrid features={features} />
        </div>
      </>
    );
  }

  /**
   * #1256 — AI availability sits in its OWN panel, deliberately not folded
   * into the dot grid below.
   *
   * CoachHelm was 100% template-fallback for 8 days while this board showed a
   * single amber dot for the subsystem. That is a category error, not a bug in
   * the grid: the grid is computed from error counts with 2-window hysteresis,
   * which is right for errors, but a total AI outage produces almost no error
   * volume because falling back to a template is a SUCCESSFUL path that logs
   * one throttled warning. A rate needs its own reading, and it must not
   * inherit the hysteresis — one fully dark day is worth showing at once.
   */
  async function AiBody() {
    const ai = await fetchAiAvailability();
    if (ai.degraded) {
      return (
        <PanelStale
          label="AI availability unavailable — golf_coachhelm_llm_calls did not respond"
          error="Rendering neutral rather than a fabricated availability figure."
        />
      );
    }
    const dot =
      ai.status === 'red'
        ? 'bg-fw-danger'
        // `bg-fw-warning`, not `bg-amber-500`: a fixed-palette amber does not
        // move when the dark token block flips, and it was the only hardcoded
        // colour left on this board. Its three siblings here are already on
        // tokens (fw-danger / accent-500 / warm-300).
        : ai.status === 'amber'
          ? 'bg-fw-warning'
          : ai.status === 'green'
            ? 'bg-accent-500'
            : 'bg-warm-300';
    return (
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
        <div>
          <p className="text-sm font-medium text-warm-900">
            CoachHelm AI ·{' '}
            {ai.availability === null ? 'no signal' : `${Math.round(ai.availability * 100)}% availability`}
          </p>
          <p className="mt-0.5 text-sm text-warm-500">{ai.summary}</p>
        </div>
      </div>
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
      <PanelBoundary title="AI availability" skeleton={AI_SKELETON}>
        <AiBody />
      </PanelBoundary>
      <PanelBoundary title="Feature Health" skeleton={HEALTH_SKELETON}>
        <Body />
      </PanelBoundary>
    </div>
  );
}
