'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { VideoUpload } from '@/components/features/video-upload';
import { VideoPlayer } from '@/components/features/video-player';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Avatar } from '@/components/ui/avatar';
import { Modal } from '@/components/ui/modal';
import { 
  IconVideo, 
  IconPlus, 
  IconStar, 
  IconTrash, 
  IconSearch, 
  IconFilter, 
  IconEdit, 
  IconUsers, 
  IconPlay,
  IconEye,
  IconLink
} from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { useTeamStore } from '@/stores/team-store';
import { createClient } from '@/lib/supabase/client';
import { formatRelativeTime, getFullName } from '@/lib/utils';
import { PageLoading } from '@/components/ui/loading';
import { SkeletonVideos } from '@/components/ui/skeleton-loader';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/sonner';

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

const videoTypes = [
  { value: 'game_footage', label: 'Game Footage' },
  { value: 'skills_video', label: 'Skills Video' },
  { value: 'bullpen', label: 'Bullpen Session' },
  { value: 'batting_practice', label: 'Batting Practice' },
  { value: 'fielding', label: 'Fielding Drills' },
  { value: 'running', label: '60-Yard Dash / Running' },
  { value: 'throwing', label: 'Throwing / Arm Strength' },
  { value: 'highlight_reel', label: 'Highlight Reel' },
  { value: 'showcase', label: 'Showcase Event' },
  { value: 'other', label: 'Other' },
];

export default function VideosPage() {
  const { user, player, loading: authLoading } = useAuth();
  const { selectedTeamId } = useTeamStore();
  const [myVideos, setMyVideos] = useState<VideoWithPlayer[]>([]);
  const [teamVideos, setTeamVideos] = useState<VideoWithPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; url: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingVideo, setEditingVideo] = useState<VideoWithPlayer | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', video_type: '' });
  const [saving, setSaving] = useState(false);
  const [viewingVideo, setViewingVideo] = useState<VideoWithPlayer | null>(null);
  const { showToast } = useToast();
  const supabase = createClient();

  const isCoach = user?.role === 'coach';
  const isCollegePlayer = player?.player_type === 'college';

  // Fetch videos
  const fetchVideos = useCallback(async () => {
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

        setMyVideos(result.data || []);
        setTeamVideos([]);
      } else {
        setMyVideos([]);
        setTeamVideos([]);
      }
    } else if (player) {
      // Player: fetch their own videos
      const result = await supabase
        .from('baseball_videos')
        .select('*')
        .eq('player_id', player.id)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false });

      setMyVideos(result.data || []);

      // For college players: also fetch team videos from teammates
      if (isCollegePlayer && selectedTeamId) {
        const { data: teamMembers } = await supabase
          .from('baseball_team_members')
          .select('player_id')
          .eq('team_id', selectedTeamId)
          .neq('player_id', player.id); // Exclude self

        if (teamMembers && teamMembers.length > 0) {
          const teammateIds = teamMembers.map(m => m.player_id);

          const teamResult = await supabase
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
            .in('player_id', teammateIds)
            .order('created_at', { ascending: false })
            .limit(20);

          setTeamVideos(teamResult.data || []);
        }
      }
    }

    setLoading(false);
  }, [isCoach, selectedTeamId, player, isCollegePlayer, supabase]);

  useEffect(() => {
    if (player) {
      fetchVideos();
    } else if (isCoach && selectedTeamId) {
      fetchVideos();
    }
  }, [player, isCoach, selectedTeamId, fetchVideos]);

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
    showToast('Primary video updated', 'success');
    fetchVideos();
  };

  const handleEditClick = (video: VideoWithPlayer) => {
    setEditingVideo(video);
    setEditForm({
      title: video.title || '',
      description: video.description || '',
      video_type: video.video_type || '',
    });
  };

  const handleEditSave = async () => {
    if (!editingVideo || !editForm.title.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('baseball_videos')
        .update({
          title: editForm.title.trim(),
          description: editForm.description.trim() || null,
          video_type: editForm.video_type || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingVideo.id);

      if (error) throw error;
      showToast('Video updated successfully', 'success');
      setEditingVideo(null);
      fetchVideos();
    } catch {
      showToast('Failed to update video', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleViewVideo = async (video: VideoWithPlayer) => {
    setViewingVideo(video);
    // Increment view count (don't await, fire and forget)
    supabase
      .from('baseball_videos')
      .update({ view_count: (video.view_count || 0) + 1 })
      .eq('id', video.id)
      .then(() => {});
  };

  const handleShareVideo = async (video: VideoWithPlayer) => {
    if (!video.url) return;
    
    try {
      await navigator.clipboard.writeText(video.url);
      showToast('Video link copied to clipboard', 'success');
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = video.url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast('Video link copied to clipboard', 'success');
    }
  };

  if (authLoading) return <PageLoading />;
  if (loading) return <><Header title="Videos" /><div className="p-4 sm:p-6 lg:p-8"><SkeletonVideos /></div></>;

  const filteredMyVideos = myVideos.filter((video) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      video.title?.toLowerCase().includes(query) ||
      video.description?.toLowerCase().includes(query) ||
      (video.player && getFullName(video.player.first_name, video.player.last_name).toLowerCase().includes(query))
    );
  });

  const filteredTeamVideos = teamVideos.filter((video) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      video.title?.toLowerCase().includes(query) ||
      video.description?.toLowerCase().includes(query) ||
      (video.player && getFullName(video.player.first_name, video.player.last_name).toLowerCase().includes(query))
    );
  });

  const hasNoVideos = myVideos.length === 0 && teamVideos.length === 0;

  return (
    <>
      <Header
        title={isCoach ? "Video Library" : "Videos"}
        subtitle={isCoach ? "View your team's videos" : "Manage your highlight videos"}
      >
        {!isCoach && (
          <Button onClick={() => setShowUpload(true)} size="sm" className="sm:size-default">
            <IconPlus size={18} />
            <span className="hidden sm:inline">Upload Video</span>
            <span className="sm:hidden">Upload</span>
          </Button>
        )}
      </Header>

      <div className="p-4 sm:p-6 lg:p-8">
        {/* Search Bar (show when there are videos) */}
        {!hasNoVideos && (
          <Card variant="glass" className="mb-6">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                <div className="flex-1 relative">
                  <IconSearch size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
                  <Input
                    type="text"
                    placeholder={isCoach ? "Search by player name or video title..." : "Search videos..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button variant="secondary" className="w-full sm:w-auto">
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
        {hasNoVideos && !showUpload ? (
          <Card variant="glass">
            <CardContent className="p-8 sm:p-12 text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-primary-50 to-emerald-50 flex items-center justify-center mx-auto mb-4 sm:mb-6">
                <IconVideo size={32} className="sm:hidden text-primary-600" />
                <IconVideo size={40} className="hidden sm:block text-primary-600" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold tracking-tight text-warm-900 mb-2">
                {isCoach ? "No videos from your team yet" : "No videos yet"}
              </h3>
              <p className="text-sm leading-relaxed text-warm-500 mb-6 max-w-md mx-auto">
                {isCoach
                  ? "Videos uploaded by your players will appear here. Encourage your athletes to upload highlight reels and at-bat footage."
                  : "Upload your first highlight video to showcase your skills. Great videos include game highlights, batting practice, and fielding drills."}
              </p>
              {!isCoach && (
                <Button onClick={() => setShowUpload(true)}>
                  <IconPlus size={18} className="mr-1" />
                  Upload Your First Video
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* My Videos Section */}
            {filteredMyVideos.length > 0 && (
              <section>
                {isCollegePlayer && teamVideos.length > 0 && (
                  <h2 className="text-lg font-semibold text-warm-900 mb-4 flex items-center gap-2">
                    <IconVideo size={20} className="text-primary-600" />
                    My Videos
                  </h2>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {filteredMyVideos.map((video) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      isCoach={isCoach}
                      isOwner={true}
                      onEdit={() => handleEditClick(video)}
                      onDelete={() => video.url && setDeleteConfirm({ id: video.id, url: video.url })}
                      onSetPrimary={() => setPrimary(video.id)}
                      onView={() => handleViewVideo(video)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Team Videos Section (College Players Only) */}
            {isCollegePlayer && filteredTeamVideos.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-warm-900 mb-4 flex items-center gap-2">
                  <IconUsers size={20} className="text-primary-600" />
                  Team Videos
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {filteredTeamVideos.map((video) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      isCoach={false}
                      isOwner={false}
                      showPlayer={true}
                      onView={() => handleViewVideo(video)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* No Search Results */}
            {filteredMyVideos.length === 0 && filteredTeamVideos.length === 0 && searchQuery && (
              <Card variant="glass">
                <CardContent className="p-8 sm:p-12 text-center">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
                    <IconSearch size={28} className="text-warm-400" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold tracking-tight text-warm-900 mb-2">
                    No videos match &quot;{searchQuery}&quot;
                  </h3>
                  <p className="text-sm leading-relaxed text-warm-500 mb-4">
                    Try adjusting your search terms.
                  </p>
                  <Button variant="secondary" onClick={() => setSearchQuery('')}>
                    Clear Search
                  </Button>
                </CardContent>
              </Card>
            )}
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

      {/* Edit Video Modal */}
      <Modal
        open={!!editingVideo}
        onClose={() => setEditingVideo(null)}
        title="Edit Video"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Title *"
            value={editForm.title}
            onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g., Fall Scrimmage Highlights"
          />
          <Select
            label="Video Type"
            options={videoTypes}
            value={editForm.video_type}
            onChange={(value) => setEditForm(f => ({ ...f, video_type: value }))}
            placeholder="Select type (optional)"
          />
          <Textarea
            label="Description"
            value={editForm.description}
            onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Add context about this video..."
            rows={3}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-warm-100">
            <Button variant="secondary" onClick={() => setEditingVideo(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} isLoading={saving} disabled={!editForm.title.trim()}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Video Player Modal */}
      <Modal
        open={!!viewingVideo}
        onClose={() => setViewingVideo(null)}
        title={viewingVideo?.title || 'Video'}
        size="xl"
      >
        {viewingVideo && (
          <div className="space-y-4">
            {viewingVideo.url && (
              <VideoPlayer 
                src={viewingVideo.url} 
                thumbnail={viewingVideo.thumbnail_url} 
                title={viewingVideo.title}
                autoPlay={true}
              />
            )}
            {viewingVideo.player && (
              <div className="flex items-center gap-3 p-3 bg-warm-50 rounded-xl">
                <Avatar
                  name={getFullName(viewingVideo.player.first_name, viewingVideo.player.last_name)}
                  src={viewingVideo.player.avatar_url || undefined}
                  size="sm"
                />
                <div>
                  <p className="font-medium text-warm-900">
                    {getFullName(viewingVideo.player.first_name, viewingVideo.player.last_name)}
                  </p>
                  <p className="text-sm text-warm-500">
                    {viewingVideo.player.primary_position} {viewingVideo.player.grad_year && `• Class of ${viewingVideo.player.grad_year}`}
                  </p>
                </div>
              </div>
            )}
            {viewingVideo.description && (
              <p className="text-sm text-warm-600 leading-relaxed">{viewingVideo.description}</p>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm text-warm-500 flex-wrap">
                {viewingVideo.video_type && (
                  <Badge variant="secondary" className="capitalize">
                    {viewingVideo.video_type.replace(/_/g, ' ')}
                  </Badge>
                )}
                {viewingVideo.created_at && (
                  <span>Uploaded {formatRelativeTime(viewingVideo.created_at)}</span>
                )}
                <span className="flex items-center gap-1">
                  <IconEye size={14} />
                  {viewingVideo.view_count || 0} views
                </span>
              </div>
              {viewingVideo.url && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleShareVideo(viewingVideo)}
                  className="flex-shrink-0"
                >
                  <IconLink size={14} />
                  <span className="ml-1">Share</span>
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// VideoCard component for cleaner JSX
interface VideoCardProps {
  video: VideoWithPlayer;
  isCoach: boolean;
  isOwner: boolean;
  showPlayer?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onSetPrimary?: () => void;
  onView?: () => void;
}

function VideoCard({ 
  video, 
  isCoach, 
  isOwner, 
  showPlayer = false,
  onEdit, 
  onDelete, 
  onSetPrimary,
  onView 
}: VideoCardProps) {
  return (
    <Card variant="glass" className="hover:shadow-lg hover:scale-[1.005] transition-all duration-200">
      <CardContent className="p-3 sm:p-4">
        {/* Video player with click to view modal */}
        <div 
          className="relative cursor-pointer group"
          onClick={onView}
        >
          {video.url && (
            <div className="relative">
              {video.thumbnail_url ? (
                <div className="aspect-video rounded-xl overflow-hidden bg-warm-100">
                  <img 
                    src={video.thumbnail_url} 
                    alt={video.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <VideoPlayer src={video.url} thumbnail={video.thumbnail_url} title={video.title} />
              )}
              {/* Play overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                  <IconPlay size={24} className="text-warm-900 ml-1" />
                </div>
              </div>
            </div>
          )}
          {/* Duration badge overlay */}
          {video.duration && video.duration > 0 && (
            <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/75 text-white text-xs font-medium rounded">
              {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
            </div>
          )}
        </div>
        
        <div className="mt-3 sm:mt-4 space-y-2 sm:space-y-3">
          {/* Show player info for coach view or team videos */}
          {(isCoach || showPlayer) && video.player && (
            <div className="flex items-center gap-2 pb-2 border-b border-warm-200">
              <Avatar
                name={getFullName(video.player.first_name, video.player.last_name)}
                src={video.player.avatar_url || undefined}
                size="xs"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-warm-900 truncate">
                  {getFullName(video.player.first_name, video.player.last_name)}
                </p>
                <p className="text-xs text-warm-500">
                  {video.player.primary_position} {video.player.grad_year && `• ${video.player.grad_year}`}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start justify-between gap-2 sm:gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                <h3 className="font-semibold text-warm-900 truncate text-sm sm:text-base">{video.title}</h3>
                {video.is_primary && (
                  <Badge variant="success" className="flex items-center gap-1 text-xs">
                    <IconStar size={10} />
                    <span className="hidden sm:inline">Primary</span>
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {video.video_type && (
                  <Badge variant="secondary" className="capitalize text-xs">
                    {video.video_type.replace(/_/g, ' ')}
                  </Badge>
                )}
                {video.is_clip && (
                  <Badge variant="secondary" className="text-xs">
                    Clip
                  </Badge>
                )}
              </div>
              {video.description && (
                <p className="text-xs sm:text-sm leading-relaxed text-warm-600 line-clamp-2 mt-1">
                  {video.description}
                </p>
              )}
              <p className="text-xs text-warm-500 mt-1">
                {video.created_at && formatRelativeTime(video.created_at)} • {video.view_count || 0} views
              </p>
            </div>
          </div>

          {/* Owner Actions (Edit, Delete, Set Primary) */}
          {isOwner && !isCoach && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <Button variant="secondary" size="sm" onClick={onEdit} className="text-xs sm:text-sm">
                <IconEdit size={14} />
                <span className="hidden sm:inline ml-1">Edit</span>
              </Button>
              {!video.is_primary && (
                <Button variant="secondary" size="sm" onClick={onSetPrimary} className="text-xs sm:text-sm">
                  <IconStar size={14} />
                  <span className="hidden sm:inline ml-1">Set Primary</span>
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={onDelete} className="text-xs sm:text-sm">
                <IconTrash size={14} />
                <span className="hidden sm:inline ml-1">Delete</span>
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
