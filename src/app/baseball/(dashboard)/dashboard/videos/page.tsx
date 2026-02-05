'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { VideoUpload } from '@/components/features/video-upload';
import { VideoPlayer } from '@/components/features/video-player';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { IconVideo, IconPlus, IconStar, IconTrash, IconSearch, IconFilter } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { useTeamStore } from '@/stores/team-store';
import { createClient } from '@/lib/supabase/client';
import { formatRelativeTime, getFullName } from '@/lib/utils';
import { PageLoading } from '@/components/ui/loading';
import { SkeletonVideos } from '@/components/ui/skeleton-loader';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';

// Video type based on baseball_videos table schema
interface BaseballVideo {
  id: string;
  player_id: string;
  team_id: string | null;
  title: string;
  description: string | null;
  url: string | null;
  thumbnail_url: string | null;
  video_type: string | null;
  duration: number | null;
  view_count: number | null;
  is_primary: boolean | null;
  is_clip: boolean | null;
  parent_video_id: string | null;
  clip_start_time: number | null;
  clip_end_time: number | null;
  created_at: string | null;
  updated_at: string | null;
}

interface VideoWithPlayer extends BaseballVideo {
  player?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    primary_position: string | null;
    grad_year: number | null;
  };
}

export default function VideosPage() {
  const { user, player, loading: authLoading } = useAuth();
  const { selectedTeamId } = useTeamStore();
  const [videos, setVideos] = useState<VideoWithPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; url: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { showToast } = useToast();
  const supabase = createClient();

  const isCoach = user?.role === 'coach';

  // Fetch videos
  const fetchVideos = async () => {
    setLoading(true);

    if (isCoach && selectedTeamId) {
      // Coach: fetch videos from all team players
      const { data: teamMembers } = await supabase
        .from('baseball_team_members')
        .select('player_id')
        .eq('team_id', selectedTeamId);

      if (teamMembers && teamMembers.length > 0) {
        const playerIds = teamMembers.map(m => m.player_id);

        const result = await supabase
          .from('baseball_videos')
          .select(`
            *,
            player:baseball_players (
              id,
              first_name,
              last_name,
              avatar_url,
              primary_position,
              grad_year
            )
          `)
          .in('player_id', playerIds)
          .order('created_at', { ascending: false });

        setVideos(result.data || []);
      } else {
        setVideos([]);
      }
    } else if (player) {
      // Player: fetch their own videos
      const result = await supabase
        .from('baseball_videos')
        .select('*')
        .eq('player_id', player.id)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false });

      setVideos(result.data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (player) {
      fetchVideos();
    } else if (isCoach && selectedTeamId) {
      fetchVideos();
    }
  }, [player, isCoach, selectedTeamId]);

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm || !player) return;
    setDeleting(true);
    try {
      const urlParts = deleteConfirm.url.split('/');
      const filePath = urlParts.slice(-2).join('/');
      await supabase.storage.from('baseball_videos').remove([filePath]);
      await supabase.from('baseball_videos').delete().eq('id', deleteConfirm.id);
      const countResult = await supabase.from('baseball_videos').select('*', { count: 'exact', head: true }).eq('player_id', player.id);
      if (countResult.count === 0) {
        await supabase.from('baseball_players').update({ has_video: false }).eq('id', player.id);
      }
      showToast('Video deleted successfully', 'success');
      fetchVideos();
    } catch {
      showToast('Failed to delete video', 'error');
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const setPrimary = async (videoId: string) => {
    if (!player) return;
    await supabase.from('baseball_videos').update({ is_primary: false }).eq('player_id', player.id);
    await supabase.from('baseball_videos').update({ is_primary: true }).eq('id', videoId);
    fetchVideos();
  };

  if (authLoading) return <PageLoading />;
  if (loading) return <><Header title="Videos" /><div className="p-8"><SkeletonVideos /></div></>;

  const filteredVideos = videos.filter((video) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      video.title?.toLowerCase().includes(query) ||
      video.description?.toLowerCase().includes(query) ||
      (video.player && getFullName(video.player.first_name, video.player.last_name).toLowerCase().includes(query))
    );
  });

  return (
    <>
      <Header
        title={isCoach ? "Video Library" : "Videos"}
        subtitle={isCoach ? "View your team's videos" : "Manage your highlight videos"}
      >
        {!isCoach && (
          <Button onClick={() => setShowUpload(true)}>
            <IconPlus size={18} />
            Upload Video
          </Button>
        )}
      </Header>

      <div className="p-6 lg:p-8">
        {/* Coach Search Bar */}
        {isCoach && videos.length > 0 && (
          <Card variant="glass" className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <IconSearch size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Search by player name or video title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button variant="secondary">
                  <IconFilter size={16} className="mr-2" />
                  Filters
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Player Upload Section */}
        {!isCoach && showUpload && (
          <div className="mb-6">
            <VideoUpload onUploadComplete={() => { setShowUpload(false); fetchVideos(); }} onCancel={() => setShowUpload(false)} />
          </div>
        )}

        {/* Empty State */}
        {videos.length === 0 && !showUpload ? (
          <Card variant="glass">
            <CardContent className="p-12 text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center mx-auto mb-6">
                <IconVideo size={40} className="text-green-600" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-2">
                {isCoach ? "No videos from your team yet" : "No videos yet"}
              </h3>
              <p className="text-sm leading-relaxed text-slate-500 mb-6 max-w-md mx-auto">
                {isCoach
                  ? "Videos uploaded by your players will appear here. Encourage your athletes to upload highlight reels and at-bat footage."
                  : "Upload your first highlight video to showcase your skills to college coaches. Recruiters review videos more than any other profile element."}
              </p>
              {!isCoach && (
                <Button onClick={() => setShowUpload(true)}>
                  <IconPlus size={18} className="mr-1" />
                  Upload Your First Video
                </Button>
              )}
            </CardContent>
          </Card>
        ) : filteredVideos.length === 0 && searchQuery ? (
          /* No search results */
          <Card variant="glass">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <IconSearch size={32} className="text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-2">
                No videos match &quot;{searchQuery}&quot;
              </h3>
              <p className="text-sm leading-relaxed text-slate-500 mb-4">
                Try adjusting your search terms.
              </p>
              <Button variant="secondary" onClick={() => setSearchQuery('')}>
                Clear Search
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* Video Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredVideos.map((video) => (
              <Card variant="glass" key={video.id} className="hover:shadow-lg hover:scale-[1.01] transition-all duration-200">
                <CardContent className="p-4">
                  {/* Video player with duration overlay */}
                  <div className="relative">
                    {video.url && <VideoPlayer src={video.url} thumbnail={video.thumbnail_url} title={video.title} />}
                    {/* Duration badge overlay */}
                    {video.duration && video.duration > 0 && (
                      <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/75 text-white text-xs font-medium rounded">
                        {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 space-y-3">
                    {/* Coach: Show player info */}
                    {isCoach && video.player && (
                      <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                        <Avatar
                          name={getFullName(video.player.first_name, video.player.last_name)}
                          src={video.player.avatar_url || undefined}
                          size="xs"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {getFullName(video.player.first_name, video.player.last_name)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {video.player.primary_position} • {video.player.grad_year}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-slate-900 truncate">{video.title}</h3>
                          {video.is_primary && (
                            <Badge variant="success" className="flex items-center gap-1">
                              <IconStar size={12} />
                              Primary
                            </Badge>
                          )}
                          {video.video_type && (
                            <Badge variant="secondary" className="capitalize">
                              {video.video_type.replace(/_/g, ' ')}
                            </Badge>
                          )}
                          {video.is_clip && (
                            <Badge variant="secondary">
                              Clip
                            </Badge>
                          )}
                        </div>
                        {video.description && <p className="text-sm leading-relaxed text-slate-600 line-clamp-2">{video.description}</p>}
                        <p className="text-xs text-slate-500 mt-1">
                          {video.created_at && formatRelativeTime(video.created_at)} • {video.view_count || 0} views
                        </p>
                      </div>
                    </div>

                    {/* Player Actions */}
                    {!isCoach && (
                      <div className="flex items-center gap-2">
                        {!video.is_primary && (
                          <Button variant="secondary" size="sm" onClick={() => setPrimary(video.id)}>
                            <IconStar size={14} />
                            Set Primary
                          </Button>
                        )}
                        <Button variant="secondary" size="sm" onClick={() => video.url && setDeleteConfirm({ id: video.id, url: video.url })}>
                          <IconTrash size={14} />
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Video"
        message="Are you sure you want to delete this video? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm(null)}
      />
    </>
  );
}
