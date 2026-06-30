// =============================================================================
// src/app/lifting/(dashboard)/dashboard/athletes/[athleteId]/page.tsx
//
// Individual athlete drill-down page (coach view, server component).
// Shows session history, personal records, and readiness trend for one athlete.
//
// Access is gated by the (dashboard) layout guard. This page additionally
// confirms the athlete belongs to the coach's org via the athlete row itself.
// =============================================================================

import { notFound, redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveLiftingAccess } from '@/lib/lifting/access';
import { AthleteProfileCard } from '@/components/lifting/athletes/AthleteProfileCard';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconDumbbell, IconTrendingUp, IconHeart, IconArrowLeft } from '@/components/icons';
import Link from 'next/link';
import type {
  HelmLiftingAthleteRow,
  HelmLiftingSessionRow,
  HelmLiftingMaxRow,
  HelmLiftingPrRow,
  HelmLiftingReadinessCheckinRow,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveOrgId(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: coach } = await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle() as { data: { organization_id: string } | null };
  if (coach?.organization_id) return coach.organization_id;
  const { data: viewer } = await fromUntyped(supabase, 'helm_lifting_org_viewers')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle() as { data: { organization_id: string } | null };
  return viewer?.organization_id ?? null;
}

function formatDate(iso: string) {
  return new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    completed: 'Completed',
    started: 'In progress',
    assigned: 'Not started',
    missed: 'Missed',
    excused: 'Excused',
    modified: 'Modified',
  };
  return map[status] ?? status;
}

function statusColor(status: string) {
  switch (status) {
    case 'completed':
      return 'bg-primary-100 text-primary-700';
    case 'started':
    case 'modified':
      return 'bg-amber-100 text-amber-700';
    case 'missed':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-warm-100 text-warm-600';
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ athleteId: string }>;
}

export default async function AthleteDetailPage({ params }: Props) {
  const { athleteId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/lifting/login');

  const orgId = await resolveOrgId(user.id);
  if (!orgId) redirect('/lifting/dashboard');

  const access = await resolveLiftingAccess(orgId);
  if (!access.canView) redirect('/lifting/dashboard');

  // Fetch the athlete and verify org membership
  const { data: athlete } = await fromUntyped(supabase, 'helm_lifting_athletes')
    .select('*')
    .eq('id', athleteId)
    .eq('organization_id', orgId)
    .maybeSingle() as { data: HelmLiftingAthleteRow | null };

  if (!athlete) notFound();

  // Fetch last 20 sessions for this athlete
  const { data: sessionRows } = await fromUntyped(supabase, 'helm_lifting_sessions')
    .select('id, title, scheduled_date, status, started_at, completed_at, estimated_minutes, coach_review_status')
    .eq('athlete_id', athleteId)
    .order('scheduled_date', { ascending: false })
    .limit(20) as { data: Pick<HelmLiftingSessionRow, 'id' | 'title' | 'scheduled_date' | 'status' | 'started_at' | 'completed_at' | 'estimated_minutes' | 'coach_review_status'>[] | null };

  const sessions = sessionRows ?? [];

  // Fetch recent PRs (last 10)
  const { data: prRows } = await fromUntyped(supabase, 'helm_lifting_prs')
    .select('id, exercise_id, pr_type, value, unit, achieved_at')
    .eq('athlete_id', athleteId)
    .order('achieved_at', { ascending: false })
    .limit(10) as { data: Pick<HelmLiftingPrRow, 'id' | 'exercise_id' | 'pr_type' | 'value' | 'unit' | 'achieved_at'>[] | null };

  const prs = prRows ?? [];

  // Fetch max records (1RM estimates per exercise — last 5 distinct)
  const { data: maxRows } = await fromUntyped(supabase, 'helm_lifting_maxes')
    .select('id, exercise_id, max_type, value, unit, test_date')
    .eq('athlete_id', athleteId)
    .order('test_date', { ascending: false })
    .limit(10) as { data: Pick<HelmLiftingMaxRow, 'id' | 'exercise_id' | 'max_type' | 'value' | 'unit' | 'test_date'>[] | null };

  const maxes = maxRows ?? [];

  // Fetch last 7 readiness check-ins
  const { data: readinessRows } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
    .select('id, checkin_date, sleep_quality, energy_level, soreness_overall, readiness_score, readiness_band')
    .eq('athlete_id', athleteId)
    .order('checkin_date', { ascending: false })
    .limit(7) as { data: Pick<HelmLiftingReadinessCheckinRow, 'id' | 'checkin_date' | 'sleep_quality' | 'energy_level' | 'soreness_overall' | 'readiness_score' | 'readiness_band'>[] | null };

  const readiness = readinessRows ?? [];

  const latestCheckin = readiness[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Link
        href="/lifting/dashboard/athletes"
        className="inline-flex items-center gap-1.5 text-sm text-warm-500 transition-colors hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
      >
        <IconArrowLeft size={15} />
        All Athletes
      </Link>

      {/* Athlete identity card */}
      <AthleteProfileCard athlete={athlete} latestCheckin={latestCheckin} size="large" />

      {/* Three-column detail grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Session history */}
        <div className="space-y-4 lg:col-span-2">
          <Card variant="glass">
            <CardHeader>
              <div className="flex items-center gap-2">
                <IconDumbbell size={18} className="text-primary-600" />
                <h2 className="text-lg font-semibold text-warm-900">Session History</h2>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {sessions.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={<IconDumbbell size={24} />}
                    title="No sessions yet"
                    description="Sessions appear here once the athlete has been assigned a program."
                  />
                </div>
              ) : (
                <ul className="divide-y divide-warm-100">
                  {sessions.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-6 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-warm-900">
                          {s.title ?? 'Lift'}
                        </p>
                        <p className="text-xs text-warm-400">
                          {formatDate(s.scheduled_date)}
                          {s.estimated_minutes ? ` · ~${s.estimated_minutes} min` : ''}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-micro font-medium ${statusColor(s.status)}`}
                      >
                        {statusLabel(s.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: PRs + Readiness */}
        <div className="space-y-4">
          {/* Personal records */}
          <Card variant="glass">
            <CardHeader>
              <div className="flex items-center gap-2">
                <IconTrendingUp size={18} className="text-primary-600" />
                <h2 className="text-base font-semibold text-warm-900">Bests</h2>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {maxes.length === 0 && prs.length === 0 ? (
                <p className="text-sm text-warm-400">No maxes or PRs recorded yet.</p>
              ) : (
                <>
                  {maxes.slice(0, 5).map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs text-warm-600">
                        {m.max_type.replace(/_/g, ' ')}
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-warm-900">
                        {m.value} {m.unit}
                      </span>
                    </div>
                  ))}
                  {prs.slice(0, 5).map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs text-warm-600">
                        PR · {p.pr_type.replace(/_/g, ' ')}
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-primary-700">
                        {p.value} {p.unit}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          {/* Readiness trend */}
          <Card variant="glass">
            <CardHeader>
              <div className="flex items-center gap-2">
                <IconHeart size={18} className="text-primary-600" />
                <h2 className="text-base font-semibold text-warm-900">Readiness (7 days)</h2>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {readiness.length === 0 ? (
                <p className="text-sm text-warm-400">No check-ins yet.</p>
              ) : (
                readiness.map((r) => {
                  const bandColor = r.readiness_band === 'green'
                    ? 'bg-primary-500'
                    : r.readiness_band === 'yellow'
                      ? 'bg-amber-400'
                      : r.readiness_band === 'orange_lower' || r.readiness_band === 'orange_upper'
                        ? 'bg-orange-400'
                        : r.readiness_band === 'red'
                          ? 'bg-red-500'
                          : 'bg-warm-200';
                  const score = r.readiness_score ?? 0;
                  return (
                    <div key={r.id} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-xs text-warm-400">
                        {new Date(r.checkin_date + 'T00:00:00').toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      <div className="flex-1 overflow-hidden rounded-full bg-warm-100">
                        <div
                          className={`h-1.5 rounded-full ${bandColor} transition-all`}
                          style={{ width: `${Math.round(score)}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs font-medium text-warm-700">
                        {score > 0 ? `${Math.round(score)}` : '—'}
                      </span>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
