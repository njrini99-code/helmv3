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



