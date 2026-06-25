// =============================================================================
// src/app/lifting/(dashboard)/dashboard/command/page.tsx
//
// Helm Lifting Lab — "Lifting Command" homepage (spec §11).
//
// Shows today's lift / soreness / weight compliance summary, alerts,
// high-priority soreness list, and links to schedule builders + nutrition
// uploader. Served within the existing LabShell (via the (dashboard) layout).
//
// Data is fetched server-side; the heavy interactive components (soreness list,
// nutrition table) receive their data as props and handle client-side state
// internally.
// =============================================================================

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveLiftingAccess } from '@/lib/lifting/access';
import { getCoachSorenessDashboard } from '@/app/lifting/actions/soreness';
import { getCoachWeightDashboard } from '@/app/lifting/actions/weight-checkins';
import { getCoachNutritionPlans } from '@/app/lifting/actions/nutrition';
import { HighPrioritySorenessList } from '@/components/lifting/soreness/HighPrioritySorenessList';
import { NutritionPlanAssignmentsTable } from '@/components/lifting/nutrition/NutritionPlanAssignmentsTable';
import { Card } from '@/components/ui/card';
import {
  Activity,
  ClipboardList,
  Dumbbell,
  Scale,
  AlertTriangle,
  ArrowRight,
  Utensils,
} from 'lucide-react';
import type { HelmLiftingCoachRow } from '@/lib/types/helm-lifting';

export const metadata = {
  title: 'Lifting Command · Helm Lifting Lab',
};

// ---------------------------------------------------------------------------
// Compact stat tile
// ---------------------------------------------------------------------------

function StatTile({
  label,
  value,
  sub,
  colorClass = 'bg-primary-50 text-primary-600',
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  colorClass?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card variant="raised" noPadding className="p-4">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colorClass}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums text-warm-900 leading-none">{value}</p>
          <p className="mt-0.5 text-sm font-medium text-warm-700">{label}</p>
          {sub && <p className="text-xs text-warm-400">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Alert item
// ---------------------------------------------------------------------------

function AlertItem({ message, tone = 'amber' }: { message: string; tone?: 'amber' | 'red' }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${
        tone === 'red'
          ? 'bg-red-50 text-red-700 border border-red-200'
          : 'bg-amber-50 text-amber-700 border border-amber-200'
      }`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick-link card
// ---------------------------------------------------------------------------

function QuickLink({
  href,
  icon: Icon,
  label,
  sub,
  colorClass = 'bg-primary-50 text-primary-600',
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub: string;
  colorClass?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-white/20 glass-standard px-4 py-4 transition-all hover:bg-cream-50 hover:shadow-sm"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colorClass}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-warm-900 transition-colors group-hover:text-primary-700">
          {label}
        </p>
        <p className="truncate text-xs text-warm-500">{sub}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-warm-300 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function LiftingCommandPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/lifting/login');

  // Resolve org from coach row
  const { data: coachRow } = await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle() as { data: HelmLiftingCoachRow | null };

  let orgId: string | null = coachRow?.organization_id ?? null;
  if (!orgId) {
    const { data: viewerRow } = await fromUntyped(supabase, 'helm_lifting_org_viewers')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle() as { data: { organization_id: string } | null };
    orgId = viewerRow?.organization_id ?? null;
  }
  if (!orgId) redirect('/lifting/login');

  const access = await resolveLiftingAccess(orgId);
  const today = new Date().toISOString().slice(0, 10);

  // Fetch soreness + weight + nutrition dashboards in parallel.
  // Each fetch is wrapped in catch so a single failure doesn't crash the page.
  const [sorenessDash, weightDash, nutritionPlans] = await Promise.all([
    getCoachSorenessDashboard({ orgId, date: today }).catch(() => null),
    getCoachWeightDashboard({ orgId, date: today }).catch(() => null),
    getCoachNutritionPlans({ orgId }).catch(() => null),
  ]);

  // Today's lift sessions count (from helm_lifting_sessions)
  const { data: sessionRows } = await fromUntyped(supabase, 'helm_lifting_sessions')
    .select('id, status')
    .eq('organization_id', orgId)
    .eq('scheduled_date', today)
    .limit(500) as { data: Array<{ id: string; status: string }> | null };

  const sessions = sessionRows ?? [];
  const liftCompleted = sessions.filter((s) => s.status === 'completed').length;
  const liftInProgress = sessions.filter((s) => s.status === 'in_progress').length;
  const liftNotStarted = sessions.filter((s) => s.status === 'assigned').length;

  // Build alert strings
  const alerts: Array<{ message: string; tone: 'amber' | 'red' }> = [];

  if (sorenessDash && sorenessDash.highPriority.length > 0) {
    alerts.push({
      message: `${sorenessDash.highPriority.length} athlete${sorenessDash.highPriority.length !== 1 ? 's' : ''} flagged for coach review`,
      tone: 'amber',
    });
  }
  if (sorenessDash && sorenessDash.compliance.missed > 0) {
    alerts.push({
      message: `${sorenessDash.compliance.missed} missed soreness check-in${sorenessDash.compliance.missed !== 1 ? 's' : ''} today`,
      tone: 'amber',
    });
  }
  if (weightDash && weightDash.totals.missed > 0) {
    alerts.push({
      message: `${weightDash.totals.missed} missed weight check-in${weightDash.totals.missed !== 1 ? 's' : ''} today`,
      tone: 'amber',
    });
  }
  if (nutritionPlans) {
    const unacknowledged = nutritionPlans.reduce(
      (n, row) => n + (row.assignmentCount - row.acknowledgedCount),
      0,
    );
    if (unacknowledged > 0) {
      alerts.push({
        message: `${unacknowledged} athlete${unacknowledged !== 1 ? 's' : ''} haven't acknowledged their nutrition plan`,
        tone: 'amber',
      });
    }
  }

  const displayName = coachRow?.full_name ?? 'Coach';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-warm-900 sm:text-3xl">
          {greeting}, {displayName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
          {' · '}Lifting Command
        </p>
      </div>

      {/* Today overview — Lifts / Soreness / Weight */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-warm-900">Today</h2>

        {/* Lifts */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-warm-400">Lifts</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              icon={Dumbbell}
              label="Due"
              value={sessions.length}
              colorClass="bg-primary-50 text-primary-600"
            />
            <StatTile
              icon={Dumbbell}
              label="Completed"
              value={liftCompleted}
              colorClass="bg-primary-50 text-primary-600"
            />
            <StatTile
              icon={Dumbbell}
              label="In Progress"
              value={liftInProgress}
              colorClass="bg-amber-50 text-amber-600"
            />
            <StatTile
              icon={Dumbbell}
              label="Not Started"
              value={liftNotStarted}
              colorClass="bg-warm-100 text-warm-600"
            />
          </div>
        </div>

        {/* Soreness */}
        {sorenessDash && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-warm-400">Soreness Checks</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile icon={Activity} label="Due" value={sorenessDash.compliance.total} colorClass="bg-primary-50 text-primary-600" />
              <StatTile icon={Activity} label="Ready to Go" value={sorenessDash.compliance.readyToGo} colorClass="bg-primary-50 text-primary-600" />
              <StatTile icon={Activity} label="Reported Soreness" value={sorenessDash.compliance.reportedSoreness} colorClass="bg-amber-50 text-amber-600" />
              <StatTile icon={Activity} label="Missed" value={sorenessDash.compliance.missed} colorClass="bg-red-50 text-red-600" />
            </div>
          </div>
        )}

        {/* Weight */}
        {weightDash && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-warm-400">Weight Check-Ins</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile icon={Scale} label="Due" value={weightDash.totals.completed + weightDash.totals.pending + weightDash.totals.missed} colorClass="bg-primary-50 text-primary-600" />
              <StatTile icon={Scale} label="Completed" value={weightDash.totals.completed} colorClass="bg-primary-50 text-primary-600" />
              <StatTile icon={Scale} label="Pending" value={weightDash.totals.pending} colorClass="bg-amber-50 text-amber-600" />
              <StatTile icon={Scale} label="Missed" value={weightDash.totals.missed} colorClass="bg-red-50 text-red-600" />
            </div>
          </div>
        )}
      </section>

      {/* Alerts */}
      {alerts.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-warm-900">Alerts</h2>
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <AlertItem key={i} message={a.message} tone={a.tone} />
            ))}
          </div>
        </section>
      )}

      {/* High Priority Soreness */}
      {sorenessDash && sorenessDash.highPriority.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-warm-900">
            Needs Review
          </h2>
          <HighPrioritySorenessList athletes={sorenessDash.highPriority} />
        </section>
      )}

      {/* Nutrition Plans */}
      {nutritionPlans && nutritionPlans.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-warm-900">
              Nutrition Plans
            </h2>
            {access.isCoach && (
              <Link
                href="/lifting/dashboard/check-ins"
                className="text-xs font-medium text-primary-600 hover:text-primary-700"
              >
                Upload plan →
              </Link>
            )}
          </div>
          <NutritionPlanAssignmentsTable rows={nutritionPlans} orgId={orgId} />
        </section>
      )}

      {/* Quick links */}
      {access.isCoach && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-warm-900">
            Schedule Builders
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <QuickLink
              href="/lifting/dashboard/check-ins"
              icon={Activity}
              label="Soreness Check Schedules"
              sub="Schedule daily / weekly soreness checks"
              colorClass="bg-amber-50 text-amber-600"
            />
            <QuickLink
              href="/lifting/dashboard/check-ins"
              icon={Scale}
              label="Weight Check-In Schedules"
              sub="Schedule morning weigh-ins"
              colorClass="bg-blue-50 text-blue-600"
            />
            <QuickLink
              href="/lifting/dashboard/check-ins"
              icon={Utensils}
              label="Upload Nutrition Plan"
              sub="Share plans with team or individual athletes"
              colorClass="bg-primary-50 text-primary-600"
            />
            <QuickLink
              href="/lifting/dashboard/readiness"
              icon={ClipboardList}
              label="Readiness Board"
              sub="Full compliance board for today"
              colorClass="bg-warm-100 text-warm-600"
            />
          </div>
        </section>
      )}
    </div>
  );
}
