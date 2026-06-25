// =============================================================================
// src/app/lifting/(dashboard)/dashboard/today/page.tsx
//
// Helm Lifting Lab — "Today" board (server component).
//
// Surfaces:
//   • Today's scheduled sessions per athlete (status, estimated time, sport)
//   • Per-athlete readiness check-in status for today
//   • Pending weight-room assignments (sessions not yet started)
//
// Data is fetched server-side; no client-side interactivity needed for the
// read surface — coaches navigate to /sessions/live for real-time interaction.
// =============================================================================

import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Activity,
  CheckCircle2,
  Circle,
  Clock,
  Dumbbell,
  Loader2,
  PlayCircle,
  Scale,
  TrendingUp,
  Users,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveLiftingAccess } from '@/lib/lifting/access';
import { Card } from '@/components/ui/card';
import type { HelmLiftingAthleteRow } from '@/lib/types/helm-lifting';
import type {
  HelmLiftingSessionRow,
  HelmLiftingReadinessCheckinRow,
  HelmLiftingReadinessBand,
} from '@/lib/types/helm-lifting-data';

export const metadata = {
  title: 'Today · Helm Lifting Lab',
};

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

interface TodaySession {
  sessionId: string;
  athleteId: string;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  sport: string;
  status: string;
  title: string | null;
  estimatedMinutes: number | null;
  startedAt: string | null;
  completedAt: string | null;
  readinessBand: HelmLiftingReadinessBand | null;
  readinessScore: number | null;
  hasCheckin: boolean;
}

interface OrgReadiness {
  athleteId: string;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  sport: string;
  checkin: HelmLiftingReadinessCheckinRow | null;
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

async function fetchOrgId(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: coachRow } = await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle() as { data: { organization_id: string } | null };

  if (coachRow) return coachRow.organization_id;

  const { data: viewerRow } = await fromUntyped(supabase, 'helm_lifting_org_viewers')
    .select('organization_id')
    .eq('user_id', userId)
    .maybeSingle() as { data: { organization_id: string } | null };

  return viewerRow?.organization_id ?? null;
}

async function fetchTodayData(orgId: string): Promise<{
  sessions: TodaySession[];
  unCheckedInAthletes: OrgReadiness[];
  stats: { total: number; completed: number; inProgress: number; notStarted: number; checkedIn: number; totalAthletes: number };
}> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // Fetch today's sessions
  const { data: sessionRows } = await fromUntyped(supabase, 'helm_lifting_sessions')
    .select('*')
    .eq('organization_id', orgId)
    .eq('scheduled_date', today)
    .order('created_at', { ascending: true })
    .limit(200) as { data: HelmLiftingSessionRow[] | null };

  const sessions = sessionRows ?? [];

  if (sessions.length === 0) {
    // Still fetch athletes for readiness summary
    const { data: athleteRows } = await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, first_name, last_name, position, sport')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('last_name', { ascending: true })
      .limit(300) as { data: Array<Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position' | 'sport'>> | null };

    const athletes = athleteRows ?? [];
    const unChecked = athletes.map((a) => ({
      athleteId: a.id,
      firstName: a.first_name,
      lastName: a.last_name,
      position: a.position,
      sport: a.sport,
      checkin: null,
    }));

    return {
      sessions: [],
      unCheckedInAthletes: unChecked,
      stats: { total: 0, completed: 0, inProgress: 0, notStarted: 0, checkedIn: 0, totalAthletes: athletes.length },
    };
  }

  // Fetch athletes for sessions
  const athleteIds = [...new Set(sessions.map((s) => s.athlete_id))];

  const { data: athleteRows } = await fromUntyped(supabase, 'helm_lifting_athletes')
    .select('id, first_name, last_name, position, sport')
    .in('id', athleteIds) as {
      data: Array<Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position' | 'sport'>> | null
    };

  const athleteMap = new Map((athleteRows ?? []).map((a) => [a.id, a]));

  // Fetch today's readiness check-ins for session athletes
  const { data: checkinRows } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
    .select('athlete_id, readiness_band, readiness_score, id')
    .in('athlete_id', athleteIds)
    .eq('checkin_date', today) as {
      data: Array<{ athlete_id: string; readiness_band: string | null; readiness_score: number | null; id: string }> | null
    };

  const checkinMap = new Map((checkinRows ?? []).map((c) => [c.athlete_id, c]));

  const todaySessions: TodaySession[] = sessions.map((s) => {
    const athlete = athleteMap.get(s.athlete_id);
    const checkin = checkinMap.get(s.athlete_id);
    return {
      sessionId: s.id,
      athleteId: s.athlete_id,
      firstName: athlete?.first_name ?? null,
      lastName: athlete?.last_name ?? null,
      position: athlete?.position ?? null,
      sport: athlete?.sport ?? s.sport,
      status: s.status,
      title: s.title,
      estimatedMinutes: s.estimated_minutes,
      startedAt: s.started_at,
      completedAt: s.completed_at,
      readinessBand: (checkin?.readiness_band as HelmLiftingReadinessBand | null) ?? null,
      readinessScore: checkin?.readiness_score ?? null,
      hasCheckin: !!checkin,
    };
  });

  // Athletes without check-ins (for the readiness callout)
  const uncheckedAthleteIds = athleteIds.filter((id) => !checkinMap.has(id));
  const unCheckedInAthletes: OrgReadiness[] = uncheckedAthleteIds.map((id) => {
    const a = athleteMap.get(id);
    return {
      athleteId: id,
      firstName: a?.first_name ?? null,
      lastName: a?.last_name ?? null,
      position: a?.position ?? null,
      sport: a?.sport ?? 'baseball',
      checkin: null,
    };
  });

  const stats = {
    total: sessions.length,
    completed: sessions.filter((s) => s.status === 'completed').length,
    inProgress: sessions.filter((s) => s.status === 'started').length,
    notStarted: sessions.filter((s) => s.status === 'assigned').length,
    checkedIn: checkinRows?.length ?? 0,
    totalAthletes: athleteIds.length,
  };

  return { sessions: todaySessions, unCheckedInAthletes, stats };
}

// ---------------------------------------------------------------------------
// Sub-components (server)
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    completed: {
      label: 'Done',
      className: 'bg-primary-50 text-primary-700 border-primary-100',
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    started: {
      label: 'In Progress',
      className: 'bg-amber-50 text-amber-700 border-amber-100',
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    assigned: {
      label: 'Pending',
      className: 'bg-warm-100 text-warm-600 border-warm-200',
      icon: <Circle className="w-3 h-3" />,
    },
    skipped: {
      label: 'Skipped',
      className: 'bg-red-50 text-red-600 border-red-100',
      icon: <Circle className="w-3 h-3" />,
    },
  };

  const cfg = config[status] ?? {
    label: status,
    className: 'bg-warm-100 text-warm-600 border-warm-200',
    icon: <Circle className="w-3 h-3" />,
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function ReadinessBandDot({ band }: { band: HelmLiftingReadinessBand | null }) {
  if (!band) return <span className="w-2.5 h-2.5 rounded-full bg-warm-200 shrink-0" aria-label="No check-in" />;

  const color: Record<HelmLiftingReadinessBand, string> = {
    green: 'bg-primary-500',
    yellow: 'bg-yellow-400',
    orange_lower: 'bg-orange-400',
    orange_upper: 'bg-orange-600',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
  };

  return (
    <span
      className={`w-2.5 h-2.5 rounded-full shrink-0 ${color[band]}`}
      aria-label={`Readiness: ${band}`}
    />
  );
}

function SportIcon({ sport }: { sport: string }) {
  return (
    <span className="text-base leading-none" aria-hidden="true">
      {sport === 'golf' ? '⛳' : '⚾'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TodayPage({ searchParams: _searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/lifting/login');

  const orgId = await fetchOrgId(user.id);
  if (!orgId) redirect('/lifting/login');

  const access = await resolveLiftingAccess(orgId);
  if (!access.canView) redirect('/lifting/login');

  const { sessions, unCheckedInAthletes, stats } = await fetchTodayData(orgId);

  const today = new Date();
  const dateLabel = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const pendingSessions = sessions.filter((s) => s.status === 'assigned');
  const activeSessions = sessions.filter((s) => s.status === 'started');
  const doneSessions = sessions.filter((s) => s.status === 'completed');

  const isEmpty = sessions.length === 0 && stats.totalAthletes === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-warm-900 tracking-tight">Today</h1>
          <p className="text-warm-500 text-sm mt-1">{dateLabel}</p>
        </div>
        {access.isCoach && sessions.length > 0 && (
          <Link
            href="/lifting/dashboard/sessions/live"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-all shadow-sm shadow-primary-600/20"
          >
            <PlayCircle className="w-4 h-4" />
            Open Weight Room
          </Link>
        )}
      </div>

      {/* Empty state — no athletes and no sessions */}
      {isEmpty && (
        <Card variant="raised" noPadding className="p-10 text-center">
          <Dumbbell className="w-10 h-10 text-warm-300 mx-auto mb-3" />
          <p className="text-warm-700 font-semibold mb-1">No sessions scheduled for today</p>
          <p className="text-sm text-warm-400 max-w-sm mx-auto">
            Assign a program to your athletes to see their sessions here. Once sessions are
            scheduled, they'll appear on this board each morning.
          </p>
          {access.isCoach && (
            <Link
              href="/lifting/dashboard/programs"
              className="inline-flex items-center gap-1.5 mt-4 text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              Go to Programs →
            </Link>
          )}
        </Card>
      )}

      {!isEmpty && (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                icon: Dumbbell,
                label: 'Sessions today',
                value: stats.total,
                colorClass: 'bg-primary-50 text-primary-600',
              },
              {
                icon: CheckCircle2,
                label: 'Completed',
                value: stats.completed,
                colorClass: 'bg-primary-50 text-primary-600',
              },
              {
                icon: TrendingUp,
                label: 'In Progress',
                value: stats.inProgress,
                colorClass: 'bg-amber-50 text-amber-600',
              },
              {
                icon: Activity,
                label: 'Checked In',
                value: `${stats.checkedIn} / ${stats.totalAthletes}`,
                colorClass: 'bg-blue-50 text-blue-600',
              },
            ].map(({ icon: Icon, label, value, colorClass }) => (
              <Card key={label} variant="raised" noPadding className="p-4">
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colorClass}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold tabular-nums text-warm-900 leading-none">
                      {value}
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-warm-700">{label}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Body: sessions list + readiness sidebar */}
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Sessions list (3/5 columns) */}
            <div className="lg:col-span-3 space-y-4">
              {/* In-progress */}
              {activeSessions.length > 0 && (
                <section>
                  <h2 className="text-xs font-bold uppercase tracking-wide text-warm-500 mb-2">
                    In Progress ({activeSessions.length})
                  </h2>
                  <div className="space-y-2">
                    {activeSessions.map((s) => (
                      <SessionRow key={s.sessionId} session={s} />
                    ))}
                  </div>
                </section>
              )}

              {/* Pending weight-room assignments */}
              {pendingSessions.length > 0 && (
                <section>
                  <h2 className="text-xs font-bold uppercase tracking-wide text-warm-500 mb-2">
                    Pending ({pendingSessions.length})
                  </h2>
                  <div className="space-y-2">
                    {pendingSessions.map((s) => (
                      <SessionRow key={s.sessionId} session={s} />
                    ))}
                  </div>
                </section>
              )}

              {/* Done */}
              {doneSessions.length > 0 && (
                <section>
                  <h2 className="text-xs font-bold uppercase tracking-wide text-warm-500 mb-2">
                    Done ({doneSessions.length})
                  </h2>
                  <div className="space-y-2">
                    {doneSessions.map((s) => (
                      <SessionRow key={s.sessionId} session={s} />
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Readiness sidebar (2/5 columns) */}
            <div className="lg:col-span-2">
              <ReadinessSidebar
                sessions={sessions}
                uncheckedAthletes={unCheckedInAthletes}
                totalAthletes={stats.totalAthletes}
                checkedIn={stats.checkedIn}
                isCoach={access.isCoach}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionRow — one row in the sessions list
// ---------------------------------------------------------------------------

function SessionRow({ session }: { session: TodaySession }) {
  const initials =
    [session.firstName?.[0], session.lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';

  return (
    <div className="flex items-center gap-3 px-4 py-3 glass-standard backdrop-blur-xl border border-white/20 rounded-2xl hover:bg-cream-50 transition-all">
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full bg-warm-100 flex items-center justify-center text-sm font-bold text-warm-600 shrink-0"
        aria-hidden="true"
      >
        {initials}
      </div>

      {/* Name + details */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-warm-900 truncate">
          {[session.firstName, session.lastName].filter(Boolean).join(' ') || 'Athlete'}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <SportIcon sport={session.sport} />
          {session.title && (
            <p className="text-xs text-warm-500 truncate">{session.title}</p>
          )}
          {session.estimatedMinutes && (
            <span className="inline-flex items-center gap-0.5 text-xs text-warm-400">
              <Clock className="w-3 h-3" />
              {session.estimatedMinutes}m
            </span>
          )}
        </div>
      </div>

      {/* Readiness dot */}
      <ReadinessBandDot band={session.readinessBand} />

      {/* Status badge */}
      <StatusBadge status={session.status} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReadinessSidebar
// ---------------------------------------------------------------------------

interface ReadinessSidebarProps {
  sessions: TodaySession[];
  uncheckedAthletes: OrgReadiness[];
  totalAthletes: number;
  checkedIn: number;
  isCoach: boolean;
}

function ReadinessSidebar({
  sessions,
  uncheckedAthletes,
  totalAthletes,
  checkedIn,
  isCoach,
}: ReadinessSidebarProps) {
  const checkedInSessions = sessions.filter((s) => s.hasCheckin);

  const bandOrder: HelmLiftingReadinessBand[] = [
    'red',
    'orange_upper',
    'orange_lower',
    'blue',
    'yellow',
    'green',
  ];

  const bandLabel: Record<HelmLiftingReadinessBand, string> = {
    green: 'Ready',
    yellow: 'Caution',
    orange_lower: 'Modified',
    orange_upper: 'High Risk',
    red: 'Hold',
    blue: 'Sick',
  };

  const bandColor: Record<HelmLiftingReadinessBand, string> = {
    green: 'bg-primary-50 text-primary-700 border-primary-100',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-100',
    orange_lower: 'bg-orange-50 text-orange-600 border-orange-100',
    orange_upper: 'bg-orange-50 text-orange-700 border-orange-200',
    red: 'bg-red-50 text-red-700 border-red-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
  };

  const sortedCheckedIn = [...checkedInSessions].sort((a, b) => {
    const ia = a.readinessBand ? bandOrder.indexOf(a.readinessBand) : bandOrder.length;
    const ib = b.readinessBand ? bandOrder.indexOf(b.readinessBand) : bandOrder.length;
    return ia - ib;
  });

  return (
    <Card variant="raised" noPadding className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-warm-900 uppercase tracking-wide">Readiness</h2>
        <span className="text-xs text-warm-500 font-medium">
          {checkedIn} / {totalAthletes} checked in
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-warm-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary-500 rounded-full transition-all"
          style={{ width: totalAthletes > 0 ? `${Math.round((checkedIn / totalAthletes) * 100)}%` : '0%' }}
          aria-label={`${checkedIn} of ${totalAthletes} athletes checked in`}
        />
      </div>

      {/* Checked-in athletes sorted by band */}
      {sortedCheckedIn.length > 0 && (
        <div className="space-y-1.5">
          {sortedCheckedIn.map((s) => {
            const name =
              [s.firstName, s.lastName].filter(Boolean).join(' ') || 'Athlete';
            const band = s.readinessBand;
            return (
              <div
                key={s.sessionId}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl glass-standard border border-white/20"
              >
                <ReadinessBandDot band={band} />
                <span className="flex-1 text-sm text-warm-800 truncate font-medium">{name}</span>
                {band && (
                  <span
                    className={`shrink-0 text-xs px-1.5 py-0.5 rounded-md border font-medium ${bandColor[band]}`}
                  >
                    {bandLabel[band]}
                  </span>
                )}
                {s.readinessScore !== null && (
                  <span className="shrink-0 text-xs text-warm-400 tabular-nums">
                    {s.readinessScore.toFixed(1)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Not yet checked in */}
      {uncheckedAthletes.length > 0 && (
        <>
          {sortedCheckedIn.length > 0 && <hr className="border-white/20" />}
          <div>
            <p className="text-xs text-warm-400 font-semibold uppercase tracking-wide mb-1.5">
              No check-in ({uncheckedAthletes.length})
            </p>
            <div className="space-y-1.5">
              {uncheckedAthletes.slice(0, 8).map((a) => (
                <div
                  key={a.athleteId}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl glass-subtle border border-white/10"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full bg-warm-200 shrink-0"
                    aria-label="No check-in"
                  />
                  <span className="flex-1 text-sm text-warm-500 truncate">
                    {[a.firstName, a.lastName].filter(Boolean).join(' ') || 'Athlete'}
                  </span>
                  <SportIcon sport={a.sport} />
                </div>
              ))}
              {uncheckedAthletes.length > 8 && (
                <p className="text-xs text-warm-400 text-center pt-0.5">
                  +{uncheckedAthletes.length - 8} more without check-in
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {checkedInSessions.length === 0 && uncheckedAthletes.length === 0 && (
        <div className="text-center py-4">
          <Users className="w-6 h-6 text-warm-300 mx-auto mb-2" />
          <p className="text-sm text-warm-400">No athletes today</p>
        </div>
      )}

      {/* CTA */}
      {isCoach && (
        <Link
          href="/lifting/dashboard/readiness"
          className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-primary-50 hover:bg-primary-100 transition-all text-sm font-medium text-primary-700 group"
        >
          <span className="flex items-center gap-2">
            <Scale className="w-4 h-4" />
            Full readiness board
          </span>
          <span className="text-primary-400 group-hover:translate-x-0.5 transition-transform">→</span>
        </Link>
      )}
    </Card>
  );
}
