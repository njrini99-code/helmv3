'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  IconDownload,
  IconPlay,
  IconPause,
  IconFile,
  IconVideo,
  IconZoomIn,
  IconMusic,
  IconVolume2,
  IconVolumeX,
  IconMaximize,
  IconX,
  IconChevronLeft,
  IconChevronRight,
} from '@/components/icons';
import {
  formatFileSize,
  isImage,
  isVideo,
  isAudio,
  isPreviewable,
  type AttachmentFileType,
} from '@/lib/storage/attachments';

export interface MessageAttachmentData {
  id: string;
  fileName: string;
  fileType: AttachmentFileType;
  mimeType: string;
  fileSize: number;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

interface MessageAttachmentProps {
  attachment: MessageAttachmentData;
  isOwnMessage?: boolean;
  className?: string;
}

/**
 * Component to display an attachment within a message
 */
export function MessageAttachment({
  attachment,
  isOwnMessage = false,
  className,
}: MessageAttachmentProps) {
  const { fileName, mimeType, fileSize, url, thumbnailUrl, width, height, durationSeconds } = attachment;
  const isImageFile = isImage(mimeType);
  const isVideoFile = isVideo(mimeType);
  const isAudioFile = isAudio(mimeType);

  // Image attachment
  if (isImageFile) {
    return (
      <ImageAttachment
        url={url}
        fileName={fileName}
        width={width}
        height={height}
        isOwnMessage={isOwnMessage}
        className={className}
      />
    );
  }

  // Video attachment
  if (isVideoFile) {
    return (
      <VideoAttachment
        url={url}
        thumbnailUrl={thumbnailUrl}
        fileName={fileName}
        durationSeconds={durationSeconds}
        isOwnMessage={isOwnMessage}
        className={className}
      />
    );
  }

  // Audio attachment
  if (isAudioFile) {
    return (
      <AudioAttachment
        url={url}
        fileName={fileName}
        durationSeconds={durationSeconds}
        isOwnMessage={isOwnMessage}
        className={className}
      />
    );
  }

  // Document/other file attachment
  return (
    <DocumentAttachment
      url={url}
      fileName={fileName}
      mimeType={mimeType}
      fileSize={fileSize}
      isOwnMessage={isOwnMessage}
      className={className}
    />
  );
}

interface ImageAttachmentProps {
  url: string;
  fileName: string;
  width?: number;
  height?: number;
  className?: string;
}

function ImageAttachment({ url, fileName, width, height, className }: ImageAttachmentProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  return (
    <>
      <div
        className={cn(
          'relative group rounded-lg overflow-hidden cursor-pointer',
          'max-w-[280px]',
          className
        )}
        onClick={() => setIsExpanded(true)}
      >
        {isLoading && (
          <div className="absolute inset-0 bg-slate-100 animate-pulse" />
        )}
        <img
          src={url}
          alt={fileName}
          className={cn(
            'max-w-full rounded-lg',
            isLoading ? 'opacity-0' : 'opacity-100'
          )}
          style={width && height ? { aspectRatio: `${width}/${height}` } : undefined}
          onLoad={() => setIsLoading(false)}
        />
        {/* Expand overlay */}
        <div
          className={cn(
            'absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors',
            'flex items-center justify-center opacity-0 group-hover:opacity-100'
          )}
        >
          <IconZoomIn size={24} className="text-white drop-shadow-lg" />
        </div>
      </div>

      {/* Lightbox */}
      {isExpanded && (
        <ImageLightbox
          url={url}
          fileName={fileName}
          onClose={() => setIsExpanded(false)}
        />
      )}
    </>
  );
}

interface VideoAttachmentProps {
  url: string;
  thumbnailUrl?: string;
  fileName: string;
  durationSeconds?: number;
  className?: string;
}

function VideoAttachment({
  url,
  thumbnailUrl,
  fileName,
  durationSeconds,
  className,
}: VideoAttachmentProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isPlaying) {
    return (
      <div className={cn('relative rounded-lg overflow-hidden max-w-[320px]', className)}>
        <video
          src={url}
          controls
          autoPlay
          className="w-full rounded-lg"
          onEnded={() => setIsPlaying(false)}
        >
          Your browser does not support video playback.
        </video>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative group rounded-lg overflow-hidden cursor-pointer',
        'max-w-[280px] bg-slate-900',
        className
      )}
      onClick={() => setIsPlaying(true)}
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={fileName}
          className="w-full aspect-video object-cover opacity-80"
        />
      ) : (
        <div className="w-full aspect-video flex items-center justify-center">
          <IconVideo size={32} className="text-slate-400" />
        </div>
      )}

      {/* Play button overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className={cn(
            'w-12 h-12 rounded-full bg-white/90 flex items-center justify-center',
            'group-hover:scale-110 transition-transform shadow-lg'
          )}
        >
          <IconPlay size={20} className="text-slate-900 ml-1" />
        </div>
      </div>

      {/* Duration badge */}
      {durationSeconds && (
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-xs">
          {formatDuration(durationSeconds)}
        </div>
      )}
    </div>
  );
}

interface AudioAttachmentProps {
  url: string;
  fileName: string;
  durationSeconds?: number;
  isOwnMessage?: boolean;
  className?: string;
}

function AudioAttachment({
  url,
  fileName,
  durationSeconds,
  isOwnMessage,
  className,
}: AudioAttachmentProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds || 0);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(!isMuted);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg',
        isOwnMessage
          ? 'bg-green-700/50'
          : 'bg-slate-200/70',
        'w-64',
        className
      )}
    >
      <audio ref={audioRef} src={url} preload="metadata" />

      {/* Play/Pause button */}
      <button
        type="button"
        onClick={togglePlay}
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
          'transition-colors duration-200',
          isOwnMessage
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-purple-100 hover:bg-purple-200 text-purple-600'
        )}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <IconPause size={18} /> : <IconPlay size={18} className="ml-0.5" />}
      </button>

      {/* Progress and info */}
      <div className="flex-1 min-w-0">
        {/* File name */}
        <p
          className={cn(
            'text-xs font-medium truncate mb-1',
            isOwnMessage ? 'text-white' : 'text-slate-700'
          )}
        >
          {fileName}
        </p>

        {/* Progress bar */}
        <div className="relative">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className={cn(
              'w-full h-1 rounded-full appearance-none cursor-pointer',
              isOwnMessage ? 'bg-white/20' : 'bg-slate-300',
              '[&::-webkit-slider-thumb]:appearance-none',
              '[&::-webkit-slider-thumb]:w-3',
              '[&::-webkit-slider-thumb]:h-3',
              '[&::-webkit-slider-thumb]:rounded-full',
              isOwnMessage
                ? '[&::-webkit-slider-thumb]:bg-white'
                : '[&::-webkit-slider-thumb]:bg-purple-600'
            )}
            style={{
              background: `linear-gradient(to right, ${isOwnMessage ? 'rgba(255,255,255,0.8)' : '#9333ea'} ${progress}%, ${isOwnMessage ? 'rgba(255,255,255,0.2)' : '#e2e8f0'} ${progress}%)`,
            }}
          />
        </div>

        {/* Time display */}
        <div
          className={cn(
            'flex items-center justify-between text-xs mt-1',
            isOwnMessage ? 'text-green-200' : 'text-slate-500'
          )}
        >
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Mute button */}
      <button
        type="button"
        onClick={toggleMute}
        className={cn(
          'p-1.5 rounded-full transition-colors flex-shrink-0',
          isOwnMessage
            ? 'text-white/70 hover:text-white hover:bg-white/10'
            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
        )}
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? <IconVolumeX size={16} /> : <IconVolume2 size={16} />}
      </button>
    </div>
  );
}

interface DocumentAttachmentProps {
  url: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  isOwnMessage?: boolean;
  className?: string;
}

function DocumentAttachment({
  url,
  fileName,
  mimeType,
  fileSize,
  isOwnMessage,
  className,
}: DocumentAttachmentProps) {
  const handleDownload = () => {
    window.open(url, '_blank');
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg cursor-pointer',
        'transition-colors duration-200',
        isOwnMessage
          ? 'bg-green-700/50 hover:bg-green-700/60'
          : 'bg-slate-200/70 hover:bg-slate-200',
        className
      )}
      onClick={handleDownload}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleDownload()}
    >
      {/* File icon */}
      <div
        className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
          isOwnMessage ? 'bg-white/20' : 'bg-white'
        )}
      >
        <FileTypeIcon mimeType={mimeType} isOwnMessage={isOwnMessage} />
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm font-medium truncate',
            isOwnMessage ? 'text-white' : 'text-slate-700'
          )}
        >
          {fileName}
        </p>
        <p
          className={cn(
            'text-xs',
            isOwnMessage ? 'text-green-200' : 'text-slate-500'
          )}
        >
          {formatFileSize(fileSize)}
        </p>
      </div>

      {/* Download icon */}
      <IconDownload
        size={18}
        className={cn(isOwnMessage ? 'text-white/70' : 'text-slate-400')}
      />
    </div>
  );
}

function FileTypeIcon({ mimeType, isOwnMessage }: { mimeType: string; isOwnMessage?: boolean }) {
  const baseClass = isOwnMessage ? 'text-white' : 'text-slate-500';

  if (mimeType.includes('pdf')) {
    return <span className={cn('text-xs font-bold', isOwnMessage ? 'text-white' : 'text-red-500')}>PDF</span>;
  }
  if (mimeType.includes('word')) {
    return <span className={cn('text-xs font-bold', isOwnMessage ? 'text-white' : 'text-blue-500')}>DOC</span>;
  }
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
    return <span className={cn('text-xs font-bold', isOwnMessage ? 'text-white' : 'text-green-600')}>XLS</span>;
  }
  return <IconFile size={20} className={baseClass} />;
}

interface ImageLightboxProps {
  url: string;
  fileName: string;
  onClose: () => void;
}

function ImageLightbox({ url, fileName, onClose }: ImageLightboxProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case '+':
        case '=':
          setScale((s) => Math.min(s + 0.25, 4));
          break;
        case '-':
          setScale((s) => Math.max(s - 0.25, 0.5));
          break;
        case '0':
          setScale(1);
          setPosition({ x: 0, y: 0 });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Handle mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((s) => Math.min(Math.max(s + delta, 0.5), 4));
  };

  // Handle drag for panning when zoomed
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch events for mobile pinch-to-zoom
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setLastTouchDistance(distance);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistance !== null) {
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = (distance - lastTouchDistance) * 0.01;
      setScale((s) => Math.min(Math.max(s + delta, 0.5), 4));
      setLastTouchDistance(distance);
    }
  };

  const handleTouchEnd = () => {
    setLastTouchDistance(null);
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === containerRef.current) onClose();
      }}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className={cn(
          'absolute top-4 right-4 z-10',
          'p-2 rounded-full bg-black/50 hover:bg-black/70',
          'text-white transition-colors'
        )}
        aria-label="Close"
      >
        <IconX size={24} />
      </button>

      {/* Zoom controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setScale((s) => Math.max(s - 0.25, 0.5))}
          className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
          aria-label="Zoom out"
        >
          <IconZoomIn size={20} className="rotate-180" />
        </button>
        <span className="px-2 py-1 rounded bg-black/50 text-white text-sm">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setScale((s) => Math.min(s + 0.25, 4))}
          className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
          aria-label="Zoom in"
        >
          <IconZoomIn size={20} />
        </button>
      </div>

      {/* Image */}
      <div
        className={cn(
          'relative max-w-full max-h-full overflow-hidden',
          scale > 1 ? 'cursor-grab' : 'cursor-default',
          isDragging && 'cursor-grabbing'
        )}
        onMouseDown={handleMouseDown}
      >
        <img
          src={url}
          alt={fileName}
          className="max-w-full max-h-[90vh] object-contain select-none"
          style={{
            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Download button */}
      <a
        href={url}
        download={fileName}
        className={cn(
          'absolute bottom-4 right-4 z-10',
          'px-4 py-2 rounded-lg bg-white/90 hover:bg-white',
          'text-sm font-medium text-slate-700',
          'flex items-center gap-2 transition-colors shadow-lg'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <IconDownload size={18} />
        Download
      </a>

      {/* Keyboard shortcuts hint */}
      <div className="absolute bottom-4 left-4 z-10 text-white/50 text-xs">
        <span>Scroll to zoom | + / - to zoom | 0 to reset | Esc to close</span>
      </div>
    </div>
  );
}

/**
 * Renders multiple attachments in a message
 */
export function MessageAttachments({
  attachments,
  isOwnMessage,
  className,
}: {
  attachments: MessageAttachmentData[];
  isOwnMessage?: boolean;
  className?: string;
}) {
  if (!attachments || attachments.length === 0) return null;

  // Single attachment
  if (attachments.length === 1) {
    return (
      <MessageAttachment
        attachment={attachments[0]}
        isOwnMessage={isOwnMessage}
        className={className}
      />
    );
  }

  // Multiple attachments - grid layout
  const imageAttachments = attachments.filter((a) => isPreviewable(a.mimeType));
  const otherAttachments = attachments.filter((a) => !isPreviewable(a.mimeType));

  return (
    <div className={cn('space-y-2', className)}>
      {/* Image/video grid */}
      {imageAttachments.length > 0 && (
        <div
          className={cn(
            'grid gap-1',
            imageAttachments.length === 2 && 'grid-cols-2',
            imageAttachments.length >= 3 && 'grid-cols-2'
          )}
        >
          {imageAttachments.map((attachment) => (
            <MessageAttachment
              key={attachment.id}
              attachment={attachment}
              isOwnMessage={isOwnMessage}
            />
          ))}
        </div>
      )}

      {/* Documents */}
      {otherAttachments.map((attachment) => (
        <MessageAttachment
          key={attachment.id}
          attachment={attachment}
          isOwnMessage={isOwnMessage}
        />
      ))}
    </div>
  );
}
