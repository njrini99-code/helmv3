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
  // baseball_team_members is authenticated-only. Keeping the relationship in
  // an anonymous PostgREST select makes the entire public profile fail after
  // the table's anon grant is revoked, so only request team affiliation for a
  // signed-in viewer. Logged-out visitors still receive the public-safe player
  // profile; the existing SECURITY DEFINER access gate above decides whether
  // that profile may be shown.
  const teamMembershipSelect = user ? `,
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
      )` : '';

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
      )
      ${teamMembershipSelect},
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
  const { data: recruitingInterests, error: recruitingInterestsError } = await supabase
    .from('baseball_recruiting_interests')
    .select(`
      id,
      interest_level,
      organization:organizations (
        id,
        name,
        division,
        logo_url
      )
    `)
    .eq('player_id', id);

  if (recruitingInterestsError) {
    console.error('[player/[id]] Failed to fetch baseball_recruiting_interests:', recruitingInterestsError);
  }

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

  // ---------------------------------------------------------------------
  // REDACT BEFORE SERIALIZING — not just before rendering.
  //
  // PlayerProfileClient is a 'use client' component, so everything handed to
  // it is serialized into the RSC flight payload and shipped inside the HTML
  // of this page — which is PUBLIC and unauthenticated. Gating a field in JSX
  // keeps it out of the DOM; it does not keep it out of `curl`.
  //
  // The query above is `select('*')` plus a join that pulls every video's
  // `url`. Spreading that straight into the prop published a player's GPA,
  // SAT/ACT, email, phone and private video URLs to anyone who viewed source,
  // regardless of what their privacy settings said. The settings were being
  // honoured by the renderer and ignored by the transport.
  //
  // So the same flags the client reads are applied HERE, and the withheld
  // fields never leave the server. The client keeps its own gates: they now
  // decide layout and copy ("withheld" vs "not recorded"), which is a
  // presentation question, rather than being the only thing standing between
  // a private field and the public internet.
  //
  // `isSelfViewing` is the one bypass, and it is the same one
  // resolvePublicProfileAccess already grants: a player looking at their own
  // profile sees their own data.
  const settings = (playerSettings ?? {}) as Record<string, unknown>;
  const isSelf = access.reason === 'self';
  const allow = (key: string, defaultVisible: boolean): boolean =>
    isSelf || (settings[key] === undefined ? defaultVisible : settings[key] !== false);
  // Contact fields are opt-IN (=== true), matching the client's own reading.
  const allowOptIn = (key: string): boolean => isSelf || settings[key] === true;

  const showVideos = allow('show_videos', true);
  const showStats = allow('show_stats', true);
  const showDreamSchools = allow('show_dream_schools', true);
  const showSocial = allow('show_social_links', true);

  /** Academic + physical measurables, gated by show_stats. */
  const STAT_FIELDS = [
    'gpa', 'sat_score', 'act_score', 'ncaa_eligibility_id',
    'height_inches', 'weight_lbs', 'exit_velo', 'pitch_velo',
    'sixty_time', 'inf_velo', 'of_velo', 'catcher_pop_time',
  ] as const;
  const CONTACT_FIELDS = { email: 'show_contact_email', phone: 'show_phone' } as const;
  const SOCIAL_FIELDS = ['twitter_handle', 'instagram_handle', 'hudl_url', 'video_url'] as const;

  const redacted: Record<string, unknown> = { ...player };
  // The raw Supabase relation keys are re-exposed below under the names the
  // client expects. Leaving the originals in the spread would ship every video
  // URL a second time under `baseball_videos`, defeating the gate three lines
  // down — which is exactly what happened until a payload test caught it.
  delete redacted.baseball_videos;
  delete redacted.baseball_team_members;
  if (!showStats) for (const f of STAT_FIELDS) redacted[f] = null;
  for (const [field, flag] of Object.entries(CONTACT_FIELDS)) {
    if (!allowOptIn(flag)) redacted[field] = null;
  }
  if (!showSocial) for (const f of SOCIAL_FIELDS) redacted[f] = null;

  // Map Supabase relation keys to the interface keys expected by PlayerProfileClient
  const playerData = {
    ...redacted,
    // An empty array, not a list with the urls stripped: the client counts
    // `videos.length` for a tab badge, and a count of hidden videos is itself
    // a disclosure the player did not consent to.
    videos: showVideos ? (player.baseball_videos ?? []) : [],
    team_members: player.baseball_team_members ?? [],
    player_settings: playerSettings,
    recruiting_interests: showDreamSchools ? (recruitingInterests || []) : [],
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
