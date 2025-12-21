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
}

export function VideoPlayer({ 
  src, 
  thumbnail, 
  title, 
  autoPlay = false, 
  className, 
  onView,
  onError 
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [, setIsPlaying] = useState(false);
  const [hasViewed, setHasViewed] = useState(false);
  const [error, setError] = useState(false);

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

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleError);
    };
  }, [hasViewed, onView, onError]);

  if (error) {
    return (
      <div className={cn('relative rounded-xl overflow-hidden bg-gray-100 aspect-video flex items-center justify-center', className)}>
        <div className="text-center p-4">
          <p className="text-gray-500 text-sm">Unable to load video</p>
          <p className="text-gray-400 text-xs mt-1">The video may have been removed or is unavailable</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative rounded-xl overflow-hidden bg-black aspect-video', className)}>
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
