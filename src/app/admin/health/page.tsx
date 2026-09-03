import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchFeatureHealth, summarizeFeatureHealth } from '@/lib/admin/data/feature-health';
import type { FeatureHealth } from '@/lib/admin/data/feature-health';
import { fetchFeatureHealthDetail } from '@/lib/admin/data/feature-health-detail';
import { fetchAiAvailability } from '@/lib/admin/data/ai-availability';
import { Eyebrow, Skeleton, Surface } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelStale } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { FeatureDotGrid } from '../_components/FeatureDotGrid';
import { LocalTime } from '../_components/LocalTime';
import { AttributionCoveragePanel } from './_components/AttributionCoveragePanel';
import { FeatureHealthDetailPanel } from './_components/FeatureHealthDetailPanel';
import { fetchJobsTab } from '@/lib/admin/data/jobs';
import { fetchQualifierLogic } from '@/lib/admin/data/qualifier-logic';
import { buildHeartbeatMatrix } from '@/lib/admin/triage/heartbeat-matrix';
import { buildInvariantLattice } from '@/lib/admin/triage/invariant-lattice';
import { HeartbeatMatrixGrid } from '@/components/admin/triage/HeartbeatMatrixGrid';
import { InvariantLatticeGrid } from '@/components/admin/triage/InvariantLatticeGrid';

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

// Coverage panel (a SegmentBar + one notice) plus 3 leading detail cards —
// reserves the rhythm of "one wide instrument, then a short stack of rows"
// rather than the dot grid's own card-grid shape above.
const DETAIL_SKELETON = (
  <div className="space-y-3">
    <Skeleton className="h-24 w-full rounded-xl" />
    {Array.from({ length: 3 }, (_, i) => (
      <Skeleton key={i} className="h-20 w-full rounded-xl" />
    ))}
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
    // Per-app-group tallies computed HERE, once, via the same
    // summarizeFeatureHealth() the Overview/golf/baseball banner reads —
    // FeatureDotGrid's group headers render this, they never re-derive
    // their own red/amber/neutral counts (health-consolidation pass).
    // `degraded` is always false past the early-return above, but pass the
    // real value rather than a literal to keep this call shape identical to
    // admin/golf/page.tsx and admin/baseball/page.tsx.
    const now = new Date();
    const appOrder = ['golfhelm', 'coachhelm', 'baseballhelm'] as const;
    const groupSummaries = Object.fromEntries(
      appOrder.map((app) => [
        app,
        summarizeFeatureHealth(
          { features: features.filter((f: FeatureHealth) => f.app === app), generatedAt, degraded },
          now,
        ),
      ]),
    ) as Record<(typeof appOrder)[number], ReturnType<typeof summarizeFeatureHealth>>;

    return (
      <>
        <p className="font-fw-mono text-xs tabular-nums text-warm-400">
          generated <LocalTime iso={generatedAt} variant="time" />
        </p>
        <div className="mt-4">
          <FeatureDotGrid features={features} groupSummaries={groupSummaries} />
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

  /**
   * Feature Health — DETAIL (tracer follow-up). One `fetchFeatureHealthDetail()`
   * call feeds BOTH panels below (it is `cache()`-memoised per request, so a
   * second call from the same render is free) — the attribution-coverage
   * panel and the ranked per-feature detail list must agree on the same
   * `generatedAt`/window, never two independently-timed reads of
   * `admin_events` that could disagree with each other on screen.
   *
   * Deliberately its OWN `PanelBoundary`, separate from the dot grid above:
   * `fetchFeatureHealthDetail()` reads `admin_events` directly on the admin
   * client — a completely different failure domain from `get_feature_health()`
   * (see that module's doc comment) — so an outage in one must never blank
   * the other.
   */
  async function DetailBody() {
    const detail = await fetchFeatureHealthDetail();
    return (
      <div className="space-y-4">
        <AttributionCoveragePanel coverage={detail.coverage} coverageError={detail.coverageError} />
        <FeatureHealthDetailPanel result={detail} />
      </div>
    );
  }

  /**
   * Heartbeat Matrix + Invariant Lattice (Bridge Premium Phase 3). One
   * `fetchJobsTab()` call feeds the matrix AND the integrity half of the
   * lattice — never a second, duplicate 21-query board read for the same
   * refresh. Failures on either source degrade that source's rows to
   * `unknown`, never the whole section.
   */
  async function HeartbeatAndInvariantsBody() {
    const [jobs, qualifierLogic] = await Promise.allSettled([fetchJobsTab(), fetchQualifierLogic()]);

    const jobsTab = jobs.status === 'fulfilled' ? jobs.value : null;
    const qualifierRes = qualifierLogic.status === 'fulfilled' ? qualifierLogic.value : null;

    const heartbeat = jobsTab ? buildHeartbeatMatrix(jobsTab, Date.now()) : null;
    const lattice = buildInvariantLattice({
      qualifierInvariants: qualifierRes && qualifierRes.status === 'ok' && qualifierRes.data ? qualifierRes.data.invariants : null,
      integrityRows: jobsTab ? jobsTab.integrity : null,
    });

    return (
      <div className="space-y-4">
        <div>
          <Eyebrow as="h3" tone="tertiary">
            Heartbeat matrix
          </Eyebrow>
          {heartbeat ? (
            <HeartbeatMatrixGrid view={heartbeat} />
          ) : (
            <p className="text-sm text-warm-500">Could not read the job board this refresh.</p>
          )}
        </div>
        <div>
          <Eyebrow as="h3" tone="tertiary">
            Invariant lattice
          </Eyebrow>
          <InvariantLatticeGrid view={lattice} />
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
      <div>
        <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
          Feature Health — Detail
        </h2>
        <p className="mt-2 hidden max-w-2xl text-sm text-warm-500 md:block">
          Trailing-7d error/warning counts and true last-event recency per feature, straight from admin_events —
          ranked so a feature failing right now always outranks a louder one that has already gone quiet.
        </p>
        <div className="mt-3">
          <PanelBoundary title="Feature Health — Detail" skeleton={DETAIL_SKELETON}>
            <DetailBody />
          </PanelBoundary>
        </div>
      </div>
      <Surface padding="sm">
        <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
          Heartbeat &amp; invariants
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-warm-500">
          Did every critical job run on schedule, and is the data it maintains still consistent — read from what has
          already been recorded, never from re-running a check at request time.
        </p>
        <div className="mt-3">
          <PanelBoundary title="Heartbeat &amp; invariants" skeleton={<Skeleton className="h-40 w-full rounded-xl" />}>
            <HeartbeatAndInvariantsBody />
          </PanelBoundary>
        </div>
      </Surface>
    </div>
  );
}
