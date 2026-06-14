'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { IconVideo, IconPlay, IconClock, IconEye } from '@/components/icons';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Button, IconButton } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from '@/components/ui/drawer';

interface Video {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  url: string | null; // Database uses 'url' not 'video_url'
  duration: number | null;
  view_count: number | null; // Database uses 'view_count' not 'views'
  created_at: string | null;
  is_primary: boolean | null;
  video_type: string | null;
  player_id: string;
}

interface VideoShowcaseProps {
  playerId: string;
  maxVideos?: number;
  showViewAll?: boolean;
  onViewAll?: () => void;
  className?: string;
}

export function VideoShowcase({
  playerId,
  maxVideos = 4,
  showViewAll = true,
  onViewAll,
  className,
}: VideoShowcaseProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  useEffect(() => {
    async function fetchVideos() {
      const supabase = createClient();
      const { data } = await supabase
        .from('baseball_videos')
        .select('*')
        .eq('player_id', playerId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(maxVideos);

      setVideos(data || []);
      setLoading(false);
    }

    fetchVideos();
  }, [playerId, maxVideos]);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatViews = (viewCount: number | null) => {
    if (!viewCount) return '0';
    if (viewCount >= 1000) return `${(viewCount / 1000).toFixed(1)}k`;
    return viewCount.toString();
  };

  if (loading) {
    return (
      <div className={cn('relative glass-standard rounded-2xl overflow-clip p-6', className)}>
        <div className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
          }}
        />
        <div className="relative animate-pulse space-y-4">
          <div className="h-6 bg-warm-200 rounded w-1/3"></div>
          <div className="grid grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-32 bg-warm-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className={cn('relative glass-subtle rounded-2xl overflow-clip p-8 text-center', className)}>
        <div className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
          }}
        />
        <div className="relative">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-warm-100 flex items-center justify-center mb-4">
            <IconVideo size={28} className="text-warm-400" />
          </div>
          <h3 className="text-sm font-semibold text-warm-700 mb-2">
            No Videos Yet
          </h3>
          <p className="text-sm leading-relaxed text-warm-500">
            This player hasn't uploaded any videos yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={cn('relative glass-standard rounded-2xl overflow-clip', className)}>
        <div className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
          }}
        />
        {/* Header */}
        <div className="relative px-6 py-4 border-b border-warm-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <IconVideo size={20} className="text-primary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-warm-900">Video Highlights</h3>
              <p className="text-xs text-warm-500">{videos.length} {videos.length === 1 ? 'video' : 'videos'}</p>
            </div>
          </div>
          {showViewAll && videos.length > 0 && (
            <Button variant="ghost"
              onClick={onViewAll}
              className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
            >
              View All →
            </Button>
          )}
        </div>

        {/* Video Grid */}
        <div className="relative p-6">
          <div className="grid grid-cols-2 gap-4">
            {videos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                formatDuration={formatDuration}
                formatViews={formatViews}
                onClick={() => setSelectedVideo(video)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Video Modal */}
      <VideoModal
        video={selectedVideo}
        onClose={() => setSelectedVideo(null)}
      />
    </>
  );
}

interface VideoCardProps {
  video: Video;
  formatDuration: (seconds: number | null) => string;
  formatViews: (views: number | null) => string;
  onClick: () => void;
}

function VideoCard({ video, formatDuration, formatViews, onClick }: VideoCardProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <Button variant="ghost"
      onClick={onClick}
      className="group relative bg-warm-100 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300 aspect-video"
    >
      {/* Thumbnail */}
      {video.thumbnail_url && !imageError ? (
        <img
          src={video.thumbnail_url}
          alt={video.title}
          onError={() => setImageError(true)}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-warm-200">
          <IconVideo size={32} className="text-warm-400" />
        </div>
      )}

      {/* Overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-warm-900/80 via-warm-900/20 to-transparent opacity-100 group-hover:opacity-100 transition-opacity">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-cream-50/92 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
            <IconPlay size={20} className="text-warm-900 ml-0.5" />
          </div>
        </div>

        {/* Info */}
        <div className="absolute bottom-0 left-0 right-0 p-3 space-y-1">
          <p className="text-white font-medium text-sm line-clamp-1">
            {video.title}
          </p>
          <div className="flex items-center gap-3 text-xs text-white/80">
            {video.duration && (
              <span className="flex items-center gap-1">
                <IconClock size={12} />
                {formatDuration(video.duration)}
              </span>
            )}
            {video.view_count !== null && (
              <span className="flex items-center gap-1">
                <IconEye size={12} />
                {formatViews(video.view_count)}
              </span>
            )}
          </div>
        </div>

        {/* Primary Badge */}
        {video.is_primary && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cream-50/92 backdrop-blur-sm border border-warm-200/60 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600" />
            <span className="text-xs font-medium text-warm-700">Primary</span>
          </div>
        )}
      </div>
    </Button>
  );
}

interface VideoModalProps {
  video: Video | null;
  onClose: () => void;
}

function VideoModal({ video, onClose }: VideoModalProps) {
  return (
    <Drawer
      open={video !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent className="sm:max-w-4xl sm:mx-auto sm:rounded-3xl p-0 overflow-hidden">
        {/* Video Player */}
        <div className="relative aspect-video bg-warm-900">
          {video?.url ? (
            <iframe
              src={video.url}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center text-white">
                <IconVideo size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-sm">Video not available</p>
              </div>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-6 border-t border-warm-100">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <DrawerTitle className="text-xl font-semibold text-warm-900 mb-2">
                {video?.title}
              </DrawerTitle>
              {video?.description && (
                <p className="text-sm leading-relaxed text-warm-600 leading-relaxed">
                  {video.description}
                </p>
              )}
            </div>
            <IconButton variant="default"
              onClick={onClose}
              aria-label="Close video"
              className="ml-4 p-2 rounded-lg hover:bg-warm-100 transition-colors"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-warm-400"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </IconButton>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-4 text-sm text-warm-500">
            {video?.video_type && (
              <span className="px-2.5 py-1 bg-warm-100 rounded-full text-xs font-medium">
                {video.video_type}
              </span>
            )}
            {video?.created_at && (
              <span>
                Uploaded {formatDistanceToNow(new Date(video.created_at), { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
