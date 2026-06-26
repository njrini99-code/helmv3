import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { PlayerProfileClient } from '@/components/baseball/player-profile/PlayerProfileClient';
import type { BaseballPlayerStats, BaseballPlayerAggregates, BaseballCoachInsight } from '@/lib/types';
import { getPlayerSnapshotCards } from '@/lib/baseball/read-models/player-snapshot-cards';
import { getPlayerTimeline } from '@/lib/baseball/read-models/timeline';
import { getPlayerCoachNotes } from '@/lib/baseball/read-models/coach-notes';
import { getPlayerTasks } from '@/app/baseball/actions/tasks';

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

  // Parallel fetch: snapshot cards + timeline + coach notes + player tasks
  const [snapshotResult, timelineResult, notesResult, tasksResult] = await Promise.all([
    getPlayerSnapshotCards(team.id, playerId),
    getPlayerTimeline(team.id, playerId),
    getPlayerCoachNotes(team.id, playerId),
    getPlayerTasks(playerId),
  ]);

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

  // Transform videos to expected format
  const transformedVideos = (videos || []).map(video => ({
    id: video.id,
    title: video.title,
    thumbnail_url: video.thumbnail_url,
    video_url: video.url, // videos table uses 'url' not 'video_url'
    created_at: video.created_at || new Date().toISOString(),
    video_type: video.video_type || undefined,
  }));

  return (
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
      tasks={playerTasks}
    />
  );
}
