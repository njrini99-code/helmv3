import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { PlayerProfileClient } from './PlayerProfileClient';
import { resolvePublicProfileAccess } from '@/lib/baseball/public-profile-access';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const access = await resolvePublicProfileAccess(id, user?.id ?? null);

  if (!access.allowed || !access.displayName) {
    return {
      title: 'Player Profile | Helm',
    };
  }

  const { data: player } = await supabase
    .from('baseball_players')
    .select('primary_position, grad_year')
    .eq('id', id)
    .single();

  if (!player) {
    return {
      title: 'Player Not Found | Helm',
    };
  }

  return {
    title: `${access.displayName} - ${player.primary_position} | Helm`,
    description: `View ${access.displayName}'s baseball recruiting profile. Class of ${player.grad_year}.`,
  };
}

export default async function PublicPlayerProfilePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const access = await resolvePublicProfileAccess(id, user?.id ?? null);

  if (!access.allowed) {
    notFound();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: player, error } = await (supabase as any)
    .from('baseball_players')
    .select(`
      *,
      baseball_videos (
        id,
        title,
        thumbnail_url,
        url,
        duration,
        is_primary,
        video_type,
        created_at,
        is_clip,
        clip_start_time,
        clip_end_time
      ),
      player_achievements (
        id,
        achievement_text,
        achievement_type,
        achievement_date
      ),
      baseball_team_members (
        id,
        joined_at,
        position,
        jersey_number,
        status,
        team:baseball_teams (
          id,
          name,
          team_type,
          organization:organizations (
            id,
            name,
            type,
            logo_url,
            location_city,
            location_state
          )
        )
      ),
      high_school_org:organizations!players_high_school_org_id_fkey (
        id,
        name,
        logo_url,
        location_city,
        location_state
      ),
      committed_to_org:organizations!players_committed_to_org_id_fkey (
        id,
        name,
        division,
        conference,
        logo_url
      )
    `)
    .eq('id', id)
    .single() as { data: ({ id: string; baseball_videos: unknown[]; baseball_team_members: unknown[] } & Record<string, unknown>) | null; error: { message: string } | null };

  // Fetch player settings separately (may not have relationship)
  const { data: playerSettings } = await supabase
    .from('baseball_player_settings')
    .select('*')
    .eq('player_id', id)
    .maybeSingle();

  // Fetch recruiting interests separately
  const { data: recruitingInterests } = await supabase
    .from('baseball_recruiting_interests')
    .select(`
      id,
      interest_level,
      school_name,
      organization:organizations (
        id,
        name,
        division,
        logo_url
      )
    `)
    .eq('player_id', id);

  if (error || !player) {
    notFound();
  }

  // Check if current user is a coach viewing
  let isCoachViewing = false;
  let coachId: string | null = null;

  if (user) {
    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (coach) {
      isCoachViewing = true;
      coachId = coach.id;

      // Log profile view engagement
      await supabase
        .from('baseball_player_engagement_events')
        .insert({
          player_id: player.id,
          coach_id: coach.id,
          engagement_type: 'profile_view',
          metadata: { source: 'public_profile' },
        });
    }
  }

  // Check watchlist status if coach
  let isInWatchlist = false;
  if (coachId) {
    const { data: watchlistEntry } = await supabase
      .from('baseball_watchlists')
      .select('id')
      .eq('coach_id', coachId)
      .eq('player_id', player.id)
      .maybeSingle();

    isInWatchlist = !!watchlistEntry;
  }

  // Get engagement stats for the player
  const { count: profileViewCount } = await supabase
    .from('baseball_player_engagement_events')
    .select('*', { count: 'exact', head: true })
    .eq('player_id', player.id)
    .eq('engagement_type', 'profile_view');

  const { count: watchlistCount } = await supabase
    .from('baseball_watchlists')
    .select('*', { count: 'exact', head: true })
    .eq('player_id', player.id);

  // Combine player data with separately fetched data
  // Map Supabase relation keys to the interface keys expected by PlayerProfileClient
  const playerData = {
    ...player,
    videos: player.baseball_videos ?? [],
    team_members: player.baseball_team_members ?? [],
    player_settings: playerSettings,
    recruiting_interests: recruitingInterests || [],
  } as unknown as Parameters<typeof PlayerProfileClient>[0]['player'];

  return (
    <PlayerProfileClient
      player={playerData}
      isCoachViewing={isCoachViewing}
      // conn-baseball-player Finding 4: access.reason === 'self' is the ONLY
      // signal that this viewer is the profile's own player (the self-bypass
      // in resolvePublicProfileAccess skips every visibility check for them).
      // Thread it through so the client can honestly disclose when what
      // they're seeing would be invisible to anyone else.
      isSelfViewing={access.reason === 'self'}
      initialIsInWatchlist={isInWatchlist}
      profileViewCount={profileViewCount || 0}
      watchlistCount={watchlistCount || 0}
    />
  );
}
