import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchFeatureAdoption } from '@/lib/admin/data/feature-adoption';
import { AdoptionHeatGrid, Eyebrow, Surface, SkeletonStat, SkeletonList } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelStale } from '../_components/PanelStates';
import { LocalTime } from '../_components/LocalTime';
import { AutoRefresh } from '../_components/AutoRefresh';
import { FeatureConstellation } from './FeatureConstellation';

export const dynamic = 'force-dynamic';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
      {children}
    </h2>
  );
}

const SKELETON = (
  <div className="space-y-6">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <SkeletonStat />
      <SkeletonStat />
      <SkeletonStat />
    </div>
    <SkeletonList rows={6} />
  </div>
);

export default async function UtilizationPage() {
  await requireSuperAdmin();

  async function Body() {
    const result = await fetchFeatureAdoption();

    if (result.status === 'error') {
      return (
        <Surface padding="sm">
          <PanelStale label="Feature adoption" error={result.error} />
        </Surface>
      );
    }

    const { rows, users, readouts, generatedAt } = result;

    return (
      <div className="space-y-6">
        {/* Below sm: 3 readouts stack full-width; sm+ reverts to the
            original 3-equal-column row (Mobile Doctrine — no full-screen
            monolith stacks, but 3 short readouts earn a plain stack on a
            narrow phone rather than a cramped 3-up squeeze). */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Surface padding="sm">
            <p className="text-eyebrow uppercase text-warm-500">Touched today</p>
            <p className="font-fw-mono text-h2 tabular-nums text-warm-900">{readouts.touchedToday}</p>
            <p className="text-caption text-warm-500">of {rows.length} registry features</p>
          </Surface>
          <Surface padding="sm">
            <p className="text-eyebrow uppercase text-warm-500">Quiet 14+ days</p>
            <p className="font-fw-mono text-h2 tabular-nums text-warm-900">{readouts.quiet14d}</p>
            <p className="text-caption text-warm-500">no unique-user activity in 2 weeks</p>
          </Surface>
          <Surface padding="sm">
            <p className="text-eyebrow uppercase text-warm-500">Dropout risk</p>
            <p className="font-fw-mono text-h2 tabular-nums text-warm-900">{readouts.dropoutRiskCount}</p>
            <p className="text-caption text-warm-500">high-tier, quiet 3+ consecutive days</p>
          </Surface>
        </section>

        <Surface as="section" padding="sm" className="min-w-0">
          <SectionLabel>Adoption terrain</SectionLabel>
          <p className="mt-2 text-caption text-warm-500">
            Rows grouped GolfHelm → CoachHelm → BaseballHelm, tier-sorted within each band. Fill is a per-row log
            scale of that row&apos;s own 30-day max — a quiet low-tier feature still shows real texture. Click a
            feature label to view its error trace; click a cell for that day&apos;s detail.
          </p>
          <div className="mt-3">
            <AdoptionHeatGrid rows={rows} rowHrefTemplate="/admin/errors?feature={key}" />
          </div>
        </Surface>

        <Surface as="section" padding="sm" className="min-w-0">
          <SectionLabel>Feature constellation</SectionLabel>
          <p className="mt-2 text-caption text-warm-500">
            Who is actually driving each feature. Select a power user to see exactly which features they touch;
            everything else dims.
          </p>
          <div className="mt-3">
            <FeatureConstellation rows={rows} users={users} />
          </div>
        </Surface>

        <p className="text-caption text-warm-400">
          generated <LocalTime iso={generatedAt} variant="datetime" /> · window: trailing 12 weeks, one shared read
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AutoRefresh intervalMs={60_000} />
      <div>
        <Eyebrow as="p" tone="accent">
          Utilization
        </Eyebrow>
        <h1 className="mt-2 text-2xl font-semibold text-warm-900">Feature adoption &amp; utilization</h1>
      </div>
      <PanelBoundary title="Utilization" skeleton={SKELETON}>
        <Body />
      </PanelBoundary>
    </div>
  );
}
