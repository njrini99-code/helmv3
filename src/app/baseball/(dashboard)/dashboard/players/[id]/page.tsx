import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { PlayerProfileClient } from '@/components/baseball/player-profile/PlayerProfileClient';
import { BreadcrumbLabel } from '@/app/baseball/(dashboard)/_components/breadcrumb-label';
import type { BaseballPlayerStats, BaseballPlayerAggregates, BaseballCoachInsight } from '@/lib/types';
import { getPlayerSnapshotCards } from '@/lib/baseball/read-models/player-snapshot-cards';
import { getPlayerTimeline, getTimelineAcksForSubjectPlayer } from '@/lib/baseball/read-models/timeline';
import { getPlayerCoachNotes } from '@/lib/baseball/read-models/coach-notes';
import { getPlayerTasks } from '@/app/baseball/actions/tasks';
import { resolveBaseballLiftingOrg, resolveBaseballAthleteIds } from '@/lib/lifting/resolve-baseball-context';

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

  // Get team for this organization
  type TeamInfo = { id: string; name: string };
  const { data: team } = await supabase
    .from('baseball_teams')
    .select('id, name')
    .eq('organization_id', coach.organization_id)
    .single() as { data: TeamInfo | null };

  if (!team) {
    redirect('/baseball/dashboard/program');
  }

  // Verify player is on this team
  const { data: membership } = await supabase
    .from('baseball_team_members')
    .select('player_id, jersey_number, position, status, joined_at')
    .eq('team_id', team.id)
    .eq('player_id', playerId)
    .single();

  if (!membership) {
    notFound();
  }

  // Get player info
  const { data: player } = await supabase
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

  if (!player) {
    notFound();
  }

  // Get player stats (using type assertion to avoid deep instantiation)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stats } = await (supabase as any)
    .from('baseball_player_stats')
    .select('*')
    .eq('player_id', playerId)
    .eq('team_id', team.id)
    .order('session_date', { ascending: false })
    .limit(50) as { data: BaseballPlayerStats[] | null };

  // Get aggregates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: aggregates } = await (supabase as any)
    .from('baseball_player_aggregates')
    .select('*')
    .eq('player_id', playerId)
    .eq('team_id', team.id)
    .single() as { data: BaseballPlayerAggregates | null };

  // Get insights
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insights } = await (supabase as any)
    .from('baseball_coach_insights')
    .select('*')
    .eq('player_id', playerId)
    .eq('coach_id', coach.id)
    .eq('status', 'active')
    .order('priority', { ascending: true }) as { data: BaseballCoachInsight[] | null };

  // Parallel fetch: snapshot cards + timeline + coach notes + player tasks +
  // Helm Lifting Lab context (org + athlete mapping for the Performance tab).
  const [snapshotResult, timelineResult, notesResult, tasksResult, liftingContext] = await Promise.all([
    getPlayerSnapshotCards(team.id, playerId),
    getPlayerTimeline(team.id, playerId),
    getPlayerCoachNotes(team.id, playerId),
    getPlayerTasks(playerId),
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
        stats={stats || []}
        aggregates={aggregates}
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
