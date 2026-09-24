import Link from 'next/link';
import { fetchBaseballJourneyLens } from '@/lib/admin/lenses/baseball-journey';
import { fetchTeamsEkgLens } from '@/lib/admin/lenses/teams-ekg';
import { fetchErrorsTab } from '@/lib/admin/data/errors';
import { fetchReleaseLedger } from '@/lib/admin/data/release-ledger';
import { JourneyFlow } from '@/components/admin/lenses/JourneyFlow';
import { Surface, StatusPill, InlineNotice } from '@/components/fairway';
import { PanelNoData } from '../../_components/PanelStates';
import { SectionLabel } from '../../_components/SectionLabel';
import { DetailsDisclosure } from '../../_components/TabHeader';

export async function BaseballJourneyView() {
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
      <div className="min-w-0">
        <SectionLabel>Baseball journeys</SectionLabel>
        <DetailsDisclosure className="mt-1">
          <p>
            Roster & onboarding → Practice planning → Player development → Stats & import → Communications. This
            stage grouping is brief-derived, not a memory/journeys/golden-paths.yml citation — see each stage&apos;s
            note.
          </p>
        </DetailsDisclosure>
      </div>

      {journey.degradedNote && (
        <InlineNotice tone="warning" title="Some journey reads degraded">
          {journey.degradedNote}
        </InlineNotice>
      )}

      <JourneyFlow lens={journey} />

      <div className="grid gap-6 md:grid-cols-2">
        <Surface padding="sm">
          <SectionLabel>Baseball incidents (7d)</SectionLabel>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="font-fw-mono text-2xl font-bold tabular-nums text-warm-900">{errors.counts.actionableGroups}</p>
            <p className="min-w-0 text-sm text-warm-500">actionable · {errors.counts.affectedUsers} users affected</p>
          </div>
          <div className="mt-3 divide-y divide-warm-200/60">
            {errors.incidents.slice(0, 3).map((inc) => (
              <p key={inc.key} className="line-clamp-2 break-words py-2 text-sm text-warm-800 [overflow-wrap:anywhere]">
                {inc.title}
              </p>
            ))}
            {errors.incidents.length === 0 && <PanelNoData label="No baseball incidents in the last 7 days" description="" />}
          </div>
          <Link href="/admin/errors?sport=baseball" className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-accent-700 hover:underline">
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
                  <p className="min-w-0 flex-1 truncate text-sm text-warm-800">{t.name}</p>
                  <StatusPill tone={t.unresolvedIncidents === null ? 'neutral' : t.unresolvedIncidents > 0 ? 'warning' : 'success'} size="sm" className="shrink-0">
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
              // Stacked, not three columns — same fix as GolfJourneyView: the
              // message was squeezed to a sliver between sha and verdict at 375px.
              <div key={r.uid} className="py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate font-fw-mono text-xs text-warm-700">{r.commitSha?.slice(0, 8) ?? 'unknown sha'}</p>
                  <StatusPill tone={r.verdict.tone} size="sm" className="shrink-0">
                    {r.verdict.label}
                  </StatusPill>
                </div>
                <p className="mt-0.5 line-clamp-2 break-words text-sm text-warm-600 [overflow-wrap:anywhere]">{r.commitMessage ?? '—'}</p>
              </div>
            ))
          )}
        </div>
        <Link href="/admin/deploys" className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-accent-700 hover:underline">
          Open Deploys & Infra →
        </Link>
      </Surface>
    </div>
  );
}
