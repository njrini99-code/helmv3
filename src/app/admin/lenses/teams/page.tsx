import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchTeamsEkgLens } from '@/lib/admin/lenses/teams-ekg';
import { fetchAdoptionMapLens } from '@/lib/admin/lenses/adoption-map';
import { fetchSemanticActivityThreads } from '@/lib/admin/lenses/activity-threads';
import { TeamEkgRow } from '@/components/admin/lenses/TeamEkgRow';
import { AdoptionMapPanel } from '@/components/admin/lenses/AdoptionMapPanel';
import { ActivityThreadsPanel } from '@/components/admin/lenses/ActivityThreadsPanel';
import { Surface, InlineNotice } from '@/components/fairway';
import { PanelBoundary } from '../../_components/PanelBoundary';
import { PanelPageSkeleton } from '../../_components/PanelSkeletons';
import { PanelNoData } from '../../_components/PanelStates';
import { AutoRefresh } from '../../_components/AutoRefresh';

export const dynamic = 'force-dynamic';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
      {children}
    </h2>
  );
}

async function TeamsLensBody() {
  const [ekg, adoption, threads] = await Promise.all([
    fetchTeamsEkgLens('attention'),
    fetchAdoptionMapLens(),
    fetchSemanticActivityThreads(),
  ]);

  return (
    <div className="space-y-6">
      <Surface padding="sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">Teams lens</p>
        <h2 className="mt-2 text-h3 font-semibold tracking-normal text-warm-900 md:text-2xl">Team EKG Grid</h2>
        <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-warm-600 md:block">
          30-day activity/error strip per team, plus release impact and unresolved-incident counts since the current
          live release. {ekg.liveReleaseSha ? `Live release ${ekg.liveReleaseSha.slice(0, 8)}.` : 'No live release identified.'}
        </p>
      </Surface>

      {ekg.degradedNote && (
        <InlineNotice tone="warning" title="Some team reads degraded">
          {ekg.degradedNote}
        </InlineNotice>
      )}

      <Surface padding="sm">
        <SectionLabel>Teams, worst-first</SectionLabel>
        <div className="mt-3 divide-y divide-warm-200/60">
          {ekg.teams.length === 0 ? (
            <PanelNoData label="No teams yet" description="Teams appear here once a golf or baseball team is created." />
          ) : (
            ekg.teams.map((t) => <TeamEkgRow key={t.teamId} team={t} />)
          )}
        </div>
      </Surface>

      <ActivityThreadsPanel lens={threads} />

      <div>
        <SectionLabel>Feature adoption by team &amp; role</SectionLabel>
        <div className="mt-3">
          <AdoptionMapPanel lens={adoption} />
        </div>
      </div>
    </div>
  );
}

export default async function TeamsLensPage() {
  await requireSuperAdmin();
  return (
    <div className="space-y-6">
      <AutoRefresh />
      <PanelBoundary title="Teams lens" skeleton={<PanelPageSkeleton rows={8} />}>
        <TeamsLensBody />
      </PanelBoundary>
    </div>
  );
}
