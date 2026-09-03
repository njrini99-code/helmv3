import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchBaseballJourneyLens } from '@/lib/admin/lenses/baseball-journey';
import { fetchTeamsEkgLens } from '@/lib/admin/lenses/teams-ekg';
import { fetchErrorsTab } from '@/lib/admin/data/errors';
import { fetchReleaseLedger } from '@/lib/admin/data/release-ledger';
import { JourneyFlow } from '@/components/admin/lenses/JourneyFlow';
import { Surface, StatusPill, InlineNotice } from '@/components/fairway';
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

async function BaseballLensBody() {
  const [journey, errors, ekg, releases] = await Promise.all([
    fetchBaseballJourneyLens(),
    fetchErrorsTab({ sport: 'baseball', windowHours: 168 }),
    fetchTeamsEkgLens('most-active'),
    fetchReleaseLedger(),
  ]);

  const baseballTeams = ekg.teams.filter((t) => t.sport === 'baseball').slice(0, 5);
  const recentReleases = releases.status === 'ok' ? releases.data?.cards.slice(0, 3) ?? [] : [];

  return (
    <div className="space-y-6">
      <Surface padding="sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">Baseball lens</p>
        <h2 className="mt-2 text-h3 font-semibold tracking-normal text-warm-900 md:text-2xl">Baseball journeys</h2>
        <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-warm-600 md:block">
          Roster & onboarding → Practice planning → Player development → Stats & import → Communications. This
          stage grouping is brief-derived, not a memory/journeys/golden-paths.yml citation — see each stage&apos;s
          note.
        </p>
      </Surface>

      {journey.degradedNote && (
        <InlineNotice tone="warning" title="Some journey reads degraded">
          {journey.degradedNote}
        </InlineNotice>
      )}

      <JourneyFlow lens={journey} />

      <div className="grid gap-6 md:grid-cols-2">
        <Surface padding="sm">
          <SectionLabel>Baseball incidents (7d)</SectionLabel>
          <div className="mt-3 flex items-center gap-4">
            <p className="font-fw-mono text-2xl font-bold tabular-nums text-warm-900">{errors.counts.actionableGroups}</p>
            <p className="text-sm text-warm-500">actionable · {errors.counts.affectedUsers} users affected</p>
          </div>
          <div className="mt-3 divide-y divide-warm-200/60">
            {errors.incidents.slice(0, 3).map((inc) => (
              <p key={inc.key} className="truncate py-2 text-sm text-warm-800">
                {inc.title}
              </p>
            ))}
            {errors.incidents.length === 0 && <PanelNoData label="No baseball incidents in the last 7 days" description="" />}
          </div>
          <Link href="/admin/errors?sport=baseball" className="mt-3 inline-block text-xs font-medium text-accent-700 hover:underline">
            Open Incidents →
          </Link>
        </Surface>

        <Surface padding="sm">
          <SectionLabel>Team impact</SectionLabel>
          <div className="mt-3 divide-y divide-warm-200/60">
            {baseballTeams.length === 0 ? (
              <PanelNoData label="No baseball teams yet" description="" />
            ) : (
              baseballTeams.map((t) => (
                <div key={t.teamId} className="flex items-center justify-between gap-3 py-2">
                  <p className="truncate text-sm text-warm-800">{t.name}</p>
                  <StatusPill tone={t.unresolvedIncidents === null ? 'neutral' : t.unresolvedIncidents > 0 ? 'warning' : 'success'} size="sm">
                    {t.unresolvedIncidents === null ? 'unresolved unknown' : `${t.unresolvedIncidents} unresolved in ${ekg.windowDays}d`}
                  </StatusPill>
                </div>
              ))
            )}
          </div>
        </Surface>
      </div>

      <Surface padding="sm">
        <SectionLabel>Recent changes</SectionLabel>
        <div className="mt-3 divide-y divide-warm-200/60">
          {recentReleases.length === 0 ? (
            <PanelNoData label="No recorded releases" description="Release history appears once Vercel deploy data is available." />
          ) : (
            recentReleases.map((r) => (
              <div key={r.uid} className="flex items-center justify-between gap-3 py-2">
                <p className="truncate font-fw-mono text-xs text-warm-700">{r.commitSha?.slice(0, 8) ?? 'unknown sha'}</p>
                <p className="truncate text-sm text-warm-600">{r.commitMessage ?? '—'}</p>
                <StatusPill tone={r.verdict.tone} size="sm">
                  {r.verdict.label}
                </StatusPill>
              </div>
            ))
          )}
        </div>
        <Link href="/admin/deploys" className="mt-3 inline-block text-xs font-medium text-accent-700 hover:underline">
          Open Deploys & Infra →
        </Link>
      </Surface>
    </div>
  );
}

export default async function BaseballLensPage() {
  await requireSuperAdmin();
  return (
    <div className="space-y-6">
      <AutoRefresh />
      <PanelBoundary title="Baseball lens" skeleton={<PanelPageSkeleton rows={6} />}>
        <BaseballLensBody />
      </PanelBoundary>
    </div>
  );
}
