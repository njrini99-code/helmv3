'use client';

import { cn } from '@/lib/utils';
import { IconX, IconFile, IconImage, IconVideo, IconAlertCircle, IconMusic } from '@/components/icons';
import {
  type PendingAttachment,
  formatFileSize,
  isImage,
  isVideo,
  isAudio,
} from '@/lib/storage/attachments';

interface AttachmentPreviewProps {
  attachments: PendingAttachment[];
  onRemove: (id: string) => void;
  className?: string;
}

/**
 * Preview component for pending attachments before sending
 */
export function AttachmentPreview({
  attachments,
  onRemove,
  className,
}: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div
      className={cn(
        'p-3 border-t border-warm-200 bg-warm-50',
        className
      )}
    >
      <div className="flex flex-wrap gap-2">
        {attachments.map((attachment) => (
          <AttachmentPreviewItem
            key={attachment.id}
            attachment={attachment}
            onRemove={() => onRemove(attachment.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface AttachmentPreviewItemProps {
  attachment: PendingAttachment;
  onRemove: () => void;
}

function AttachmentPreviewItem({ attachment, onRemove }: AttachmentPreviewItemProps) {
  const { file, previewUrl, metadata, uploadProgress, status, error } = attachment;
  const isImageFile = isImage(metadata.mimeType);
  const isVideoFile = isVideo(metadata.mimeType);
  const isAudioFile = isAudio(metadata.mimeType);
  const isMediaPreviewable = isImageFile || isVideoFile;

  return (
    <div
      className={cn(
        'relative group rounded-lg overflow-hidden border',
        status === 'error' ? 'border-red-300 bg-red-50' : 'border-warm-200 bg-white',
        isMediaPreviewable ? 'w-20 h-20' : 'w-48'
      )}
    >
      {/* Image Preview */}
      {isImageFile && (
        <img
          src={previewUrl}
          alt={file.name}
          className="w-full h-full object-cover"
        />
      )}

      {/* Video Preview */}
      {isVideoFile && (
        <div className="relative w-full h-full">
          <video
            src={previewUrl}
            className="w-full h-full object-cover"
            muted
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <IconVideo size={24} className="text-white" />
          </div>
        </div>
      )}

      {/* Audio Preview */}
      {isAudioFile && (
        <div className="flex items-center gap-2 p-2">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
            <IconMusic size={20} className="text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-warm-700 truncate">
              {file.name}
            </p>
            <p className="text-xs text-warm-400">
              {formatFileSize(metadata.fileSize)}
            </p>
          </div>
        </div>
      )}

      {/* Document Preview */}
      {!isMediaPreviewable && !isAudioFile && (
        <div className="flex items-center gap-2 p-2">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-warm-100 flex items-center justify-center">
            <FileTypeIcon mimeType={metadata.mimeType} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-warm-700 truncate">
              {file.name}
            </p>
            <p className="text-xs text-warm-400">
              {formatFileSize(metadata.fileSize)}
            </p>
          </div>
        </div>
      )}

      {/* Upload Progress Overlay */}
      {status === 'uploading' && (
        <div className="absolute inset-0 bg-cream-100/82 flex flex-col items-center justify-center">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
          </span>
          <span className="text-xs text-warm-600 mt-1">{uploadProgress}%</span>
        </div>
      )}

      {/* Error Overlay */}
      {status === 'error' && (
        <div className="absolute inset-0 bg-red-50/90 flex flex-col items-center justify-center p-2">
          <IconAlertCircle size={18} className="text-red-500" />
          <span className="text-xs text-red-600 text-center mt-1 line-clamp-2">
            {error || 'Upload failed'}
          </span>
        </div>
      )}

      {/* Progress Bar for uploading */}
      {status === 'uploading' && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-warm-200">
          <div
            className="h-full bg-primary-500 transition-all duration-200"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}

      {/* Remove Button */}
      <button
        type="button"
        onClick={onRemove}
        className={cn(
          'absolute -top-1 -right-1 w-5 h-5 rounded-full',
          'bg-warm-700 text-white shadow-md',
          'flex items-center justify-center',
          'opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200',
          'hover:bg-red-600',
          'focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-500'
        )}
        aria-label={`Remove ${file.name}`}
      >
        <IconX size={12} />
      </button>
    </div>
  );
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (isImage(mimeType)) {
    return <IconImage size={20} className="text-warm-500" />;
  }
  if (isVideo(mimeType)) {
    return <IconVideo size={20} className="text-warm-500" />;
  }
  if (mimeType.includes('pdf')) {
    return <span className="text-xs font-bold text-red-500">PDF</span>;
  }
  if (mimeType.includes('word')) {
    return <span className="text-xs font-bold text-blue-500">DOC</span>;
  }
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
    return <span className="text-xs font-bold text-primary-500">XLS</span>;
  }
  return <IconFile size={20} className="text-warm-500" />;
}
