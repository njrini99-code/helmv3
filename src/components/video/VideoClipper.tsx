'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  formatTime,
  validateClipRange,
  createClipMetadataOnly,
  generateThumbnail,
  type ClipRange,
} from '@/lib/video/clipper';
import type { Video } from '@/lib/types';

interface VideoClipperProps {
  video: Video;
  onClipCreated?: (clip: Video) => void;
  onCancel?: () => void;
}

const clipTypes = [
  { value: 'at_bat', label: 'At-Bat' },
  { value: 'pitch', label: 'Pitch' },
  { value: 'fielding_play', label: 'Fielding Play' },
  { value: 'running', label: 'Running' },
  { value: 'highlight', label: 'Highlight' },
  { value: 'other', label: 'Other' },
];

export function VideoClipper({ video, onClipCreated, onCancel }: VideoClipperProps) {
  const { user } = useAuthStore();
  const supabase = createClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [clipRange, setClipRange] = useState<ClipRange>({ startTime: 0, endTime: 0 });
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    clipType: '',
  });

  // Load video duration
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const handleLoadedMetadata = () => {
      setDuration(videoEl.duration);
      setClipRange({ startTime: 0, endTime: Math.min(30, videoEl.duration) });
    };

    const handleTimeUpdate = () => {
      setCurrentTime(videoEl.currentTime);
      // Auto-pause at clip end during preview
      if (isPlaying && videoEl.currentTime >= clipRange.endTime) {
        videoEl.pause();
        setIsPlaying(false);
      }
    };

    videoEl.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoEl.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      videoEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoEl.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [clipRange.endTime, isPlaying]);

  // Handle timeline click/drag
  const handleTimelineInteraction = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      if (!timelineRef.current || !duration) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const time = (x / rect.width) * duration;

      if (isDragging === 'start') {
        setClipRange((prev) => ({
          ...prev,
          startTime: Math.min(time, prev.endTime - 1),
        }));
      } else if (isDragging === 'end') {
        setClipRange((prev) => ({
          ...prev,
          endTime: Math.max(time, prev.startTime + 1),
        }));
      }
    },
    [duration, isDragging]
  );

  // Mouse move/up handlers for dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      handleTimelineInteraction(e);
    };

    const handleMouseUp = () => {
      setIsDragging(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleTimelineInteraction]);

  const handlePlayPause = () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (isPlaying) {
      videoEl.pause();
    } else {
      videoEl.currentTime = clipRange.startTime;
      videoEl.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handlePreviewClip = () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    videoEl.currentTime = clipRange.startTime;
    videoEl.play();
    setIsPlaying(true);
  };

  const handleSeekToStart = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = clipRange.startTime;
      setCurrentTime(clipRange.startTime);
    }
  };

  const handleSeekToEnd = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = clipRange.endTime;
      setCurrentTime(clipRange.endTime);
    }
  };

  const handleSetStartFromCurrent = () => {
    setClipRange((prev) => ({
      ...prev,
      startTime: Math.min(currentTime, prev.endTime - 1),
    }));
  };

  const handleSetEndFromCurrent = () => {
    setClipRange((prev) => ({
      ...prev,
      endTime: Math.max(currentTime, prev.startTime + 1),
    }));
  };

  const handleSaveClip = async () => {
    if (!user || !video.player_id || !video.url) return;

    // Validate
    const validationError = validateClipRange(clipRange, duration);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!form.title.trim()) {
      setError('Please enter a title for the clip');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Generate thumbnail at clip start
      const thumbnailDataUrl = await generateThumbnail(video.url, clipRange.startTime);

      // Create clip metadata (referencing parent video with time range)
      const clipData = await createClipMetadataOnly(video.id, clipRange, {
        title: form.title,
        description: form.description,
        clipType: form.clipType,
        parentVideoId: video.id,
      });

      // Save clip to database
      const { data: newClip, error: insertError } = await supabase
        .from('baseball_videos')
        .insert({
          player_id: video.player_id,
          title: clipData.title,
          description: clipData.description || null,
          video_type: clipData.clip_type || 'highlight',
          url: video.url, // Use same URL as parent
          thumbnail_url: thumbnailDataUrl,
          is_clip: true,
          parent_video_id: clipData.parent_video_id,
          clip_start_time: clipData.clip_start_time,
          clip_end_time: clipData.clip_end_time,
          duration: clipData.clip_end_time - clipData.clip_start_time,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      onClipCreated?.(newClip);
    } catch (err) {
      console.error('Error saving clip:', err);
      setError(err instanceof Error ? err.message : 'Failed to save clip');
    } finally {
      setSaving(false);
    }
  };

  const clipDuration = clipRange.endTime - clipRange.startTime;
  const startPercent = duration ? (clipRange.startTime / duration) * 100 : 0;
  const endPercent = duration ? (clipRange.endTime / duration) * 100 : 100;
  const currentPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-white rounded-2xl border border-warm-200 overflow-hidden">
      {/* Video Preview */}
      <div className="relative bg-black aspect-video">
        <video
          ref={videoRef}
          src={video.url ?? undefined}
          className="w-full h-full object-contain"
          onClick={handlePlayPause}
        />

        {/* Play/Pause Overlay */}
        <Button variant="primary"
          onClick={handlePlayPause}
          className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity"
        >
          <div className="w-16 h-16 rounded-full bg-cream-50/92 flex items-center justify-center">
            {isPlaying ? (
              <svg className="w-6 h-6 text-warm-900" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-warm-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </div>
        </Button>
      </div>

      {/* Timeline */}
      <div className="p-4 bg-warm-50 border-b border-warm-200">
        <div className="mb-2 flex items-center justify-between text-xs text-warm-500">
          <span>{formatTime(0)}</span>
          <span className="font-medium text-warm-900">
            Clip: {formatTime(clipRange.startTime)} - {formatTime(clipRange.endTime)} ({formatTime(clipDuration)})
          </span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Timeline Track */}
        <div
          ref={timelineRef}
          className="relative h-12 bg-warm-200 rounded-lg cursor-pointer"
          onClick={(e) => {
            if (!timelineRef.current || !duration) return;
            const rect = timelineRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const time = (x / rect.width) * duration;
            if (videoRef.current) {
              videoRef.current.currentTime = time;
              setCurrentTime(time);
            }
          }}
        >
          {/* Selected Range */}
          <div
            className="absolute top-0 bottom-0 bg-primary-500/30 border-y-2 border-primary-500"
            style={{
              left: `${startPercent}%`,
              width: `${endPercent - startPercent}%`,
            }}
          />

          {/* Start Handle */}
          <div
            className={cn(
              'absolute top-0 bottom-0 w-3 cursor-ew-resize transition-colors',
              isDragging === 'start' ? 'bg-primary-700' : 'bg-primary-600 hover:bg-primary-700'
            )}
            style={{ left: `calc(${startPercent}% - 6px)` }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setIsDragging('start');
            }}
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-full" />
          </div>

          {/* End Handle */}
          <div
            className={cn(
              'absolute top-0 bottom-0 w-3 cursor-ew-resize transition-colors',
              isDragging === 'end' ? 'bg-primary-700' : 'bg-primary-600 hover:bg-primary-700'
            )}
            style={{ left: `calc(${endPercent}% - 6px)` }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setIsDragging('end');
            }}
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-full" />
          </div>

          {/* Current Time Indicator */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none"
            style={{ left: `${currentPercent}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full" />
          </div>
        </div>

        {/* Controls */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost"
              onClick={handleSeekToStart}
              className="px-2 py-1 text-xs font-medium text-warm-600 hover:text-warm-900 hover:bg-warm-100 rounded"
            >
              Go to Start
            </Button>
            <Button variant="primary"
              onClick={handleSetStartFromCurrent}
              className="px-2 py-1 text-xs font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded"
            >
              Set Start Here
            </Button>
          </div>

          <Button variant="primary"
            onClick={handlePreviewClip}
            className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
          >
            Preview Clip
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="primary"
              onClick={handleSetEndFromCurrent}
              className="px-2 py-1 text-xs font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded"
            >
              Set End Here
            </Button>
            <Button variant="ghost"
              onClick={handleSeekToEnd}
              className="px-2 py-1 text-xs font-medium text-warm-600 hover:text-warm-900 hover:bg-warm-100 rounded"
            >
              Go to End
            </Button>
          </div>
        </div>
      </div>

      {/* Clip Details Form */}
      <div className="p-6 space-y-4">
        <h3 className="font-semibold text-warm-900">Clip Details</h3>

        <Input
          label="Clip Title *"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g., Double to Left Field"
        />

        <Select
          label="Clip Type"
          options={clipTypes}
          value={form.clipType}
          onChange={(value) => setForm((f) => ({ ...f, clipType: value }))}
          placeholder="Select clip type"
        />

        <Textarea
          label="Description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Add context - game situation, what happened..."
          rows={2}
        />

        {error && (
          <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          {onCancel && (
            <Button variant="secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          )}
          <Button onClick={handleSaveClip} isLoading={saving} disabled={!form.title.trim()}>
            {saving ? 'Saving...' : 'Save Clip'}
          </Button>
        </div>
      </div>
    </div>
  );
}
