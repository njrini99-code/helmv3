'use client';

import { useState, useEffect } from 'react';
import { PageLoading } from '@/components/ui/loading';
import { useAuth } from '@/hooks/use-auth';
import { useTeamStore } from '@/stores/team-store';
import { createClient } from '@/lib/supabase/client';
import { TravelClient } from '@/components/baseball/travel';
import { ReadModelStateNotice } from '@/components/baseball/ReadModelStateNotice';
import {
  getTeamItineraries,
  type BaseballTravelItinerary,
} from '@/app/baseball/actions/travel';

export default function BaseballTravelPage() {
  const { user, loading: authLoading } = useAuth();
  const { selectedTeamId } = useTeamStore();

  const [itineraries, setItineraries] = useState<BaseballTravelItinerary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    setLoadError(null);

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
        } else {
          setItineraries([]);
          setLoadError(result.error ?? 'Travel itineraries could not be loaded.');
        }
      }
    } catch {
      setItineraries([]);
      setLoadError('Travel itineraries could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  // NOTE: the page-level global <Header> was removed here — the dashboard shell
  // now owns the single top bar (search / notifications / user menu / breadcrumb),
  // and TravelClient renders its own page title + primary action. Rendering the
  // legacy Header here produced the duplicate top-bar chrome and a redundant
  // "Travel" heading stacked above TravelClient's own. The lightweight page
  // headings below keep orientation in the non-content states.
  if (authLoading || loading) {
    return <PageLoading />;
  }

  if (!teamId) {
    return (
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <h1 className="text-2xl font-bold tracking-tight text-warm-900">Travel</h1>
        <div className="mt-8 rounded-2xl border border-white/20 bg-white/70 p-10 text-center backdrop-blur-xl">
          <h2 className="mb-2 text-lg font-semibold text-warm-900">No team found</h2>
          <p className="text-warm-500">You must be on a team to access travel itineraries.</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-warm-900">Travel</h1>
        <ReadModelStateNotice
          state="error"
          title="Travel unavailable"
          onRetry={() => void detectRoleAndLoad()}
        />
      </div>
    );
  }

  return (
    <TravelClient
      itineraries={itineraries}
      teamId={teamId}
      isCoach={isCoach}
    />
  );
}
