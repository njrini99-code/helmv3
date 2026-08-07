import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchLiftingTab, type LiftingSessionFeedRow } from '@/lib/admin/data/lifting';
import { Surface, StatStrip, StatusPill, TrendChart } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelPageSkeleton } from '../_components/PanelSkeletons';
import { PanelNoData } from '../_components/PanelStates';
import { KpiTile } from '../_components/KpiTile';
import { AutoRefresh } from '../_components/AutoRefresh';
import { LocalTime } from '../_components/LocalTime';

export const dynamic = 'force-dynamic';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
      {children}
    </h2>
  );
}

// Dateline rule — replaces the retired border-l-2 "key panel" left-edge
// stripe. Chrome, not a status signal: a helm-green h-[2px] w-7 rounded-full
// rule above the card title.
function KeyPanelRule() {
  return <span aria-hidden className="mb-3 block h-[2px] w-7 rounded-full bg-accent-500" />;
}

const SPORT_TONE: Record<string, 'success' | 'warning' | 'neutral'> = {
  baseball: 'neutral',
  golf: 'neutral',
};

function SessionRow({ session }: { session: LiftingSessionFeedRow }) {
  const isDone = session.status === 'completed';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-warm-900">{session.athleteName}</p>
        <p className="truncate font-fw-mono text-xs text-warm-500">
          {session.orgName} · {session.sport} · scheduled {session.scheduledDate}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-fw-mono text-xs tabular-nums text-warm-500">
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
        <StatusPill tone={isDone ? 'success' : SPORT_TONE[session.sport] ?? 'neutral'} dot size="sm">
          {session.status}
        </StatusPill>
      </div>
    </div>
  );
}

async function LiftingBody() {
  const lift = await fetchLiftingTab();
  const trend = lift.sessionsByWeek.map((w) => ({ x: w.week, y: w.count }));

  return (
    <div className="space-y-6">
      <Surface padding="sm">
        <KeyPanelRule />
        <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">Lift Lab command center</p>
        <h2 className="mt-2 text-h3 font-semibold tracking-normal text-warm-900 md:text-2xl">
          Cross-sport strength program activity
        </h2>
        <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-warm-600 md:block">
          The third Helm product — helm_lifting_* is genuinely cross-sport (its own `sport` column per row, not a
          golf_/baseball_ table prefix), so every number below is platform-wide, not filtered to one app. The golf and
          baseball tabs each show their own sport-scoped Lift Lab slice; this is the whole picture.
        </p>
      </Surface>

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

export default async function LiftingAdminPage() {
  await requireSuperAdmin();
  return (
    <div className="space-y-6">
      <AutoRefresh />
      <PanelBoundary title="Lift Lab" skeleton={<PanelPageSkeleton rows={6} />}>
        <LiftingBody />
      </PanelBoundary>
    </div>
  );
}
