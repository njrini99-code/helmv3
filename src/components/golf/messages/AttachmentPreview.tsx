'use client';

import { cn } from '@/lib/utils';
import { IconX, IconFile, IconImage, IconVideo, IconAlertCircle, IconMusic } from '@/components/icons';
import { IconButton } from '@/components/ui/button';
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
 * Preview component for pending attachments before sending.
 *
 * Renders inside every composer attachment state, and was the last legacy
 * surface the messages composer still reached into: `warm-*`, `cream-*`,
 * `red-*`, `primary-*` and `purple-*`, all banned by
 * `.claude/rules/design-system.md`. Migrated onto Fairway tokens in G-46,
 * which W5's composer work depends on — you cannot reach composer fidelity
 * while one of its children paints from a retired palette.
 *
 * Four mapping calls worth stating, because none of them is mechanical:
 *
 * - The audio tile was `bg-purple-100` / `text-purple-600`. Purple is in no
 *   Fairway scale, so it now matches the document tile immediately below it
 *   (`bg-surface-sunken` + `text-text-tertiary`). The icon already tells audio
 *   from document; the hue was carrying nothing.
 * - The PDF / DOC / XLS labels were red / blue / green. There is no blue token
 *   and `text-red-500` is banned outright, so all three are
 *   `text-text-secondary`. The word "PDF" is the signal; the hue was
 *   decoration that only two of the three could keep.
 * - The video scrim keeps `bg-black/20` and `text-white`. Neither is in the
 *   banned set, and a scrim over arbitrary user media is one of the few places
 *   a literal is more honest than a surface token.
 * - Alpha modifiers on `fw-*` utilities do compile — `tailwind.config.ts`
 *   bridges them through `color-mix`, not through channel triplets — so
 *   `bg-surface/85` and `bg-fw-danger-bg/90` render. The same expressions
 *   against a raw `var()` token would have emitted no rule at all.
 *
 * DELIBERATELY UNCHANGED: the remove button stays `IconButton` from
 * `@/components/ui/button` at `w-5 h-5`. `MessageComposer.tsx` — the Fairway
 * file that renders this one — imports its `Button` from the same legacy
 * module, so that import IS the local idiom. And 20px fails WCAG 2.2 SC 2.5.8
 * (24px minimum), which is a real defect but a geometry one: it is recorded as
 * G-60 against W5/G-47, where composer geometry is already owned. Swapping in
 * Fairway's `IconButton` would not have fixed it either — its smallest size is
 * 36px, 44px on a coarse pointer, which anchored at `-top-1 -right-1` on an
 * 80px tile overhangs into the neighbouring tile's `gap-2`.
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
        'p-3 border-t border-border-subtle bg-surface-sunken',
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
        'relative group rounded-fw-md overflow-hidden border',
        status === 'error' ? 'border-fw-danger/40 bg-fw-danger-bg' : 'border-border-subtle bg-surface',
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
          <div className="flex-shrink-0 w-10 h-10 rounded-fw-md bg-surface-sunken flex items-center justify-center">
            <IconMusic size={20} className="text-text-tertiary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary truncate">
              {file.name}
            </p>
            <p className="text-xs text-text-tertiary">
              {formatFileSize(metadata.fileSize)}
            </p>
          </div>
        </div>
      )}

      {/* Document Preview */}
      {!isMediaPreviewable && !isAudioFile && (
        <div className="flex items-center gap-2 p-2">
          <div className="flex-shrink-0 w-10 h-10 rounded-fw-md bg-surface-sunken flex items-center justify-center">
            <FileTypeIcon mimeType={metadata.mimeType} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary truncate">
              {file.name}
            </p>
            <p className="text-xs text-text-tertiary">
              {formatFileSize(metadata.fileSize)}
            </p>
          </div>
        </div>
      )}

      {/* Upload Progress Overlay */}
      {status === 'uploading' && (
        <div className="absolute inset-0 bg-surface/85 flex flex-col items-center justify-center">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-accent-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-accent-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
          </span>
          <span className="text-xs text-text-secondary mt-1">{uploadProgress}%</span>
        </div>
      )}

      {/* Error Overlay */}
      {status === 'error' && (
        <div className="absolute inset-0 bg-fw-danger-bg/90 flex flex-col items-center justify-center p-2">
          <IconAlertCircle size={18} className="text-fw-danger" />
          <span className="text-xs text-fw-danger-ink text-center mt-1 line-clamp-2">
            {error || 'Upload failed'}
          </span>
        </div>
      )}

      {/* Progress Bar for uploading */}
      {status === 'uploading' && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-sunken">
          <div
            className="h-full bg-accent-500 transition-all duration-200"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}

      {/* Remove Button */}
      <IconButton variant="default"
        type="button"
        onClick={onRemove}
        className={cn(
          'absolute -top-1 -right-1 w-5 h-5 rounded-full',
          'bg-text-primary text-text-on-dark shadow-soft',
          'flex items-center justify-center',
          'opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200',
          'hover:bg-fw-danger',
          'focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-fw-danger'
        )}
        aria-label={`Remove ${file.name}`}
      >
        <IconX size={12} />
      </IconButton>
    </div>
  );
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (isImage(mimeType)) {
    return <IconImage size={20} className="text-text-tertiary" />;
  }
  if (isVideo(mimeType)) {
    return <IconVideo size={20} className="text-text-tertiary" />;
  }
  if (mimeType.includes('pdf')) {
    return <span className="text-eyebrow font-medium text-text-secondary">PDF</span>;
  }
  if (mimeType.includes('word')) {
    return <span className="text-eyebrow font-medium text-text-secondary">DOC</span>;
  }
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
    return <span className="text-eyebrow font-medium text-text-secondary">XLS</span>;
  }
  return <IconFile size={20} className="text-text-tertiary" />;
}
