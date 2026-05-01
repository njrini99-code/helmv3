'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { PageLoading } from '@/components/ui/loading';
import { useAuth } from '@/hooks/use-auth';
import { useTeamStore } from '@/stores/team-store';
import { createClient } from '@/lib/supabase/client';
import { TravelClient } from '@/components/baseball/travel';
import {
  getTeamItineraries,
  type BaseballTravelItinerary,
} from '@/app/baseball/actions/travel';

export default function BaseballTravelPage() {
  const { user, loading: authLoading } = useAuth();
  const { selectedTeamId } = useTeamStore();

  const [itineraries, setItineraries] = useState<BaseballTravelItinerary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCoach, setIsCoach] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!authLoading && user) {
      detectRoleAndLoad();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, selectedTeamId]);

  async function detectRoleAndLoad() {
    if (!user) return;
    setLoading(true);

    try {
      // Check if coach
      const { data: coach } = await supabase
        .from('baseball_coaches')
        .select('id, organization_id')
        .eq('user_id', user.id)
        .maybeSingle();

      let resolvedTeamId: string | null = null;
      let resolvedIsCoach = false;

      if (coach) {
        resolvedIsCoach = true;
        // Get team from selectedTeamId or coach's org
        if (selectedTeamId) {
          resolvedTeamId = selectedTeamId;
        } else if (coach.organization_id) {
          const { data: orgTeam } = await supabase
            .from('baseball_teams')
            .select('id')
            .eq('organization_id', coach.organization_id)
            .maybeSingle();
          resolvedTeamId = orgTeam?.id || null;
        }
      } else {
        // Check if player
        const { data: player } = await supabase
          .from('baseball_players')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (player) {
          const { data: teamMember } = await supabase
            .from('baseball_team_members')
            .select('team_id')
            .eq('player_id', player.id)
            .maybeSingle();
          resolvedTeamId = teamMember?.team_id || null;
        }
      }

      setIsCoach(resolvedIsCoach);
      setTeamId(resolvedTeamId);

      if (resolvedTeamId) {
        const result = await getTeamItineraries(resolvedTeamId);
        if (result.success) {
          setItineraries(result.data);
        }
      }
    } catch (err) {
      console.error('[Baseball Travel] Error loading:', err);
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || loading) {
    return (
      <>
        <Header title="Travel" subtitle="Team travel and expense tracking" />
        <PageLoading />
      </>
    );
  }

  if (!teamId) {
    return (
      <>
        <Header title="Travel" subtitle="Team travel and expense tracking" />
        <div className="p-8 text-center">
          <h2 className="text-lg font-semibold text-warm-900 mb-2">No Team Found</h2>
          <p className="text-warm-500">You must be on a team to access travel itineraries.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Travel" subtitle="Team travel and expense tracking" />
      <TravelClient
        itineraries={itineraries}
        teamId={teamId}
        isCoach={isCoach}
      />
    </>
  );
}
