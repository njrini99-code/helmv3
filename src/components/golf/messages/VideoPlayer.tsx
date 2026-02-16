'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  IconPlay,
  IconPause,
  IconVolume2,
  IconVolumeX,
  IconMaximize,
  IconMinimize,
  IconX,
  IconDownload,
} from '@/components/icons';

interface VideoPlayerProps {
  url: string;
  thumbnailUrl?: string;
  fileName?: string;
  autoPlay?: boolean;
  className?: string;
  /** Inline mode (in chat bubble) vs fullscreen mode */
  inline?: boolean;
  onClose?: () => void;
}

/**
 * Full-featured video player with controls
 */
export function VideoPlayer({
  url,
  thumbnailUrl,
  fileName = 'video',
  autoPlay = false,
  className,
  inline = true,
  onClose,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(!inline);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Reset controls timeout
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    if (isPlaying && isFullscreen) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying, isFullscreen]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setIsLoading(false);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setShowControls(true);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleWaiting = () => setIsLoading(true);
    const handleCanPlay = () => setIsLoading(false);
    const handleError = () => {
      setHasError(true);
      setIsLoading(false);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    resetControlsTimeout();
  }, [isPlaying, resetControlsTimeout]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.warn('Fullscreen not supported:', err);
    }
    resetControlsTimeout();
  }, [resetControlsTimeout]);

    // Keyboard controls
  useEffect(() => {
    if (!isFullscreen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'Escape':
          if (onClose) onClose();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          video.currentTime = Math.min(duration, video.currentTime + 10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume((v) => Math.min(1, v + 0.1));
          if (videoRef.current) videoRef.current.volume = Math.min(1, volume + 0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume((v) => Math.max(0, v - 0.1));
          if (videoRef.current) videoRef.current.volume = Math.max(0, volume - 0.1);
          break;
        case 'm':
          toggleMute();
          break;
        case 'f':
          toggleFullscreen();
          break;
      }
      resetControlsTimeout();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, duration, volume, onClose, resetControlsTimeout, togglePlay, toggleMute, toggleFullscreen]);

  // Fullscreen change detection
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const newVolume = parseFloat(e.target.value);
    video.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const progress = progressRef.current;
    if (!video || !progress) return;

    const rect = progress.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = pos * duration;
    resetControlsTimeout();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Fullscreen wrapper
  if (!inline) {
    return (
      <div
        ref={containerRef}
        className="fixed inset-0 z-50 bg-black flex items-center justify-center"
        onMouseMove={resetControlsTimeout}
        onClick={resetControlsTimeout}
      >
        {/* Close button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'absolute top-4 right-4 z-20',
              'p-2 rounded-full bg-black/50 hover:bg-black/70',
              'text-white transition-all',
              showControls ? 'opacity-100' : 'opacity-0'
            )}
            aria-label="Close"
          >
            <IconX size={24} />
          </button>
        )}

        {/* Video */}
        <video
          ref={videoRef}
          src={url}
          poster={thumbnailUrl}
          className="max-w-full max-h-full"
          onClick={togglePlay}
          autoPlay={autoPlay}
        />

        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '0ms' }} />
              <span className="w-2.5 h-2.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '150ms' }} />
              <span className="w-2.5 h-2.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
            <p className="text-lg mb-2">Failed to load video</p>
            <a
              href={url}
              download={fileName}
              className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30"
            >
              Download instead
            </a>
          </div>
        )}

        {/* Controls overlay */}
        <div
          className={cn(
            'absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent',
            'transition-opacity duration-300',
            showControls ? 'opacity-100' : 'opacity-0'
          )}
        >
          {/* Progress bar */}
          <div
            ref={progressRef}
            className="w-full h-1 bg-white/30 rounded-full cursor-pointer mb-4 group"
            onClick={handleSeek}
          >
            <div
              className="h-full bg-white rounded-full relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* Control buttons */}
          <div className="flex items-center gap-4">
            {/* Play/Pause */}
            <button
              type="button"
              onClick={togglePlay}
              className="p-2 rounded-full hover:bg-white/20 text-white transition-colors"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <IconPause size={24} /> : <IconPlay size={24} />}
            </button>

            {/* Time display */}
            <div className="text-white text-sm">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Volume */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                className="p-2 rounded-full hover:bg-white/20 text-white transition-colors"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? <IconVolumeX size={20} /> : <IconVolume2 size={20} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              />
            </div>

            {/* Download */}
            <a
              href={url}
              download={fileName}
              className="p-2 rounded-full hover:bg-white/20 text-white transition-colors"
              aria-label="Download"
            >
              <IconDownload size={20} />
            </a>

            {/* Fullscreen toggle */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-full hover:bg-white/20 text-white transition-colors"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <IconMinimize size={20} /> : <IconMaximize size={20} />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Inline player
  return (
    <div
      ref={containerRef}
      className={cn('relative rounded-lg overflow-hidden bg-black', className)}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => !isPlaying && setShowControls(true)}
    >
      <video
        ref={videoRef}
        src={url}
        poster={thumbnailUrl}
        className="w-full aspect-video object-contain"
        onClick={togglePlay}
        autoPlay={autoPlay}
      />

      {/* Loading indicator */}
      {isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      )}

      {/* Play button overlay (when paused) */}
      {!isPlaying && !isLoading && !hasError && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
          onClick={togglePlay}
        >
          <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
            <IconPlay size={24} className="text-warm-900 ml-1" />
          </div>
        </div>
      )}

      {/* Inline controls */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent',
          'transition-opacity duration-200',
          showControls && (isPlaying || !isLoading) ? 'opacity-100' : 'opacity-0'
        )}
      >
        {/* Mini progress bar */}
        <div
          ref={progressRef}
          className="w-full h-1 bg-white/30 rounded-full cursor-pointer mb-2"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-white rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className="p-1 rounded hover:bg-white/20 text-white"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
          </button>

          <span className="text-white text-xs">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            className="p-1 rounded hover:bg-white/20 text-white"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <IconVolumeX size={16} /> : <IconVolume2 size={16} />}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            className="p-1 rounded hover:bg-white/20 text-white"
            aria-label="Fullscreen"
          >
            <IconMaximize size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Full-screen video player modal
 */
export function VideoPlayerModal({
  url,
  thumbnailUrl,
  fileName,
  onClose,
}: {
  url: string;
  thumbnailUrl?: string;
  fileName?: string;
  onClose: () => void;
}) {
  return (
    <VideoPlayer
      url={url}
      thumbnailUrl={thumbnailUrl}
      fileName={fileName}
      autoPlay
      inline={false}
      onClose={onClose}
    />
  );
}
