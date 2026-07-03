// =============================================================================
// src/app/baseball/(dashboard)/dashboard/performance/live/page.tsx
//
// V11 Live Weight Room mode (spec L27, L522-573 + Packet G). The flagship premium
// staff surface: a strength coach runs a room of 20-60 athletes from ONE screen.
//
// SERVER-GATED (defense in depth, never nav-hiding alone):
//   * Resolves the server-validated active baseball context (cookie re-validated).
//   * STAFF only — players are redirected to their own lift surface.
//   * Requires can_manage_lifting (this surface WRITES sets/loads/subs for the
//     athletes; readiness is shown additively when can_view_readiness is held).
//
// The whole payload is materialized server-side by getLiveWeightRoomData; the
// client polls a server action to refresh it (realtime-or-polling per spec L572).
// =============================================================================

import { redirect } from 'next/navigation';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import { getLiveWeightRoomData } from '@/lib/baseball/read-models/live-weight-room';
import { LiveWeightRoom } from '@/components/baseball/performance/LiveWeightRoom';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveBaseballLiftingOrg } from '@/lib/lifting/resolve-baseball-context';
import { getFullName } from '@/lib/utils';

interface PageProps {
  searchParams: Promise<{ group?: string }>;
}

export default async function LiveWeightRoomPage({ searchParams }: PageProps) {
  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/login');
  if (context.activeRole !== 'coach') redirect('/baseball/player/today');

  const teamId = context.activeTeamId;
  const caps = await resolveBaseballCapabilities(teamId);
  if (!caps.can_manage_lifting) {
    // Readiness-only viewers don't get the WRITE surface — send them to the
    // read-only command center where they can still review the board + queue.
    redirect('/baseball/dashboard/performance');
  }
  const canViewReadiness = caps.can_view_readiness;

  const { group } = await searchParams;
  const groupFilter = group && group.length > 0 ? group : null;

  const data = await getLiveWeightRoomData(teamId, canViewReadiness, groupFilter);

  // A roster→name map so the right-rail queues (player ids) render real names,
  // and the exercise library for the substitute picker.
  const supabase = await createClient();
  const { data: members } = await supabase
    .from('baseball_team_members')
    .select('player_id, baseball_players!inner ( id, first_name, last_name )')
    .eq('team_id', teamId);
  const playerNameById: Record<string, string> = {};
  for (const m of members ?? []) {
    const p = (m as { baseball_players?: { id: string; first_name: string | null; last_name: string | null } })
      .baseball_players;
    if (p?.id) playerNameById[p.id] = getFullName(p.first_name, p.last_name);
  }

  // Exercise library (org + global) for the substitute action.
  const liftCtx = await resolveBaseballLiftingOrg(teamId);
  let exerciseLibrary: Array<{ id: string; name: string; category: string | null }> = [];
  if (liftCtx) {
    const { data: exRows } = await fromUntyped(supabase, 'helm_lifting_exercises')
      .select('id, name, category')
      .eq('sport', 'baseball')
      .eq('is_active', true)
      .or(`organization_id.eq.${liftCtx.organizationId},is_global.eq.true`)
      .order('name', { ascending: true }) as {
      data: Array<{ id: string; name: string; category: string | null }> | null;
    };
    exerciseLibrary = (exRows ?? []).map((e) => ({ id: e.id, name: e.name, category: e.category ?? null }));
  }

  return (
    <LiveWeightRoom
      initialData={data}
      canViewReadiness={canViewReadiness}
      playerNameById={playerNameById}
      exerciseLibrary={exerciseLibrary}
      groupFilter={groupFilter}
    />
  );
}
