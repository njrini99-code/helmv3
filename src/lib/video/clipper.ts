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

/**
 * Formats seconds into MM:SS display format
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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

