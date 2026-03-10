/**
 * Video Clipping Utility
 *
 * Client-side video clipping using browser MediaRecorder API.
 * Creates clips from existing videos without server-side processing.
 */

export interface ClipRange {
  startTime: number; // in seconds
  endTime: number;   // in seconds
}

interface ClipMetadata {
  title: string;
  description?: string;
  clipType?: string;
  parentVideoId: string;
}

/**
 * Formats seconds into MM:SS display format
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parses MM:SS format into seconds
 */
function parseTime(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length === 2 && parts[0] && parts[1]) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  return parseFloat(timeStr) || 0;
}

/**
 * Validates that a clip range is valid
 */
export function validateClipRange(range: ClipRange, videoDuration: number): string | null {
  if (range.startTime < 0) {
    return 'Start time cannot be negative';
  }
  if (range.endTime > videoDuration) {
    return 'End time cannot exceed video duration';
  }
  if (range.startTime >= range.endTime) {
    return 'Start time must be before end time';
  }
  if (range.endTime - range.startTime < 1) {
    return 'Clip must be at least 1 second long';
  }
  if (range.endTime - range.startTime > 300) {
    return 'Clip cannot exceed 5 minutes';
  }
  return null;
}

/**
 * Alternative: Create clip using video trimming with the Blob API
 * This is faster but doesn't re-encode the video
 */
export async function createClipMetadataOnly(
  parentVideoId: string,
  range: ClipRange,
  metadata: ClipMetadata
): Promise<{
  parent_video_id: string;
  clip_start_time: number;
  clip_end_time: number;
  title: string;
  description?: string;
  clip_type?: string;
}> {
  return {
    parent_video_id: parentVideoId,
    clip_start_time: range.startTime,
    clip_end_time: range.endTime,
    title: metadata.title,
    description: metadata.description,
    clip_type: metadata.clipType,
  };
}

/**
 * Generates a thumbnail from a video at a specific time
 */
export async function generateThumbnail(
  videoSrc: string,
  time: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.src = videoSrc;
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      video.currentTime = time;
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      resolve(dataUrl);
    };

    video.onerror = () => {
      reject(new Error('Failed to load video for thumbnail'));
    };

    video.load();
  });
}

