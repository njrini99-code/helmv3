import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchLiftingTab, type LiftingSessionFeedRow } from '@/lib/admin/data/lifting';
import { Surface, StatStrip, StatusPill, TrendChart, InlineNotice } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelPageSkeleton } from '../_components/PanelSkeletons';
import { PanelNoData } from '../_components/PanelStates';
import { KpiTile } from '../_components/KpiTile';
import { AutoRefresh } from '../_components/AutoRefresh';
import { DetailsDisclosure, TabHeader } from '../_components/TabHeader';
import { LocalTime } from '../_components/LocalTime';
import { parseView, type AdminViewOf } from '@/lib/admin/views';
import { ViewRail } from '../_components/ViewRail';
import { LiftingFlowView } from './_components/LiftingFlowView';
import { SectionLabel } from '../_components/SectionLabel';

export const dynamic = 'force-dynamic';

const SPORT_TONE: Record<string, 'success' | 'warning' | 'neutral'> = {
  baseball: 'neutral',
  golf: 'neutral',
};

function SessionRow({ session }: { session: LiftingSessionFeedRow }) {
  const isDone = session.status === 'completed';
  // Two lines, not a wrapping flex row: athlete + status on top (the pill
  // never shrinks), then ONE fact line that wraps as prose. The old layout
  // dropped the timestamp+pill cluster to its own line at 375px, where the
  // truncated org/sport line had already lost the scheduled date.
  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 break-words text-sm font-medium text-warm-900">{session.athleteName}</p>
        <StatusPill tone={isDone ? 'success' : SPORT_TONE[session.sport] ?? 'neutral'} dot size="sm" className="shrink-0">
          {session.status}
        </StatusPill>
      </div>
      <p className="mt-0.5 break-words font-fw-mono text-xs leading-5 text-warm-500 [overflow-wrap:anywhere]">
        {session.orgName} · {session.sport} · scheduled {session.scheduledDate} ·{' '}
        <span className="whitespace-nowrap tabular-nums">
          {session.completedAt ? (
            <>
              done <LocalTime iso={session.completedAt} variant="datetime" fallback="—" />
            </>
          ) : (
            <>
              logged <LocalTime iso={session.createdAt} variant="datetime" fallback="—" />
            </>
          )}
        </span>
      </p>
    </div>
  );
}

async function LiftingBody() {
  const lift = await fetchLiftingTab();
  const trend = lift.sessionsByWeek.map((w) => ({ x: w.week, y: w.count }));

  return (
    <div className="space-y-6">
      {/* Was a second masthead card (eyebrow + tagline + a desktop-only
          paragraph). The tab's one header is the TabHeader above the rail;
          the one fact a reader needs — these numbers are platform-wide — is
          stated here, and the reason is one tap away on every screen. */}
      <div>
        <p className="text-body-sm text-warm-600">Platform-wide: every sport&apos;s Lift Lab activity, not one app&apos;s.</p>
        <DetailsDisclosure>
          <p>
            The third Helm product — helm_lifting_* is genuinely cross-sport (its own `sport` column per row, not a
            golf_/baseball_ table prefix), so every number below is platform-wide, not filtered to one app. The golf and
            baseball tabs each show their own sport-scoped Lift Lab slice; this is the whole picture.
          </p>
        </DetailsDisclosure>
      </div>

      {lift.allSessionsAreDemoOrgs && (
        <InlineNotice tone="warning" title="Every session below is seed/demo data">
          Every helm_lifting_sessions row that has ever existed belongs to Rini University or Demo University — no
          real program has logged a Lift Lab session yet. The numbers below are honestly computed; there just isn't
          real usage to compute them from.
          {lift.lastSessionAt && (
            <>
              {' '}
              Last session logged{' '}
              {Math.floor((Date.now() - new Date(lift.lastSessionAt).getTime()) / 86_400_000)} days ago.
            </>
          )}
        </InlineNotice>
      )}

      <section className="space-y-4">
        <SectionLabel>Activity pulse</SectionLabel>
        <StatStrip count={6} columns={3} mdColumns={3} xlColumns={6} ariaLabel="Lift Lab activity pulse KPIs">
          <KpiTile
            label="Sessions this week"
            value={lift.sessionsThisWeek}
            delta={lift.sessionsThisWeek - lift.sessionsLastWeek}
            href="/admin/lifting"
            trendData={lift.sessionsByWeek.slice(-8).map((w) => w.count)}
          />
          <KpiTile label="Sessions today" value={lift.sessionsToday} href="/admin/lifting" />
          <KpiTile label="Active athletes 30d" value={lift.activeAthletes30d} href="/admin/lifting" />
          <KpiTile label="Active programs" value={lift.activePrograms} href="/admin/lifting" />
          <KpiTile label="PRs this week" value={lift.prsThisWeek} href="/admin/lifting" />
          <KpiTile label="PRs 30d" value={lift.prs30d} href="/admin/lifting" />
        </StatStrip>
        {trend.length > 0 ? (
          <TrendChart title="Lift sessions per week (12w)" data={trend} height={180} />
        ) : (
          <PanelNoData
            label="No lift session history yet"
            description="The 12-week sessions trend appears once athletes start logging Lift Lab sessions."
          />
        )}
      </section>

      <Surface padding="sm">
        <SectionLabel>Recent sessions</SectionLabel>
        <div className="mt-3 divide-y divide-warm-200/60">
          {lift.recentSessions.length === 0 ? (
            <PanelNoData
              label="No lift sessions logged yet"
              description="Sessions appear here as athletes log or complete Lift Lab workouts."
            />
          ) : (
            lift.recentSessions.map((session) => <SessionRow key={session.id} session={session} />)
          )}
        </div>
      </Surface>
    </div>
  );
}

export default async function LiftingAdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin();
  const params = (await searchParams) ?? {};
  const view = parseView('/admin/lifting', params.view);

  return (
    <div className="space-y-6">
      <AutoRefresh />
      <TabHeader title="Lift Lab" />
      <ViewRail
        host="/admin/lifting"
        active={view}
        ariaLabel="Lift Lab view"
        searchParams={params}
        labels={{ production: 'Production', flow: 'Program flow' }}
        descriptions={{ production: 'Cross-sport strength program activity.', flow: 'Program assigned → session opened → sets logged → progress updated.' }}
      />
      <PanelBoundary title="Lift Lab" skeleton={<PanelPageSkeleton rows={8} />}>
        {renderView(view)}
      </PanelBoundary>
    </div>
  );
}

/** One branch per registered view — see `src/lib/admin/views.ts`. */
function renderView(view: AdminViewOf<'/admin/lifting'>) {
  switch (view) {
    case 'production':
      return <LiftingBody />;
    case 'flow':
      return <LiftingFlowView />;
  }
}
