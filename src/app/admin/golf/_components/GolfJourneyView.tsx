import Link from 'next/link';
import { fetchGolfJourneyLens } from '@/lib/admin/lenses/golf-journey';
import { fetchErrorsTab } from '@/lib/admin/data/errors';
import { fetchGolfTab, sortTeamsByHealth } from '@/lib/admin/data/golf';
import { fetchAiAvailability } from '@/lib/admin/data/ai-availability';
import { fetchReleaseLedger } from '@/lib/admin/data/release-ledger';
import { JourneyFlow } from '@/components/admin/lenses/JourneyFlow';
import { Surface, StatusPill, InlineNotice } from '@/components/fairway';
import { PanelNoData } from '../../_components/PanelStates';
import { SectionLabel } from '../../_components/SectionLabel';
import { DetailsDisclosure } from '../../_components/TabHeader';

export async function GolfJourneyView() {
  const [journey, errors, golf, ai, releases] = await Promise.all([
    fetchGolfJourneyLens(),
    fetchErrorsTab({ sport: 'golf', windowHours: 168 }),
    fetchGolfTab(),
    fetchAiAvailability(),
    fetchReleaseLedger(),
  ]);

  const teams = sortTeamsByHealth(golf.teams).slice(0, 5);
  const recentReleases = releases.status === 'ok' ? releases.data?.cards.slice(0, 3) ?? [] : [];

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <SectionLabel>Golf Journey River</SectionLabel>
        <DetailsDisclosure className="mt-1">
          <p>
            Login → Dashboard → Start round → Autosave → Resume → Submit → Stats → Coach visibility. Every stage
            discloses what it can and cannot prove — see the note under each stage.
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
          <SectionLabel>Golf incidents (7d)</SectionLabel>
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
            {errors.incidents.length === 0 && <PanelNoData label="No golf incidents in the last 7 days" description="" />}
          </div>
          <Link href="/admin/errors?sport=golf" className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-accent-700 hover:underline">
            Open Incidents →
          </Link>
        </Surface>

        <Surface padding="sm">
          <SectionLabel>CoachHelm health</SectionLabel>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <StatusPill tone={ai.status === 'green' ? 'success' : ai.status === 'red' ? 'danger' : ai.status === 'amber' ? 'warning' : 'neutral'} dot>
              {ai.status}
            </StatusPill>
            <p className="min-w-0 flex-1 basis-60 break-words text-sm text-warm-600">{ai.summary}</p>
          </div>
        </Surface>
      </div>

      <Surface padding="sm">
        <SectionLabel>Team impact</SectionLabel>
        <div className="mt-3 divide-y divide-warm-200/60">
          {teams.length === 0 ? (
            <PanelNoData label="No golf teams yet" description="" />
          ) : (
            teams.map((t) => (
              <div key={t.teamId} className="flex items-center justify-between gap-3 py-2">
                <p className="min-w-0 flex-1 truncate text-sm text-warm-800">{t.name}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="whitespace-nowrap font-fw-mono text-xs tabular-nums text-warm-500">{t.errors7d} errors/7d</span>
                  <StatusPill tone={t.health === 'active' ? 'success' : t.health === 'cooling' ? 'warning' : 'danger'} size="sm">
                    {t.health}
                  </StatusPill>
                </div>
              </div>
            ))
          )}
        </div>
      </Surface>

      <Surface padding="sm">
        <SectionLabel>Recent changes</SectionLabel>
        <div className="mt-3 divide-y divide-warm-200/60">
          {recentReleases.length === 0 ? (
            <PanelNoData label="No recorded releases" description="Release history appears once Vercel deploy data is available." />
          ) : (
            recentReleases.map((r) => (
              // Stacked, not three columns: sha + message + verdict in one row
              // left the message a one-word sliver at 375px. Identity and
              // verdict share the first line; the message reads below it.
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
