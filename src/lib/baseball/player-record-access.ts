// =============================================================================
// src/lib/baseball/player-record-access.ts
//
// Packet: qa-screens (HS & Showcase coaches dead-end remediation)
//
// SINGLE canonical viewer-eligibility gate for the player operating record and
// its sibling routes (players/[id], players/[id]/stats, players/[id]/profile).
//
// PROBLEM THIS SOLVES
//   The profile route hard-redirected every coach_type except 'college'/'juco'
//   to the dashboard, while its sibling /stats route applied NO coach_type gate
//   (it only checked coach + organization_id + team membership). So an HS or
//   Showcase coach — who, per CLAUDE.md, DOES manage players — was bounced off
//   the canonical profile but could still reach the player's full season stats.
//   The Roster surface is shown to EVERY coach type and links straight to the
//   profile, so the primary player drill-in was a DEAD END for two of the four
//   coach types, and the two sibling routes DISAGREED on who may view a player.
//
// THE POLICY (one rule, applied identically by both routes)
//   A coach may view a player's record iff:
//     1. they are authenticated and have a baseball_coaches profile,
//     2. that coach is bound to an organization, and
//     3. the player is a member of THIS coach's organization's team.
//   Coach_type is NOT a gate — all four coach types (college, juco, high_school,
//   showcase) manage players. Per-SECTION depth is scoped downstream by the
//   STAFF-scoped, fault-tolerant read models (passport / snapshot cards / stat
//   visuals / notes / timeline), which already return honest authorized:false
//   states for viewers who lack a given capability. No content leaks: the gate
//   decides WHO MAY OPEN THE RECORD; the read models decide WHAT THEY SEE.
//
// This module is PURE READ + additive. It introduces no table and no write. RLS
// still backstops every underlying read; this layer encodes the shared route
// policy so the sibling routes can never drift apart again.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';

export interface PlayerRecordTeam {
  id: string;
  name: string;
}

export interface PlayerRecordCoach {
  id: string;
  /** Retained for downstream content-scoping (NOT used as an access gate). */
  coach_type: string | null;
  organization_id: string | null;
}

export interface PlayerRecordMembership {
  player_id: string;
  jersey_number: number | null;
  position: string | null;
  status: string | null;
  joined_at: string | null;
}

/**
 * The outcome of the shared eligibility check. On success, `authorized` is true
 * and the resolved coach / team / membership are returned so the calling route
 * does not re-query them. On failure, `authorized` is false and `redirectTo` is
 * the path the route should redirect to (mirrors the prior per-route redirects),
 * or `notFound` is true when the player is not on this coach's team.
 */
export type PlayerRecordAccess =
  | {
      authorized: true;
      coach: PlayerRecordCoach;
      team: PlayerRecordTeam;
      membership: PlayerRecordMembership;
    }
  | {
      authorized: false;
      redirectTo?: string;
      notFound?: boolean;
    };

/**
 * Resolve whether the current authenticated coach may view `playerId`'s operating
 * record, returning the shared coach/team/membership context on success. Both the
 * profile route and the /stats route call THIS so their access rule is identical
 * by construction. Never throws — degrades to an unauthorized envelope with the
 * appropriate redirect/notFound signal.
 */
export async function resolvePlayerRecordAccess(
  playerId: string,
): Promise<PlayerRecordAccess> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { authorized: false, redirectTo: '/baseball/login' };
  }

  const { data: coach, error: coachError } = await supabase
    .from('baseball_coaches')
    .select('id, coach_type, organization_id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { authorized: false, redirectTo: '/baseball/coach' };
  }

  if (!coach.organization_id) {
    return { authorized: false, redirectTo: '/baseball/dashboard/program' };
  }

  const { data: team } = (await supabase
    .from('baseball_teams')
    .select('id, name')
    .eq('organization_id', coach.organization_id)
    .single()) as { data: PlayerRecordTeam | null };

  if (!team) {
    return { authorized: false, redirectTo: '/baseball/dashboard/program' };
  }

  const { data: membership } = await supabase
    .from('baseball_team_members')
    .select('player_id, jersey_number, position, status, joined_at')
    .eq('team_id', team.id)
    .eq('player_id', playerId)
    .single();

  if (!membership) {
    return { authorized: false, notFound: true };
  }

  return {
    authorized: true,
    coach: {
      id: coach.id,
      coach_type: coach.coach_type ?? null,
      organization_id: coach.organization_id,
    },
    team,
    membership: {
      player_id: membership.player_id,
      jersey_number: membership.jersey_number ?? null,
      position: membership.position ?? null,
      status: membership.status ?? null,
      joined_at: membership.joined_at ?? null,
    },
  };
}
