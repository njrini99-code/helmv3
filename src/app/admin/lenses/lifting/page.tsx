import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchLiftingFlowLens } from '@/lib/admin/lenses/lifting-flow';
import { fetchLiftingTab } from '@/lib/admin/data/lifting';
import { fetchErrorsTab } from '@/lib/admin/data/errors';
import { JourneyFlow } from '@/components/admin/lenses/JourneyFlow';
import { Surface, StatusPill, InlineNotice, StatStrip } from '@/components/fairway';
import { PanelBoundary } from '../../_components/PanelBoundary';
import { PanelPageSkeleton } from '../../_components/PanelSkeletons';
import { PanelNoData } from '../../_components/PanelStates';
import { KpiTile } from '../../_components/KpiTile';
import { AutoRefresh } from '../../_components/AutoRefresh';

export const dynamic = 'force-dynamic';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
      {children}
    </h2>
  );
}

async function LiftingLensBody() {
  const [journey, lift, errors] = await Promise.all([
    fetchLiftingFlowLens(),
    fetchLiftingTab(),
    fetchErrorsTab({ feature: 'baseball_lifting', windowHours: 168 }),
  ]);

  return (
    <div className="space-y-6">
      <Surface padding="sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">Lift Lab lens</p>
        <h2 className="mt-2 text-h3 font-semibold tracking-normal text-warm-900 md:text-2xl">
          Program Execution Flow
        </h2>
        <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-warm-600 md:block">
          Program assigned → Session opened → Readiness → Sets logged → Completed → Progress updated — cross-sport,
          fully durable end to end (every stage is backed by a real helm_lifting_* row).
        </p>
      </Surface>

      {lift.allSessionsAreDemoOrgs && (
        <InlineNotice tone="warning" title="Every session below is seed/demo data">
          Every helm_lifting_sessions row that has ever existed belongs to a seed/demo organization.
        </InlineNotice>
      )}

      {journey.degradedNote && (
        <InlineNotice tone="warning" title="Some journey reads degraded">
          {journey.degradedNote}
        </InlineNotice>
      )}

      <JourneyFlow lens={journey} />

      <section className="space-y-4">
        <SectionLabel>Activity pulse</SectionLabel>
        <StatStrip count={4} columns={2} mdColumns={4} ariaLabel="Lift Lab activity KPIs">
          <KpiTile label="Sessions this week" value={lift.sessionsThisWeek} href="/admin/lifting" />
          <KpiTile label="Active athletes 30d" value={lift.activeAthletes30d} href="/admin/lifting" />
          <KpiTile label="Active programs" value={lift.activePrograms} href="/admin/lifting" />
          <KpiTile label="PRs 30d" value={lift.prs30d} href="/admin/lifting" />
        </StatStrip>
      </section>

      <Surface padding="sm">
        <SectionLabel>Cross-sport incidents (7d)</SectionLabel>
        <div className="mt-3 flex items-center gap-4">
          <p className="font-fw-mono text-2xl font-bold tabular-nums text-warm-900">{errors.counts.actionableGroups}</p>
          <p className="text-sm text-warm-500">actionable · {errors.counts.affectedUsers} users affected</p>
        </div>
        <div className="mt-3 divide-y divide-warm-200/60">
          {errors.incidents.slice(0, 3).map((inc) => (
            <div key={inc.key} className="flex items-center justify-between gap-3 py-2">
              <p className="truncate text-sm text-warm-800">{inc.title}</p>
              {inc.sport && (
                <StatusPill tone="neutral" size="sm">
                  {inc.sport}
                </StatusPill>
              )}
            </div>
          ))}
          {errors.incidents.length === 0 && <PanelNoData label="No Lift Lab incidents in the last 7 days" description="" />}
        </div>
        <Link href="/admin/errors?feature=baseball_lifting" className="mt-3 inline-block text-xs font-medium text-accent-700 hover:underline">
          Open Incidents →
        </Link>
      </Surface>
    </div>
  );
}

export default async function LiftingLensPage() {
  await requireSuperAdmin();
  return (
    <div className="space-y-6">
      <AutoRefresh />
      <PanelBoundary title="Lift Lab lens" skeleton={<PanelPageSkeleton rows={6} />}>
        <LiftingLensBody />
      </PanelBoundary>
    </div>
  );
}
