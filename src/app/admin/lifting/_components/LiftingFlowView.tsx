import Link from 'next/link';
import { fetchLiftingFlowLens } from '@/lib/admin/lenses/lifting-flow';
import { fetchLiftingTab } from '@/lib/admin/data/lifting';
import { fetchErrorsTab } from '@/lib/admin/data/errors';
import { JourneyFlow } from '@/components/admin/lenses/JourneyFlow';
import { Surface, StatusPill, InlineNotice, StatStrip } from '@/components/fairway';
import { PanelNoData } from '../../_components/PanelStates';
import { KpiTile } from '../../_components/KpiTile';
import { SectionLabel } from '../../_components/SectionLabel';
import { DetailsDisclosure } from '../../_components/TabHeader';

export async function LiftingFlowView() {
  const [journey, lift, errors] = await Promise.all([
    fetchLiftingFlowLens(),
    fetchLiftingTab(),
    fetchErrorsTab({ feature: 'baseball_lifting', windowHours: 168 }),
  ]);

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <SectionLabel>Program Execution Flow</SectionLabel>
        <DetailsDisclosure className="mt-1">
          <p>
            Program assigned → Session opened → Readiness → Sets logged → Completed → Progress updated — cross-sport,
            fully durable end to end (every stage is backed by a real helm_lifting_* row).
          </p>
        </DetailsDisclosure>
      </div>

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
        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="font-fw-mono text-2xl font-bold tabular-nums text-warm-900">{errors.counts.actionableGroups}</p>
          <p className="min-w-0 text-sm text-warm-500">actionable · {errors.counts.affectedUsers} users affected</p>
        </div>
        <div className="mt-3 divide-y divide-warm-200/60">
          {errors.incidents.slice(0, 3).map((inc) => (
            <div key={inc.key} className="flex items-center justify-between gap-3 py-2">
              <p className="min-w-0 flex-1 truncate text-sm text-warm-800">{inc.title}</p>
              {inc.sport && (
                <StatusPill tone="neutral" size="sm" className="shrink-0">
                  {inc.sport}
                </StatusPill>
              )}
            </div>
          ))}
          {errors.incidents.length === 0 && <PanelNoData label="No Lift Lab incidents in the last 7 days" description="" />}
        </div>
        <Link href="/admin/errors?feature=baseball_lifting" className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-accent-700 hover:underline">
          Open Incidents →
        </Link>
      </Surface>
    </div>
  );
}
