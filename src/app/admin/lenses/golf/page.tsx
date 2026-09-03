import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchGolfJourneyLens } from '@/lib/admin/lenses/golf-journey';
import { fetchErrorsTab } from '@/lib/admin/data/errors';
import { fetchGolfTab, sortTeamsByHealth } from '@/lib/admin/data/golf';
import { fetchAiAvailability } from '@/lib/admin/data/ai-availability';
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

async function GolfLensBody() {
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
      <Surface padding="sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">Golf lens</p>
        <h2 className="mt-2 text-h3 font-semibold tracking-normal text-warm-900 md:text-2xl">Golf Journey River</h2>
        <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-warm-600 md:block">
          Login → Dashboard → Start round → Autosave → Resume → Submit → Stats → Coach visibility. Every stage
          discloses what it can and cannot prove — see the note under each stage.
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
          <SectionLabel>Golf incidents (7d)</SectionLabel>
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
            {errors.incidents.length === 0 && <PanelNoData label="No golf incidents in the last 7 days" description="" />}
          </div>
          <Link href="/admin/errors?sport=golf" className="mt-3 inline-block text-xs font-medium text-accent-700 hover:underline">
            Open Incidents →
          </Link>
        </Surface>

        <Surface padding="sm">
          <SectionLabel>CoachHelm health</SectionLabel>
          <div className="mt-3 flex items-center gap-3">
            <StatusPill tone={ai.status === 'green' ? 'success' : ai.status === 'red' ? 'danger' : ai.status === 'amber' ? 'warning' : 'neutral'} dot>
              {ai.status}
            </StatusPill>
            <p className="text-sm text-warm-600">{ai.summary}</p>
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
                <p className="truncate text-sm text-warm-800">{t.name}</p>
                <div className="flex items-center gap-2">
                  <span className="font-fw-mono text-xs tabular-nums text-warm-500">{t.errors7d} errors/7d</span>
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

export default async function GolfLensPage() {
  await requireSuperAdmin();
  return (
    <div className="space-y-6">
      <AutoRefresh />
      <PanelBoundary title="Golf lens" skeleton={<PanelPageSkeleton rows={6} />}>
        <GolfLensBody />
      </PanelBoundary>
    </div>
  );
}
