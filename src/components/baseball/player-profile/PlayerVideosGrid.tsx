'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { IconVideo, IconPlay, IconClock, IconX } from '@/components/icons';

interface Video {
  id: string;
  title: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  created_at: string;
  video_type?: string;
}

interface PlayerVideosGridProps {
  videos: Video[];
  compact?: boolean;
}

type VideoTab = 'all' | string;

export function PlayerVideosGrid({ videos, compact = false }: PlayerVideosGridProps) {
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [activeTab, setActiveTab] = useState<VideoTab>('all');

  // Build available tabs from the video set
  const tabs = useMemo(() => {
    const typeCounts = new Map<string, number>();
    for (const v of videos) {
      if (v.video_type) {
        typeCounts.set(v.video_type, (typeCounts.get(v.video_type) ?? 0) + 1);
      }
    }

    const result: Array<{ key: VideoTab; label: string; count: number }> = [
      { key: 'all', label: 'All', count: videos.length },
    ];

    // Add game, scrimmage, practice in preferred order if they have videos
    const orderedTypes = ['game', 'scrimmage', 'practice'];
    for (const t of orderedTypes) {
      if (typeCounts.has(t)) {
        result.push({ key: t, label: t.charAt(0).toUpperCase() + t.slice(1), count: typeCounts.get(t) ?? 0 });
      }
    }
    // Add any other types that aren't in the standard list
    for (const [type, count] of typeCounts) {
      if (!orderedTypes.includes(type)) {
        result.push({ key: type, label: type.charAt(0).toUpperCase() + type.slice(1), count });
      }
    }

    return result;
  }, [videos]);

  // Filter videos based on active tab
  const filteredVideos = useMemo(() => {
    if (activeTab === 'all') return videos;
    return videos.filter((v) => v.video_type === activeTab);
  }, [videos, activeTab]);

  if (videos.length === 0) {
    return (
      <div className="text-center py-10">
        <IconVideo size={32} className="mx-auto text-slate-300 mb-2" />
        <p className="text-sm font-medium text-slate-500">No videos uploaded yet</p>
        <p className="text-xs text-slate-400 mt-1">
          Videos will appear here once uploaded
        </p>
      </div>
    );
  }

  const gridCols = compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
  const showTabs = !compact && tabs.length > 1;

  return (
    <>
      {/* Sub-tabs — only shown when not compact and there are multiple types */}
      {showTabs && (
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-hide">
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            {tabs.map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === key
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {label}
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  activeTab === key ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'
                }`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty filtered state */}
      {filteredVideos.length === 0 && (
        <div className="text-center py-8">
          <IconVideo size={28} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">
            No {activeTab !== 'all' ? activeTab : ''} videos
          </p>
        </div>
      )}

      {/* Video grid */}
      {filteredVideos.length > 0 && (
        <div className={`grid ${gridCols} gap-4`}>
          {filteredVideos.map((video) => (
            <button
              key={video.id}
              onClick={() => setSelectedVideo(video)}
              className="group relative aspect-video rounded-xl overflow-hidden bg-slate-100
                         hover:ring-2 hover:ring-primary-500 transition-all"
            >
              {video.thumbnail_url ? (
                <Image
                  src={video.thumbnail_url}
                  alt={video.title ?? 'Video thumbnail'}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300">
                  <IconVideo size={24} className="text-slate-400" />
                </div>
              )}

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center
                                opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-200">
                  <IconPlay size={20} className="text-slate-900 ml-0.5" />
                </div>
              </div>

              {/* Video type badge */}
              {video.video_type && (
                <div className="absolute top-2 left-2">
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-black/50 text-white rounded capitalize">
                    {video.video_type}
                  </span>
                </div>
              )}

              {/* Title */}
              {!compact && video.title && (
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                  <p className="text-xs text-white font-medium truncate">{video.title}</p>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Video modal */}
      {selectedVideo && (
        <div
          className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="relative w-full max-w-4xl bg-slate-900 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={() => setSelectedVideo(null)}
              className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/50 text-white
                         hover:bg-black/70 flex items-center justify-center transition-colors"
            >
              <IconX size={18} />
            </button>

            {/* Player */}
            <div className="aspect-video bg-black">
              {selectedVideo.video_url ? (
                <video
                  src={selectedVideo.video_url}
                  controls
                  autoPlay
                  className="w-full h-full"
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <p className="text-slate-400 text-sm">Video unavailable</p>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="px-5 py-4 bg-slate-900">
              <h3 className="font-semibold text-white text-base">
                {selectedVideo.title ?? 'Untitled Video'}
              </h3>
              <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-400">
                <span className="flex items-center gap-1.5">
                  <IconClock size={13} />
                  {new Date(selectedVideo.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                {selectedVideo.video_type && (
                  <span className="px-2 py-0.5 bg-slate-800 rounded-md capitalize text-xs">
                    {selectedVideo.video_type}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
