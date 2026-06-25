import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconArrowLeft, IconEye, IconCalendar, IconVideo } from '@/components/icons';
import { VideoDetailClient } from './video-detail-client';
import { formatRelativeTime, getFullName } from '@/lib/utils';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VideoDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/baseball/login');
  }

  // Fetch the video with player info
  const { data: video, error } = await supabase
    .from('baseball_videos')
    .select(`
      *,
      player:baseball_players (
        id,
        first_name,
        last_name,
        avatar_url,
        primary_position,
        grad_year,
        user_id
      )
    `)
    .eq('id', id)
    .single();

  if (error || !video) {
    notFound();
  }

  // Determine ownership (player) and coach status
  const { data: playerRow } = await supabase
    .from('baseball_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: coachRow } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  const isOwner = playerRow ? video.player_id === playerRow.id : false;
  const isCoach = !!coachRow;

  // Non-owner players can only see if they're on the same team
  if (!isOwner && !isCoach) {
    if (playerRow) {
      const { data: sharedTeam } = await supabase
        .from('baseball_team_members')
        .select('team_id')
        .eq('player_id', playerRow.id)
        .in('team_id', video.team_id ? [video.team_id] : [])
        .maybeSingle();

      if (!sharedTeam) {
        redirect('/baseball/dashboard/videos');
      }
    } else {
      redirect('/baseball/dashboard/videos');
    }
  }

  const playerName = video.player
    ? getFullName(
        (video.player as { first_name: string | null }).first_name,
        (video.player as { last_name: string | null }).last_name,
      )
    : null;

  return (
    <div className="min-h-dvh bg-cream">
      <div className="max-w-[860px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Back link */}
        <Link
          href="/baseball/dashboard/videos"
          className="inline-flex items-center gap-2 text-sm text-warm-500 hover:text-warm-700 transition-colors"
        >
          <IconArrowLeft size={16} />
          Back to Videos
        </Link>

        {/* Video title */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-2xl font-semibold tracking-tight text-warm-900">{video.title}</h1>
              {video.is_primary && (
                <Badge variant="success">Primary</Badge>
              )}
              {video.is_clip && (
                <Badge variant="secondary">Clip</Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-warm-500 flex-wrap">
              {video.video_type && (
                <span className="capitalize">{(video.video_type as string).replace(/_/g, ' ')}</span>
              )}
              {video.created_at && (
                <span className="flex items-center gap-1">
                  <IconCalendar size={13} />
                  {formatRelativeTime(video.created_at as string)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <IconEye size={13} />
                {video.view_count ?? 0} views
              </span>
            </div>
          </div>
          {isOwner && (
            <Link href={`/baseball/dashboard/videos/${id}/edit`}>
              <Button variant="secondary" size="sm">Create Clip</Button>
            </Link>
          )}
        </div>

        {/* Video player + actions (client component for view count increment + share) */}
        <VideoDetailClient videoId={id} videoUrl={video.url as string | null} thumbnailUrl={video.thumbnail_url as string | null} title={video.title as string} />

        {/* Player info */}
        {video.player && playerName && (
          <Card variant="glass">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Avatar
                  name={playerName}
                  src={(video.player as { avatar_url: string | null }).avatar_url ?? undefined}
                  size="md"
                />
                <div>
                  <p className="font-semibold text-warm-900">{playerName}</p>
                  <p className="text-sm text-warm-500">
                    {(video.player as { primary_position: string | null }).primary_position}
                    {(video.player as { grad_year: number | null }).grad_year
                      ? ` • Class of ${(video.player as { grad_year: number | null }).grad_year}`
                      : ''}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Description */}
        {video.description && (
          <Card variant="glass">
            <CardContent className="p-4">
              <p className="text-sm leading-relaxed text-warm-700">{video.description as string}</p>
            </CardContent>
          </Card>
        )}

        {/* Clip info */}
        {video.is_clip && video.parent_video_id && (
          <Card variant="glass">
            <CardContent className="p-4 flex items-center gap-2 text-sm text-warm-600">
              <IconVideo size={14} className="text-warm-400 flex-shrink-0" />
              <span>This is a clip created from a longer video.</span>
              {video.clip_start_time != null && video.clip_end_time != null && (
                <span className="ml-auto text-warm-400 tabular-nums">
                  {Math.floor((video.clip_start_time as number) / 60)}:{String(Math.floor((video.clip_start_time as number) % 60)).padStart(2, '0')}
                  {' – '}
                  {Math.floor((video.clip_end_time as number) / 60)}:{String(Math.floor((video.clip_end_time as number) % 60)).padStart(2, '0')}
                </span>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
