'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface VideoPlayerProps {
  src: string;
  thumbnail?: string | null;
  title?: string;
  autoPlay?: boolean;
  className?: string;
  onView?: () => void;
  onError?: () => void;
  /** When set with clipEnd, the player seeks here on load and clamps playback
   * to [clipStart, clipEnd] instead of playing the full parent video. Used for
   * "clip" rows whose url is the same file as the parent video. */
  clipStart?: number;
  /** When set with clipStart, playback auto-pauses once currentTime reaches
   * this bound (mirrors VideoClipper's preview clamp). */
  clipEnd?: number;
}

export function VideoPlayer({
  src,
  thumbnail,
  title,
  autoPlay = false,
  className,
  onView,
  onError,
  clipStart,
  clipEnd,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [, setIsPlaying] = useState(false);
  const [hasViewed, setHasViewed] = useState(false);
  const [error, setError] = useState(false);

  const hasClipBounds = typeof clipStart === 'number' && typeof clipEnd === 'number' && clipEnd > clipStart;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      setIsPlaying(true);
      if (!hasViewed) {
        setHasViewed(true);
        onView?.();
      }
    };

    const handlePause = () => setIsPlaying(false);
    const handleError = () => {
      setError(true);
      onError?.();
    };
    const handleLoadedMetadata = () => {
      if (hasClipBounds) {
        video.currentTime = clipStart;
      }
    };
    const handleTimeUpdate = () => {
      if (!hasClipBounds) return;
      if (video.currentTime < clipStart) {
        video.currentTime = clipStart;
      } else if (video.currentTime >= clipEnd) {
        video.pause();
        video.currentTime = clipEnd;
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('error', handleError);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);

    // If metadata already loaded before this effect ran (e.g. cached video),
    // seek immediately rather than waiting for the event.
    if (hasClipBounds && video.readyState >= 1) {
      video.currentTime = clipStart;
    }

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleError);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [hasViewed, onView, onError, hasClipBounds, clipStart, clipEnd]);

  if (error) {
    return (
      <div className={cn('relative rounded-xl overflow-hidden bg-warm-100 aspect-video flex items-center justify-center', className)}>
        <div className="text-center p-4">
          <p className="text-warm-500 text-sm">Unable to load video</p>
          <p className="text-warm-400 text-xs mt-1">The video may have been removed or is unavailable</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative rounded-xl overflow-hidden bg-black aspect-video', className)}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- user-uploaded video content, no captions available */}
      <video
        ref={videoRef}
        src={src}
        poster={thumbnail || undefined}
        controls
        autoPlay={autoPlay}
        playsInline
        className="w-full h-full object-contain"
        title={title}
      />
    </div>
  );
}
