'use server';

import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { notifyProfileView } from '@/lib/notifications';
import { logServerError } from '@/lib/server-error-logger';
import { getCoachRosterPlayerIds } from '@/lib/baseball/player-visibility';
import { assertCoachCanRecruitPlayer } from '@/lib/baseball/recruitability';
import type { CoachType } from '@/app/baseball/actions/discover';
import { describeError } from '@/lib/utils/describe-error';

export interface PlayerPeekData {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  primaryPosition: string | null;
  secondaryPosition: string | null;
  gradYear: number | null;
  highSchoolName: string | null;
  city: string | null;
  state: string | null;
  heightFeet: number | null;
  heightInches: number | null;
  weightLbs: number | null;
  bats: string | null;
  throws: string | null;
  gpa: number | null;
  playerType: string | null;
  hasVideo: boolean;
  stats: {
    pitchVelo: number | null;
    exitVelo: number | null;
    sixtyTime: number | null;
    popTime: number | null;
  };
  isOnWatchlist: boolean;
  watchlistId: string | null;
  pipelineStage: string | null;
  lastActivity: string | null;
}

/**
 * Fetch player data for the peek panel preview.
 * Returns essential info for quick view without full profile load.
 *
 * P0 PRIVACY — gates this surface behind assertCoachCanRecruitPlayer()
 * (src/lib/baseball/recruitability.ts), the ONE full-policy implementation
 * that discover.ts's browse query and the watchlist/engagement write paths
 * already enforce. Routing through that single source of truth (instead of
 * re-deriving a partial copy here) is deliberate: a prior version of this
 * gate checked only recruiting_activated + profile_visibility and missed
 * two of Discover's restrictions (coach_type vs player_type, and
 * discoverable-team membership) — see git history / PR #873 review. A
 * viewer may see a player's peek data ONLY when:
 *   (a) the viewer is a coach on a team the player is a MEMBER of
 *       (own-roster peek — allowed regardless of recruiting_activated /
 *       profile_visibility, same as viewing your own roster elsewhere), OR
 *   (b) assertCoachCanRecruitPlayer() allows it — recruiting_activated,
 *       not a college player, coach_type/player_type compatible (a JUCO
 *       coach may not peek another JUCO player, mirroring discover.ts's
 *       browse filter), profile_visibility not 'private', and the player
 *       is on a discoverable (HS/showcase/JUCO) team roster — a player
 *       removed from every roster is not peekable even if
 *       recruiting_activated was never reset.
 * A viewer with no baseball_coaches row at all (e.g. a player-role session)
 * is denied outright, mirroring Discover's own "no coachProfile -> nothing"
 * behavior. Every branch below returns the SAME generic 'Player not found'
 * error so a denied request is indistinguishable from a truly-missing row.
 *
 * SEMGREP-ALLOW: read endpoint; engagement-event insert is fire-and-forget telemetry, no UI cache to invalidate
 */
async function getPlayerPeekDataImpl(playerId: string): Promise<{
  success: boolean;
  data?: PlayerPeekData;
  error?: string;
}> {
  const supabase = await createClient();

  try {
    // Get authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Viewer must be a coach — mirrors discover.ts requiring a coachProfile
    // before returning anything (a player-role session has none). coach_type
    // is fetched here (previously it wasn't) so the gate below can consult
    // it — see assertCoachCanRecruitPlayer's coach_type_mismatch checks.
    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('id, full_name, organization_id, coach_type')
      .eq('user_id', user.id)
      .single() as { data: { id: string; full_name: string | null; organization_id: string | null; coach_type: string | null } | null };

    if (!coach) {
      return { success: false, error: 'Player not found' };
    }

    // Get player data
    const { data: player, error: playerError } = await supabase
      .from('baseball_players')
      .select(`
        id,
        first_name,
        last_name,
        avatar_url,
        primary_position,
        secondary_position,
        grad_year,
        high_school_name,
        city,
        state,
        height_feet,
        height_inches,
        weight_lbs,
        bats,
        throws,
        gpa,
        player_type,
        has_video,
        pitch_velo,
        exit_velo,
        sixty_time,
        pop_time,
        recruiting_activated,
        updated_at
      `)
      .eq('id', playerId)
      .single();

    if (playerError || !player) {
      return { success: false, error: 'Player not found' };
    }

    // -------------------------------------------------------------------
    // P0 PRIVACY GATE — evaluated BEFORE any watchlist lookup or telemetry
    // write below, so a denied request never fires the engagement-event
    // insert or the profile-view email.
    //
    // Own-roster is checked here (not inside assertCoachCanRecruitPlayer)
    // because peek's own-roster rule is the INVERSE of that function's: a
    // coach may always view their own roster player regardless of
    // recruiting_activated / profile_visibility, whereas
    // assertCoachCanRecruitPlayer denies own-roster players (reason
    // 'on_own_roster') because you don't "recruit" a player you already
    // have. Everything else — coach_type vs player_type, recruiting_activated,
    // college-player exclusion, profile_visibility, and discoverable-team
    // membership — is delegated entirely to assertCoachCanRecruitPlayer so
    // this gate cannot drift from Discover's policy again.
    // -------------------------------------------------------------------
    const rosterIds = await getCoachRosterPlayerIds(supabase, coach.id);
    const isOwnRoster = rosterIds.has(playerId);

    if (!isOwnRoster) {
      const recruitability = await assertCoachCanRecruitPlayer(
        supabase,
        coach.id,
        coach.coach_type as CoachType,
        playerId,
      );
      if (!recruitability.allowed) {
        return { success: false, error: 'Player not found' };
      }
    }

    let isOnWatchlist = false;
    let watchlistId: string | null = null;
    let pipelineStage: string | null = null;

    const { data: watchlist } = await supabase
      .from('baseball_watchlists')
      .select('id, pipeline_stage')
      .eq('coach_id', coach.id)
      .eq('player_id', playerId)
      .maybeSingle();

    if (watchlist) {
      isOnWatchlist = true;
      watchlistId = watchlist.id;
      pipelineStage = watchlist.pipeline_stage;
    }

    // Log profile view engagement
    const { error: engagementError } = await fromUntyped(supabase, 'baseball_player_engagement_events')
      .insert({ // nosemgrep: helmv3-action-missing-revalidate -- fire-and-forget telemetry, no UI cache
        player_id: playerId,
        coach_id: coach.id,
        engagement_type: 'profile_view',
        metadata: { source: 'peek_panel' },
      });
    if (engagementError) {
      await logServerError(
        `Failed to record profile_view engagement event: ${describeError(engagementError)}`,
        { action: 'player_peek.getPlayerPeekData.engagementEvent' },
      );
    }

    // Notify the player of the profile view (fire-and-forget)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: playerRow } = await supabase.from('baseball_players' as any)
        .select('user_id').eq('id', playerId).single() as { data: { user_id: string } | null };

      if (playerRow?.user_id) {
        const { data: userRow } = await supabase.from('users')
          .select('email').eq('id', playerRow.user_id).single();

        let schoolName = 'a program';
        if (coach.organization_id) {
          const { data: org } = await supabase.from('organizations')
            .select('name').eq('id', coach.organization_id).single();
          if (org?.name) schoolName = org.name;
        }

        const viewerInfo = coach.full_name?.trim()
          ? `${coach.full_name} from ${schoolName}`
          : `A coach from ${schoolName}`;

        if (userRow?.email) {
          await notifyProfileView(playerRow.user_id, userRow.email, viewerInfo);
        }
      }
    } catch (notifErr) {
      await logServerError(`[playerPeek] Notification error (non-fatal): ${describeError(notifErr)}`, { action: 'player_peek.getPlayerPeekData' });
    }

    return {
      success: true,
      data: {
        id: player.id,
        firstName: player.first_name || '',
        lastName: player.last_name || '',
        avatarUrl: player.avatar_url,
        primaryPosition: player.primary_position,
        secondaryPosition: player.secondary_position,
        gradYear: player.grad_year,
        highSchoolName: player.high_school_name,
        city: player.city,
        state: player.state,
        heightFeet: player.height_feet,
        heightInches: player.height_inches,
        weightLbs: player.weight_lbs,
        bats: player.bats,
        throws: player.throws,
        gpa: player.gpa,
        playerType: player.player_type,
        hasVideo: player.has_video || false,
        stats: {
          pitchVelo: player.pitch_velo,
          exitVelo: player.exit_velo,
          sixtyTime: player.sixty_time,
          popTime: player.pop_time,
        },
        isOnWatchlist,
        watchlistId,
        pipelineStage,
        lastActivity: player.updated_at,
      },
    };
  } catch (error) {
    await logServerError(`Error fetching player peek data: ${describeError(error)}`, { action: 'player_peek.getPlayerPeekData' });
    return { success: false, error: 'Failed to load player data' };
  }
}

// Wrapped the SAME way discover.ts wraps its cross-team browse/peek reads
// (#394-style): peek is reached from Discover/Watchlist/Pipeline, all of
// which are cross-team by nature — there is no single "target team" to
// resolve a capability against, and identity is derived from the coach's own
// baseball_coaches row inside the impl (unchanged), not from an active-team
// context. requireActiveContext: false — a coach with no active team
// membership can still open the peek panel from Discover. demoSafe: true —
// preserves this action's PRE-EXISTING (unguarded) behavior for the shared
// demo coach session; this PR's scope is the P0 authorization gate above,
// not the demo write-pollution question the engagement-event insert / email
// notification below separately raise (see PR notes / deferred).
export const getPlayerPeekData = withBaseballAction(
  'getPlayerPeekData',
  { featureArea: 'baseball-player-peek', requireActiveContext: false, demoSafe: true },
  (_ctx, playerId: string) => getPlayerPeekDataImpl(playerId),
);
