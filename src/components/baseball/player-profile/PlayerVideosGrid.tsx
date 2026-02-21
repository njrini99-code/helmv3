'use client';

import { useState } from 'react';
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

export function PlayerVideosGrid({ videos, compact = false }: PlayerVideosGridProps) {
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  if (videos.length === 0) {
    return (
      <div className="text-center py-8">
        <IconVideo size={32} className="mx-auto text-slate-300 mb-2" />
        <p className="text-sm text-slate-500">No videos uploaded</p>
        <p className="text-xs text-slate-400 mt-1">
          Videos will appear here once uploaded
        </p>
      </div>
    );
  }

  const gridCols = compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';

  return (
    <>
      <div className={`grid ${gridCols} gap-4`}>
        {videos.map((video) => (
          <button
            key={video.id}
            onClick={() => setSelectedVideo(video)}
            className="group relative aspect-video rounded-xl overflow-hidden bg-slate-100 hover:ring-2 hover:ring-primary-500 transition-all"
          >
            {video.thumbnail_url ? (
              <Image
                src={video.thumbnail_url}
                alt={video.title || 'Video thumbnail'}
                fill
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300">
                <IconVideo size={24} className="text-slate-400" />
              </div>
            )}

            {/* Overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity transform scale-75 group-hover:scale-100">
                <IconPlay size={20} className="text-slate-900 ml-0.5" />
              </div>
            </div>

            {/* Video type badge */}
            {video.video_type && (
              <div className="absolute top-2 left-2">
                <span className="px-2 py-0.5 text-micro font-medium bg-black/50 text-white rounded capitalize">
                  {video.video_type}
                </span>
              </div>
            )}

            {/* Title */}
            {!compact && video.title && (
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                <p className="text-xs text-white truncate">{video.title}</p>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Video Modal */}
      {selectedVideo && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="relative w-full max-w-4xl bg-black rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setSelectedVideo(null)}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/50 text-white hover:bg-black/70 flex items-center justify-center transition-colors"
            >
              <IconX size={20} />
            </button>

            {/* Video player */}
            {selectedVideo.video_url ? (
              <div className="aspect-video">
                <video
                  src={selectedVideo.video_url}
                  controls
                  autoPlay
                  className="w-full h-full"
                >
                  Your browser does not support the video tag.
                </video>
              </div>
            ) : (
              <div className="aspect-video flex items-center justify-center">
                <p className="text-white text-sm">Video not available</p>
              </div>
            )}

            {/* Video info */}
            <div className="p-4 bg-slate-900">
              <h3 className="font-medium text-white">
                {selectedVideo.title || 'Untitled Video'}
              </h3>
              <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
                <span className="flex items-center gap-1">
                  <IconClock size={14} />
                  {new Date(selectedVideo.created_at).toLocaleDateString()}
                </span>
                {selectedVideo.video_type && (
                  <span className="px-2 py-0.5 bg-slate-800 rounded capitalize">
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
