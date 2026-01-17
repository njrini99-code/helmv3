'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  IconUpload,
  IconImage,
  IconVideo,
  IconFile,
  IconMusic,
  IconCamera,
  IconX,
} from '@/components/icons';
import {
  ALLOWED_MIME_TYPES,
  FILE_SIZE_LIMITS,
  validateFile,
  formatFileSize,
  getFileSizeLimitsDescription,
} from '@/lib/storage/attachments';

interface AttachmentUploaderProps {
  onFilesSelected: (files: File[]) => void;
  onClose?: () => void;
  maxFiles?: number;
  disabled?: boolean;
  className?: string;
  /** Show as full-screen overlay */
  overlay?: boolean;
  /** Show compact inline version */
  compact?: boolean;
}

/**
 * Full-featured attachment uploader with drag & drop support
 */
export function AttachmentUploader({
  onFilesSelected,
  onClose,
  maxFiles = 10,
  disabled = false,
  className,
  overlay = false,
  compact = false,
}: AttachmentUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragCountRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Build accept string from allowed mime types
  const acceptTypes = Object.keys(ALLOWED_MIME_TYPES).join(',');

  // Handle drag events
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCountRef.current = 0;

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;

      processFiles(Array.from(files));
    },
    [disabled]
  );

  const processFiles = useCallback(
    (files: File[]) => {
      setError(null);
      const validFiles: File[] = [];
      const errors: string[] = [];

      // Limit number of files
      const filesToProcess = files.slice(0, maxFiles);

      for (const file of filesToProcess) {
        const validation = validateFile(file);
        if (validation.valid) {
          validFiles.push(file);
        } else {
          errors.push(`${file.name}: ${validation.error}`);
        }
      }

      if (errors.length > 0) {
        setError(errors.join('\n'));
      }

      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
        if (onClose) {
          onClose();
        }
      }
    },
    [maxFiles, onFilesSelected, onClose]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      processFiles(Array.from(files));
      // Reset input
      if (e.target) {
        e.target.value = '';
      }
    },
    [processFiles]
  );

  const handleClick = useCallback((type?: 'image' | 'video' | 'document' | 'camera') => {
    if (disabled) return;

    if (type === 'camera' && cameraInputRef.current) {
      cameraInputRef.current.click();
    } else if (inputRef.current) {
      inputRef.current.click();
    }
  }, [disabled]);

  // Keyboard handler for accessibility
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }, [handleClick]);

  // Clear error after 5 seconds
  useEffect(() => {
    if (!error) return;

    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  // Compact version - just a button row
  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <button
          type="button"
          onClick={() => handleClick('image')}
          disabled={disabled}
          className={cn(
            'p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100',
            'transition-colors duration-200',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          title="Add image"
          aria-label="Add image"
        >
          <IconImage size={20} />
        </button>
        <button
          type="button"
          onClick={() => handleClick('video')}
          disabled={disabled}
          className={cn(
            'p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100',
            'transition-colors duration-200',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          title="Add video"
          aria-label="Add video"
        >
          <IconVideo size={20} />
        </button>
        <button
          type="button"
          onClick={() => handleClick('document')}
          disabled={disabled}
          className={cn(
            'p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100',
            'transition-colors duration-200',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          title="Add document"
          aria-label="Add document"
        >
          <IconFile size={20} />
        </button>
        {/* Camera capture for mobile */}
        <button
          type="button"
          onClick={() => handleClick('camera')}
          disabled={disabled}
          className={cn(
            'p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100',
            'transition-colors duration-200 lg:hidden',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          title="Take photo"
          aria-label="Take photo"
        >
          <IconCamera size={20} />
        </button>

        {/* Hidden inputs */}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={acceptTypes}
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />
      </div>
    );
  }

  // Full drag & drop zone
  const content = (
    <div
      className={cn(
        'relative rounded-2xl border-2 border-dashed transition-all duration-200',
        isDragging
          ? 'border-green-500 bg-green-50'
          : 'border-slate-200 hover:border-slate-300 bg-white',
        disabled && 'opacity-50 cursor-not-allowed',
        overlay ? 'p-12' : 'p-8',
        className
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => handleClick()}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Drop files here or click to browse"
    >
      {/* Close button for overlay mode */}
      {overlay && onClose && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Close"
        >
          <IconX size={20} />
        </button>
      )}

      <div className="flex flex-col items-center text-center">
        {/* Icon */}
        <div
          className={cn(
            'w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors',
            isDragging ? 'bg-green-100' : 'bg-slate-100'
          )}
        >
          <IconUpload
            size={28}
            className={cn(isDragging ? 'text-green-600' : 'text-slate-400')}
          />
        </div>

        {/* Main text */}
        <h3 className="text-lg font-medium text-slate-900 mb-1">
          {isDragging ? 'Drop files here' : 'Upload files'}
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          Drag and drop or{' '}
          <span className="text-green-600 font-medium">browse</span>
        </p>

        {/* File type buttons */}
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          <FileTypeButton
            icon={<IconImage size={18} />}
            label="Images"
            limit={formatFileSize(FILE_SIZE_LIMITS.image ?? 0)}
            onClick={(e) => {
              e.stopPropagation();
              handleClick('image');
            }}
            disabled={disabled}
          />
          <FileTypeButton
            icon={<IconVideo size={18} />}
            label="Videos"
            limit={formatFileSize(FILE_SIZE_LIMITS.video ?? 0)}
            onClick={(e) => {
              e.stopPropagation();
              handleClick('video');
            }}
            disabled={disabled}
          />
          <FileTypeButton
            icon={<IconFile size={18} />}
            label="Docs"
            limit={formatFileSize(FILE_SIZE_LIMITS.document ?? 0)}
            onClick={(e) => {
              e.stopPropagation();
              handleClick('document');
            }}
            disabled={disabled}
          />
          <FileTypeButton
            icon={<IconMusic size={18} />}
            label="Audio"
            limit={formatFileSize(FILE_SIZE_LIMITS.audio ?? 0)}
            onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}
            disabled={disabled}
          />
        </div>

        {/* Mobile camera option */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClick('camera');
          }}
          disabled={disabled}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-green-50 text-green-700 hover:bg-green-100',
            'transition-colors duration-200 lg:hidden',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <IconCamera size={18} />
          <span className="text-sm font-medium">Take Photo</span>
        </button>

        {/* Size limits info */}
        <p className="text-xs text-slate-400 mt-4">
          Max {maxFiles} files. {getFileSizeLimitsDescription()}
        </p>

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200">
            <p className="text-sm text-red-600 whitespace-pre-line">{error}</p>
          </div>
        )}
      </div>

      {/* Hidden inputs */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptTypes}
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />
    </div>
  );

  // Overlay mode wraps in a modal
  if (overlay) {
    return (
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget && onClose) {
            onClose();
          }
        }}
      >
        <div className="w-full max-w-xl">{content}</div>
      </div>
    );
  }

  return content;
}

interface FileTypeButtonProps {
  icon: React.ReactNode;
  label: string;
  limit: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
}

function FileTypeButton({
  icon,
  label,
  limit,
  onClick,
  disabled,
}: FileTypeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg',
        'bg-slate-100 text-slate-600 hover:bg-slate-200',
        'transition-colors duration-200',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-slate-400">{limit}</span>
    </button>
  );
}

/**
 * Hook to enable drag & drop on any element
 */
export function useDragAndDrop(
  onFiles: (files: File[]) => void,
  options: { disabled?: boolean; maxFiles?: number } = {}
) {
  const { disabled = false, maxFiles = 10 } = options;
  const [isDragging, setIsDragging] = useState(false);
  const dragCountRef = useRef(0);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      dragCountRef.current++;
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCountRef.current = 0;

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;

      const validFiles: File[] = [];
      const filesToProcess = Array.from(files).slice(0, maxFiles);

      for (const file of filesToProcess) {
        const validation = validateFile(file);
        if (validation.valid) {
          validFiles.push(file);
        }
      }

      if (validFiles.length > 0) {
        onFiles(validFiles);
      }
    },
    [disabled, maxFiles, onFiles]
  );

  return {
    isDragging,
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
  };
}
