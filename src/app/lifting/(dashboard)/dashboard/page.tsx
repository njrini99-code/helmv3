import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveLiftingAccess } from '@/lib/lifting/access';
import { SportTabBar } from '@/components/lifting/shell/SportTabBar';
import { Card } from '@/components/ui/card';
import { SectionMasthead, RuledStatLine } from '@/components/baseball/living-annual';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import {
  Activity,
  ClipboardList,
  Dumbbell,
  Users,
} from 'lucide-react';
import type { HelmLiftingCoachRow, HelmLiftingCoachAssignmentRow, HelmLiftingSport } from '@/lib/types/helm-lifting';

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

interface OrgStats {
  totalAthletes: number;
  todaySessions: number;
  avgReadiness: number | null;
  activePrograms: number;
  teams: TeamSummary[];
}

interface TeamSummary {
  sport: HelmLiftingSport;
  teamId: string | null;
  teamName: string;
  athleteCount: number;
}

async function fetchOrgStats(
  orgId: string,
  sportFilter: HelmLiftingSport | null
): Promise<OrgStats> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // Fetch athletes — select minimal columns, count in-JS
  let athleteQ = fromUntyped(supabase, 'helm_lifting_athletes')
    .select('id')
    .eq('organization_id', orgId)
    .eq('is_active', true);
  if (sportFilter) athleteQ = athleteQ.eq('sport', sportFilter);
  const { data: athleteRows } = await (athleteQ as unknown as { data: Array<{ id: string }> | null });
  const totalAthletes = athleteRows?.length ?? 0;

  // Today's sessions
  let sessionQ = fromUntyped(supabase, 'helm_lifting_sessions')
    .select('id')
    .eq('organization_id', orgId)
    .gte('scheduled_date', today)
    .lte('scheduled_date', today);
  if (sportFilter) sessionQ = sessionQ.eq('sport', sportFilter);
  const { data: sessionRows } = await (sessionQ as unknown as { data: Array<{ id: string }> | null });
  const todaySessions = sessionRows?.length ?? 0;

  // Average readiness (last 24h)
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  let readinessQ = fromUntyped(supabase, 'helm_lifting_readiness_checkins')
    .select('readiness_score')
    .gte('created_at', yesterday);
  if (sportFilter) readinessQ = readinessQ.eq('sport', sportFilter);
  const { data: readinessRows } = await (readinessQ as unknown as { data: Array<{ readiness_score: number }> | null });
  const avgReadiness =
    readinessRows && readinessRows.length > 0
      ? readinessRows.reduce((s, r) => s + r.readiness_score, 0) / readinessRows.length
      : null;

  // Active programs
  const { data: programRows } = await (
    fromUntyped(supabase, 'helm_lifting_programs')
      .select('id')
      .eq('organization_id', orgId)
      .eq('status', 'active') as unknown as { data: Array<{ id: string }> | null }
  );
  const activePrograms = programRows?.length ?? 0;

  return {
    totalAthletes,
    todaySessions,
    avgReadiness: avgReadiness !== null ? Math.round(avgReadiness * 10) / 10 : null,
    activePrograms,
    teams: [],
  };
}

// ---------------------------------------------------------------------------
// Assignment card
// ---------------------------------------------------------------------------

function AssignmentCard({ assignment }: { assignment: HelmLiftingCoachAssignmentRow }) {
  const sportEmoji = assignment.sport === 'baseball' ? '⚾' : '⛳';
  return (
    <div className="flex items-center gap-3 px-4 py-3 glass-standard rounded-xl hover:bg-cream-100 transition-all">
      <span className="text-lg" aria-hidden="true">{sportEmoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-warm-900 truncate">
          {assignment.team_name_snapshot ?? 'Team'}
        </p>
        <p className="text-xs text-warm-500 capitalize">{assignment.sport}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LiftingDashboardPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/lifting/login');
  }

  // Get the coach row (or viewer row for head coaches)
  const { data: coachRow } = await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle() as { data: HelmLiftingCoachRow | null };

  // Determine org
  let orgId: string | null = coachRow?.organization_id ?? null;

  if (!orgId) {
    // Viewer path — get org from viewer row
    const { data: viewerRow } = await fromUntyped(supabase, 'helm_lifting_org_viewers')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle() as { data: { organization_id: string } | null };
    orgId = viewerRow?.organization_id ?? null;
  }

  if (!orgId) {
    redirect('/lifting/login');
  }

  // Resolve access (for role-appropriate CTA gating)
  const access = await resolveLiftingAccess(orgId);

  // Parse sport filter from search params
  const resolvedParams = await searchParams;
  const sportParam = typeof resolvedParams.sport === 'string' ? resolvedParams.sport : null;
  const sportFilter: HelmLiftingSport | null =
    sportParam === 'baseball' || sportParam === 'golf' ? sportParam : null;

  // Fetch org stats
  const stats = await fetchOrgStats(orgId, sportFilter);

  const displayName = coachRow?.full_name ?? 'Coach';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateline = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Masthead — eyebrow dateline + green accent rule, not a SaaS greeting */}
      <SectionMasthead
        eyebrow={`${greeting}, ${displayName.split(' ')[0]} · ${dateline}`}
        title="Lift Lab"
        ink="team"
        actions={
          access.isCoach ? (
            <Link
              href="/lifting/dashboard/sessions"
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-all shadow-sm shadow-primary-600/20"
            >
              <Dumbbell className="w-4 h-4" />
              Start session
            </Link>
          ) : null
        }
      />

      {/* Sport filter tabs */}
      <SportTabBar activeSport={sportFilter} baseHref="/lifting/dashboard" />

      {/* KPI strip — graphite numerals on a green rule, flat hairline card (no rainbow icon chips) */}
      <Card variant="flat" noPadding className="p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
          <Link href="/lifting/dashboard/athletes" className="block">
            <RuledStatLine label="Athletes" value={stats.totalAthletes} ink="team" />
            <p className="mt-1.5 text-xs text-text-tertiary">
              {sportFilter ? `${sportFilter} only` : 'across all sports'}
            </p>
          </Link>
          <Link href="/lifting/dashboard/sessions" className="block">
            <RuledStatLine label="Sessions today" value={stats.todaySessions} ink="team" />
          </Link>
          <Link href="/lifting/dashboard/readiness" className="block">
            <RuledStatLine
              label="Avg readiness"
              value={stats.avgReadiness ?? 0}
              unit={stats.avgReadiness !== null ? '/10' : undefined}
              ghost={stats.avgReadiness === null}
              decimals={1}
              ink="team"
            />
            <p className="mt-1.5 text-xs text-text-tertiary">last 24 hours</p>
          </Link>
          <Link href="/lifting/dashboard/programs" className="block">
            <RuledStatLine
              label="Active programs"
              value={stats.activePrograms}
              ghost={stats.activePrograms === 0}
              ink="team"
            />
          </Link>
        </div>
      </Card>

      {/* Two-column body */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Team assignments (coach) or access info (viewer) */}
        <div className="lg:col-span-1 space-y-4">
          <Card variant="flat" noPadding className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-warm-900 uppercase tracking-wide">
                {access.isCoach ? 'Covered teams' : 'Your access'}
              </h2>
              {access.isCoach && (
                <Link
                  href="/lifting/dashboard/settings"
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                >
                  Manage
                </Link>
              )}
            </div>

            {access.isCoach && access.assignments.length > 0 ? (
              <div className="space-y-2">
                {access.assignments.map((a) => (
                  <AssignmentCard key={a.id} assignment={a} />
                ))}
              </div>
            ) : access.isCoach ? (
              <EmptyState
                variant="subtle"
                icon={<ClipboardList />}
                title="No teams assigned yet."
                action={
                  <Link
                    href="/lifting/dashboard/settings"
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Add teams in settings →
                  </Link>
                }
              />
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-warm-600">
                  You have view-only access to this lifting program.
                  To enable editing, invite a dedicated strength coach.
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* Quick links / actions */}
        <div className="lg:col-span-2">
          <Card variant="flat" noPadding className="p-5">
            <h2 className="text-sm font-bold text-warm-900 uppercase tracking-wide mb-4">Quick actions</h2>

            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { href: '/lifting/dashboard/programs', icon: ClipboardList, label: 'View programs', sub: 'Browse & manage workout programs', colorClass: 'bg-purple-50 text-purple-600' },
                { href: '/lifting/dashboard/athletes', icon: Users, label: 'View athletes', sub: 'Roster across all covered sports', colorClass: 'bg-blue-50 text-blue-600' },
                { href: '/lifting/dashboard/readiness', icon: Activity, label: 'Readiness board', sub: 'Today\'s readiness check-ins', colorClass: 'bg-amber-50 text-amber-600' },
                { href: '/lifting/dashboard/sessions', icon: Dumbbell, label: 'Sessions', sub: 'Scheduled & past sessions', colorClass: 'bg-primary-50 text-primary-600' },
              ].map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="flex items-center gap-3 px-4 py-4 glass-standard rounded-xl hover:bg-cream-100 hover:shadow-sm transition-all group"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${action.colorClass}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-warm-900 group-hover:text-primary-700 transition-colors">{action.label}</p>
                      <p className="text-xs text-warm-500 truncate">{action.sub}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
