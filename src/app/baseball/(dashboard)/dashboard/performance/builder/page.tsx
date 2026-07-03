// =============================================================================
// src/app/baseball/(dashboard)/dashboard/performance/builder/page.tsx
//
// Wave 4 — Lift Builder page (advanced lift planning).
//
// SERVER-GATED:
//   * Active baseball context required (never trusts a cookie alone).
//   * STAFF role required; players are redirected to their Today view.
//   * can_manage_lifting required; others are redirected to /performance.
//
// Fetches three read-model feeds in parallel:
//   1. getBuilderExerciseLibrary(teamId) — exercise catalogue with stress columns
//   2. getGroupSorenessFlags(scope, date) — 7-day group soreness aggregates
//   3. getGroupAvailability(scope, weekOf) — per-player weekly schedule
//
// All reads use the request-scoped anon client (RLS applies). The capability
// check here is defense-in-depth; server actions re-check on every write.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import {
  getBuilderExerciseLibrary,
  getGroupSorenessFlags,
  getGroupAvailability,
} from '@/lib/baseball/read-models/lift-builder';
import { LiftBuilderClient } from '@/components/baseball/performance/LiftBuilderClient';

// =============================================================================
// Helpers
// =============================================================================

/** ISO YYYY-MM-DD for today (UTC). */
function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/** ISO YYYY-MM-DD for the Monday of the week containing `ymd` (UTC). */
function mondayOf(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun
  const daysBack = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

// =============================================================================
// Page
// =============================================================================

export default async function LiftBuilderPage() {
  // ── Auth + role gate ────────────────────────────────────────────────────────
  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/login');
  if (context.activeRole !== 'coach') redirect('/baseball/player/today');

  const teamId = context.activeTeamId;

  // ── Capability gate ─────────────────────────────────────────────────────────
  const caps = await resolveBaseballCapabilities(teamId);
  if (!caps.can_manage_lifting) redirect('/baseball/dashboard/performance');

  // ── Date anchors ────────────────────────────────────────────────────────────
  const today = todayYmd();
  const weekOf = mondayOf(today);

  // ── Team-scoped builder scope ────────────────────────────────────────────────
  const scope = { teamId } as const;

  // ── Parallel read-model fetches ──────────────────────────────────────────────
  const [library, sorenessFlags, availability] = await Promise.all([
    getBuilderExerciseLibrary(teamId),
    getGroupSorenessFlags(scope, today),
    getGroupAvailability(scope, weekOf),
  ]);

  // ── Light group list (for breadcrumb links / scope switcher hints) ───────────
  const supabase = await createClient();
  const { data: groupRows } = await fromUntyped(supabase, 'helm_lifting_groups')
    .select('id, name')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .order('name', { ascending: true }) as {
    data: Array<{ id: string; name: string }> | null;
  };
  const groups = groupRows ?? [];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <LiftBuilderClient
        teamId={teamId}
        library={library}
        groupSoreness={sorenessFlags}
        availability={availability}
        groups={groups}
        weekOf={weekOf}
      />
    </div>
  );
}
