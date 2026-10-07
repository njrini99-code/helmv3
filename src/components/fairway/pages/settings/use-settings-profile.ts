'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useGolfUser } from '@/contexts/golf-user-context';
import { logError } from '@/lib/error-logging';

export interface PlayerData {
  first_name: string | null;
  last_name: string | null;
  handicap: number | null;
  handicap_index: number | null;
  graduation_year: number | null;
  hometown: string | null;
  state: string | null;
  phone: string | null;
}

export interface SettingsProfile {
  userId: string;
  coachId?: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: 'coach' | 'player';
  teamName?: string;
  teamId?: string;
  organizationId?: string;
  playerId?: string;
  playerData?: PlayerData;
  currentTeam?: {
    id: string;
    name: string;
    organization?: { name: string } | null;
  } | null;
}

/**
 * The signed-in user's settings profile (coach: from the golf user context;
 * player: golf_players + golf_teams). Shared by the settings routes so each
 * screen loads it once, the same way.
 */
export function useSettingsProfile() {
  const golfUser = useGolfUser();
  const [profile, setProfile] = useState<SettingsProfile | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadProfile = useCallback(async () => {
    // B16: a failed fetch must NOT leave the page stuck on an infinite skeleton.
    // Reset the error flag, then surface a retryable error card on throw.
    setLoadError(false);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || '';

      if (golfUser.role === 'coach') {
        setProfile({
          userId: golfUser.userId,
          coachId: golfUser.coachId,
          name: golfUser.name,
          email,
          avatarUrl: golfUser.avatarUrl || null,
          role: 'coach',
          teamName: golfUser.teamName,
          teamId: golfUser.teamId,
          organizationId: golfUser.organizationId,
        });
        return;
      }

      if (golfUser.playerId) {
        const [playerResult, teamResult] = await Promise.all([
          supabase
            .from('golf_players')
            .select('first_name, last_name, avatar_url, handicap, handicap_index, graduation_year, hometown, state, phone')
            .eq('id', golfUser.playerId)
            .maybeSingle(),
          golfUser.teamId
            ? supabase
                .from('golf_teams')
                .select('id, name, organization:organizations(name)')
                .eq('id', golfUser.teamId)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        // A failed profile read yields the same null as "this player has filled
        // nothing in", and the form below is populated from it — so the player
        // sees their handicap, hometown, graduation year and phone all blank.
        // The danger is what they do next: hitting Save on a form that looks
        // empty writes those blanks back over a profile that was fine.
        //
        // Recorded rather than thrown: the settings page has more on it than
        // this card. But a silent blank form on a save surface is the one place
        // "empty" is actively dangerous rather than merely wrong.
        if (playerResult.error) {
          console.warn('[settings] player profile read failed:', playerResult.error.message);
        }
        if (teamResult && 'error' in teamResult && teamResult.error) {
          console.warn('[settings] team read failed:', teamResult.error.message);
        }

        const player = playerResult.data;
        const team = teamResult.data;

        let currentTeam: SettingsProfile['currentTeam'] = null;
        if (team) {
          const org = Array.isArray(team.organization) ? team.organization[0] : team.organization;
          currentTeam = {
            id: team.id,
            name: team.name,
            organization: org ? { name: org.name } : null,
          };
        }

        setProfile({
          userId: golfUser.userId,
          name: golfUser.name,
          email,
          avatarUrl: player?.avatar_url ?? golfUser.avatarUrl ?? null,
          role: 'player',
          teamName: golfUser.teamName,
          playerId: golfUser.playerId,
          currentTeam,
          playerData: player
            ? {
                first_name: player.first_name,
                last_name: player.last_name,
                handicap: player.handicap,
                handicap_index: player.handicap_index,
                graduation_year: player.graduation_year,
                hometown: player.hometown,
                state: player.state,
                phone: player.phone,
              }
            : undefined,
        });
      }
    } catch (err) {
      setLoadError(true);
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'FairwaySettingsGeneral', action: 'load-profile', sport: 'golf' },
        'medium'
      );
    }
  }, [golfUser]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  return { profile, loadError, loadProfile };
}
