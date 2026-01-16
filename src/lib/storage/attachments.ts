/**
 * Golf Message Attachments - Storage Utilities
 *
 * Handles file uploads and URL generation for message attachments.
 * Uses Supabase Storage with signed URLs for secure access.
 */

import { createClient } from '@/lib/supabase/client';

// Constants
export const STORAGE_BUCKET = 'golf-attachments';

// File size limits by type (in bytes)
export const FILE_SIZE_LIMITS: Record<string, number> = {
  image: 10 * 1024 * 1024,    // 10MB for images
  video: 100 * 1024 * 1024,   // 100MB for videos
  document: 25 * 1024 * 1024, // 25MB for documents
  audio: 25 * 1024 * 1024,    // 25MB for audio
};

// Max file size (largest allowed)
export const MAX_FILE_SIZE = Math.max(...Object.values(FILE_SIZE_LIMITS));

// Allowed file types and their categories
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  // Images
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/heic': 'image',
  'image/heif': 'image',
  // Videos
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/webm': 'video',
  'video/x-msvideo': 'video',
  'video/3gpp': 'video',
  // Documents
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'application/vnd.ms-powerpoint': 'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document',
  'text/plain': 'document',
  'text/csv': 'document',
  // Audio
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/wav': 'audio',
  'audio/x-wav': 'audio',
  'audio/mp4': 'audio',
  'audio/m4a': 'audio',
  'audio/x-m4a': 'audio',
  'audio/ogg': 'audio',
  'audio/webm': 'audio',
};

export type AttachmentFileType = 'image' | 'video' | 'document' | 'audio';

export interface AttachmentMetadata {
  fileName: string;
  fileType: AttachmentFileType;
  mimeType: string;
  fileSize: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export interface UploadResult {
  success: boolean;
  storagePath?: string;
  url?: string;
  thumbnailUrl?: string;
  metadata?: AttachmentMetadata;
  error?: string;
}

export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
  metadata: AttachmentMetadata;
  uploadProgress: number;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  storagePath?: string;
  url?: string;
  error?: string;
}

/**
 * Validate a file for upload
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  // Check mime type first to get the file category
  const fileType = ALLOWED_MIME_TYPES[file.type];
  if (!fileType) {
    return {
      valid: false,
      error: 'File type not supported. Please upload images, videos, documents, or audio files.',
    };
  }

  // Get the size limit for this file type
  const sizeLimit = FILE_SIZE_LIMITS[fileType] || MAX_FILE_SIZE;

  // Check file size against type-specific limit
  if (file.size > sizeLimit) {
    return {
      valid: false,
      error: `File too large. Maximum size for ${fileType}s is ${formatFileSize(sizeLimit)}.`,
    };
  }

  return { valid: true };
}

/**
 * Get the file size limit for a given file type
 */
export function getFileSizeLimit(fileType: AttachmentFileType): number {
  return FILE_SIZE_LIMITS[fileType] || MAX_FILE_SIZE;
}

/**
 * Get human-readable file type limits description
 */
export function getFileSizeLimitsDescription(): string {
  return `Images: ${formatFileSize(FILE_SIZE_LIMITS.image)}, Videos: ${formatFileSize(FILE_SIZE_LIMITS.video)}, Documents: ${formatFileSize(FILE_SIZE_LIMITS.document)}, Audio: ${formatFileSize(FILE_SIZE_LIMITS.audio)}`;
}

/**
 * Get file type category from mime type
 */
export function getFileType(mimeType: string): AttachmentFileType {
  return (ALLOWED_MIME_TYPES[mimeType] as AttachmentFileType) || 'document';
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Generate a unique storage path for the file
 */
export function generateStoragePath(
  conversationId: string,
  messageId: string,
  fileName: string
): string {
  const timestamp = Date.now();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `conversations/${conversationId}/${messageId}/${timestamp}_${sanitizedName}`;
}

/**
 * Get image dimensions from a File
 */
export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      reject(new Error('Failed to load image'));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Get video metadata from a File
 */
export function getVideoMetadata(
  file: File
): Promise<{ width: number; height: number; durationSeconds: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        durationSeconds: Math.round(video.duration),
      });
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => {
      reject(new Error('Failed to load video'));
      URL.revokeObjectURL(video.src);
    };
    video.src = URL.createObjectURL(file);
  });
}

/**
 * Create a preview URL for a file
 */
export function createPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

/**
 * Revoke a preview URL to free memory
 */
export function revokePreviewUrl(url: string): void {
  URL.revokeObjectURL(url);
}

/**
 * Upload a file to Supabase Storage
 */
export async function uploadAttachment(
  file: File,
  conversationId: string,
  messageId: string,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  const supabase = createClient();

  // Validate file
  const validation = validateFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Generate storage path
  const storagePath = generateStoragePath(conversationId, messageId, file.name);

  // Get file metadata
  const fileType = getFileType(file.type);
  const metadata: AttachmentMetadata = {
    fileName: file.name,
    fileType,
    mimeType: file.type,
    fileSize: file.size,
  };

  // Get dimensions for images/videos and duration for audio
  try {
    if (fileType === 'image') {
      const dims = await getImageDimensions(file);
      metadata.width = dims.width;
      metadata.height = dims.height;
    } else if (fileType === 'video') {
      const videoMeta = await getVideoMetadata(file);
      metadata.width = videoMeta.width;
      metadata.height = videoMeta.height;
      metadata.durationSeconds = videoMeta.durationSeconds;
    } else if (fileType === 'audio') {
      const audioMeta = await getAudioMetadata(file);
      metadata.durationSeconds = audioMeta.durationSeconds;
    }
  } catch (err) {
    // Non-critical, continue with upload
    console.warn('[Attachments] Failed to get media metadata:', err);
  }

  // Upload to Supabase Storage
  // Note: Supabase JS client doesn't support progress tracking directly
  // We simulate progress for UX
  if (onProgress) {
    onProgress(10); // Start
  }

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('[Attachments] Upload error:', uploadError);
    return {
      success: false,
      error: `Upload failed: ${uploadError.message}`,
    };
  }

  if (onProgress) {
    onProgress(90);
  }

  // Get signed URL (valid for 1 hour)
  const { data: urlData, error: urlError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (urlError || !urlData) {
    console.error('[Attachments] Failed to get signed URL:', urlError);
    return {
      success: false,
      error: 'Upload succeeded but failed to get URL',
    };
  }

  if (onProgress) {
    onProgress(100);
  }

  return {
    success: true,
    storagePath,
    url: urlData.signedUrl,
    metadata,
  };
}

/**
 * Delete an attachment from storage
 */
export async function deleteAttachment(storagePath: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);

  if (error) {
    console.error('[Attachments] Delete error:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Get a fresh signed URL for an attachment
 */
export async function getSignedUrl(
  storagePath: string,
  expiresIn: number = 3600
): Promise<{ url?: string; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error || !data) {
    return { error: error?.message || 'Failed to get URL' };
  }

  return { url: data.signedUrl };
}

/**
 * Get file icon based on mime type
 */
export function getFileIcon(mimeType: string): string {
  const type = getFileType(mimeType);
  switch (type) {
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'document':
      if (mimeType.includes('pdf')) return 'pdf';
      if (mimeType.includes('word')) return 'doc';
      if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'xls';
      return 'document';
    default:
      return 'file';
  }
}

/**
 * Check if a file is an image
 */
export function isImage(mimeType: string): boolean {
  return getFileType(mimeType) === 'image';
}

/**
 * Check if a file is a video
 */
export function isVideo(mimeType: string): boolean {
  return getFileType(mimeType) === 'video';
}

/**
 * Check if a file is audio
 */
export function isAudio(mimeType: string): boolean {
  return getFileType(mimeType) === 'audio';
}

/**
 * Check if a file is a document
 */
export function isDocument(mimeType: string): boolean {
  return getFileType(mimeType) === 'document';
}

/**
 * Check if a file is previewable (image or video)
 */
export function isPreviewable(mimeType: string): boolean {
  const type = getFileType(mimeType);
  return type === 'image' || type === 'video';
}

/**
 * Check if a file is a media type (image, video, or audio)
 */
export function isMedia(mimeType: string): boolean {
  const type = getFileType(mimeType);
  return type === 'image' || type === 'video' || type === 'audio';
}

/**
 * Get audio metadata from a File
 */
export function getAudioMetadata(file: File): Promise<{ durationSeconds: number }> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      resolve({
        durationSeconds: Math.round(audio.duration),
      });
      URL.revokeObjectURL(audio.src);
    };
    audio.onerror = () => {
      reject(new Error('Failed to load audio'));
      URL.revokeObjectURL(audio.src);
    };
    audio.src = URL.createObjectURL(file);
  });
}
