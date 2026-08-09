import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { PlayerProfileClient } from '@/components/baseball/player-profile/PlayerProfileClient';
import { BreadcrumbLabel } from '@/app/baseball/(dashboard)/_components/breadcrumb-label';
import type { BaseballCoachInsight } from '@/lib/types';
import { getPlayerSnapshotCards } from '@/lib/baseball/read-models/player-snapshot-cards';
import { getPlayerTimeline, getTimelineAcksForSubjectPlayer } from '@/lib/baseball/read-models/timeline';
import { getPlayerCoachNotes } from '@/lib/baseball/read-models/coach-notes';
import { getPlayerTasks } from '@/app/baseball/actions/tasks';
import { getPlayerSeasonStats } from '@/app/baseball/actions/games';
import { resolveBaseballLiftingOrg, resolveBaseballAthleteIds } from '@/lib/lifting/resolve-baseball-context';
import { resolveTeamTimezone, todayIsoInTz } from '@/lib/baseball/daily-contract/contract-day';
import { resolveCoachTeamIdWithCookie } from '@/lib/baseball/resolve-team-server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlayerProfilePage({ params }: PageProps) {
  const { id: playerId } = await params;
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect('/baseball/login');
  }

  // Get coach profile
  const { data: coach, error: coachError } = await supabase
    .from('baseball_coaches')
    .select('id, coach_type, organization_id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    redirect('/baseball/dashboard/command-center');
  }

  // Only college and JUCO coaches have access
  if (coach.coach_type !== 'college' && coach.coach_type !== 'juco') {
    redirect('/baseball/dashboard/command-center');
  }

  if (!coach.organization_id) {
    redirect('/baseball/dashboard/program');
  }

  // Cookie-aware, multi-row-safe team resolution (matches Command Center).
  // The prior `.eq('organization_id', ...).single()` would throw for any
  // org with 2+ team rows — unreachable today since this route is locked to
  // college/JUCO coach types above, but this closes the gap ahead of any
  // future multi-team college/JUCO feature.
  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
  if (!teamId) {
    redirect('/baseball/dashboard/program');
  }

  type TeamInfo = { id: string; name: string };
  const { data: team, error: teamError } = await supabase
    .from('baseball_teams')
    .select('id, name')
    .eq('id', teamId)
    .maybeSingle() as { data: TeamInfo | null; error: { message?: string; code?: string } | null };

  // Three reads decide this page, and each one fails into a different lie.
  // A failed team read redirects the coach to /program as though their team
  // were gone — off the player they clicked, with no error and no way back
  // except to click the same player again.
  if (teamError) {
    void logServerError(
      `[baseball player page] team read failed for ${teamId}; the coach will be redirected as if the team does not exist: ${describeError(teamError)}`,
      { action: 'baseballPlayerPage.resolveTeam', featureArea: 'roster' },
      'error',
    );
    throw new Error("Couldn't load your team. Please try again.");
  }

  if (!team) {
    redirect('/baseball/dashboard/program');
  }

  // Verify player is on this team
  const { data: membership, error: membershipError } = await supabase
    .from('baseball_team_members')
    .select('player_id, jersey_number, position, status, joined_at')
    .eq('team_id', team.id)
    .eq('player_id', playerId)
    .single();

  // `.single()` reports a genuine no-row as PGRST116 — that really is "this
  // player is not on your team" and still 404s. Any other code is the read
  // falling over, and a 404 for a player the coach just clicked on their own
  // roster is the most confusing thing this page can do: the roster behind it
  // still lists them.
  if (membershipError && membershipError.code !== 'PGRST116') {
    void logServerError(
      `[baseball player page] membership read failed for ${playerId}: ${describeError(membershipError)}`,
      { action: 'baseballPlayerPage.verifyMembership', featureArea: 'roster' },
      'warning',
    );
    throw new Error("Couldn't confirm this player is on your team. Please try again.");
  }

  if (!membership) {
    notFound();
  }

  // Get player info
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
      bats,
      throws,
      height_feet,
      height_inches,
      weight_lbs,
      gpa,
      city,
      state,
      high_school_name
    `)
    .eq('id', playerId)
    .single();

  // Membership already proved this player is on the team, so a failure here
  // 404s someone we have just confirmed exists.
  if (playerError) {
    void logServerError(
      `[baseball player page] player read failed for ${playerId} after membership was confirmed: ${describeError(playerError)}`,
      { action: 'baseballPlayerPage.loadPlayer', featureArea: 'roster' },
      'error',
    );
    throw new Error("Couldn't load this player. Please try again.");
  }

  if (!player) {
    notFound();
  }

  // Get insights
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insights } = await (supabase as any)
    .from('baseball_coach_insights')
    .select('*')
    .eq('player_id', playerId)
    .eq('coach_id', coach.id)
    .eq('status', 'active')
    .order('priority', { ascending: true }) as { data: BaseballCoachInsight[] | null };

  const currentSeasonYear = new Date().getFullYear();

  // getPlayerSnapshotCards' "overdue" task computation anchors on `forDate`
  // (defaulting to the server's UTC day when omitted) — resolve the team's
  // own IANA timezone and pass its local day so a task due "today" isn't
  // read as overdue (or not) a day early/late for a non-UTC program. Mirrors
  // the Daily Contract's resolveTeamTimezone + todayIsoInTz idiom.
  const todayIso = todayIsoInTz(await resolveTeamTimezone(supabase, team.id));

  // Parallel fetch: snapshot cards + timeline + coach notes + player tasks +
  // box-score-canonical season stats (mirrors /players/[id]/stats — the
  // source of truth a box-score save actually updates) + Helm Lifting Lab
  // context (org + athlete mapping for the Performance tab).
  const [snapshotResult, timelineResult, notesResult, tasksResult, seasonStatsResult, liftingContext] = await Promise.all([
    getPlayerSnapshotCards(team.id, playerId, { forDate: todayIso }),
    getPlayerTimeline(team.id, playerId),
    getPlayerCoachNotes(team.id, playerId),
    getPlayerTasks(playerId),
    getPlayerSeasonStats(playerId, team.id, currentSeasonYear),
    (async (): Promise<{ liftingOrgId: string | null; liftingAthleteId: string | null }> => {
      const liftingCtx = await resolveBaseballLiftingOrg(team.id).catch(() => null);
      if (!liftingCtx) return { liftingOrgId: null, liftingAthleteId: null };
      const athleteMap = await resolveBaseballAthleteIds(
        liftingCtx.organizationId,
        [playerId],
      ).catch(() => null);
      return {
        liftingOrgId: liftingCtx.organizationId,
        liftingAthleteId: athleteMap ? (athleteMap[playerId] ?? null) : null,
      };
    })(),
  ]);
  const { liftingOrgId, liftingAthleteId } = liftingContext;

  // Resolve which of the coach's-visible timeline events the SUBJECT PLAYER
  // (not the viewing coach) has acknowledged. The viewer here is always a
  // coach, so scoping by the viewer's own auth.uid() (getTimelineAcksForViewer)
  // would always resolve to the coach's own empty ack set — we need the
  // player's acks instead. Never throws, degrades to {}.
  const timelineAcks =
    timelineResult.events.length > 0
      ? await getTimelineAcksForSubjectPlayer(
          playerId,
          timelineResult.events.map((e) => e.id),
        )
      : {};

  // Get player videos
  const { data: videos } = await supabase
    .from('baseball_videos')
    .select('*')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(12);

  // Transform coach notes from CoachNoteView to the format PlayerNotesSection expects
  const transformedNotes = notesResult.notes.map(note => ({
    id: note.id,
    content: note.body,
    created_at: note.createdAt,
    note_type: note.scope,
  }));

  // Transform tasks — TaskWithAssignment is an internal type in tasks.ts; extract what we need
  const playerTasks = (tasksResult.success && tasksResult.data)
    ? tasksResult.data.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        due_date: t.due_date,
        priority: t.priority,
        category: t.category,
        created_at: t.created_at,
        assignment_status: t.assignment_status,
        completed_at: t.completed_at,
      }))
    : [];

  // Transform videos to expected format. is_clip/clip_start_time/clip_end_time
  // are forwarded so the video modal can enforce clip bounds at playback
  // (see VideoPlayer's clipStart/clipEnd props) instead of playing the full
  // parent video for clip rows.
  const transformedVideos = (videos || []).map(video => ({
    id: video.id,
    title: video.title,
    thumbnail_url: video.thumbnail_url,
    video_url: video.url, // videos table uses 'url' not 'video_url'
    created_at: video.created_at || new Date().toISOString(),
    video_type: video.video_type || undefined,
    is_clip: video.is_clip,
    clip_start_time: video.clip_start_time,
    clip_end_time: video.clip_end_time,
  }));

  return (
    <>
      {/* Ruling 4: the shell's breadcrumb has no registry entry for a
          dynamic player id — this supplies the real name so the trail never
          falls back to a raw UUID segment. */}
      <BreadcrumbLabel name={`${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || null} />
      <PlayerProfileClient
        player={{
          ...player,
          jersey_number: membership.jersey_number?.toString() || null,
          team_position: membership.position,
          team_status: membership.status,
          joined_at: membership.joined_at,
        }}
        seasonStats={seasonStatsResult.success ? (seasonStatsResult.data ?? null) : null}
        battingLog={seasonStatsResult.success ? (seasonStatsResult.gameLog ?? []) : []}
        pitchingLog={seasonStatsResult.success ? (seasonStatsResult.pitchingLog ?? []) : []}
        insights={insights || []}
        notes={transformedNotes}
        notesCanAuthor={notesResult.canAuthor}
        videos={transformedVideos}
        teamId={team.id}
        teamName={team.name}
        coachId={coach.id}
        snapshotHeader={snapshotResult.authorized ? snapshotResult.header : null}
        timelineEvents={timelineResult.events}
        timelineViewerRole={timelineResult.viewerRole}
        timelineHiddenCount={timelineResult.hiddenCount}
        timelineAcks={timelineAcks}
        tasks={playerTasks}
        liftingOrgId={liftingOrgId}
        liftingAthleteId={liftingAthleteId}
      />
    </>
  );
}
