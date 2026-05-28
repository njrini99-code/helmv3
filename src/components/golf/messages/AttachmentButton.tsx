'use client';

import { useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { IconButton } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  IconPaperclip,
  IconImage,
  IconVideo,
  IconFile,
  IconMusic,
  IconCamera,
} from '@/components/icons';
import {
  ALLOWED_MIME_TYPES,
  FILE_SIZE_LIMITS,
  formatFileSize,
  validateFile,
} from '@/lib/storage/attachments';

interface AttachmentButtonProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
  maxFiles?: number;
  /** Show expanded dropdown menu */
  showDropdown?: boolean;
}

export function AttachmentButton({
  onFilesSelected,
  disabled = false,
  className,
  maxFiles = 5,
  showDropdown = true,
}: AttachmentButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleSimpleClick = () => {
    if (disabled) return;
    void triggerHaptic('light');
    inputRef.current?.click();
  };

  const handleSelectType = (type: 'all' | 'image' | 'video' | 'document' | 'audio' | 'camera') => {
    if (disabled) return;
    void triggerHaptic('light');

    if (type === 'camera' && cameraInputRef.current) {
      cameraInputRef.current.click();
    } else if (inputRef.current) {
      // Update accept attribute based on type
      if (type === 'image') {
        inputRef.current.accept = 'image/*';
      } else if (type === 'video') {
        inputRef.current.accept = 'video/*';
      } else if (type === 'document') {
        inputRef.current.accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';
      } else if (type === 'audio') {
        inputRef.current.accept = 'audio/*';
      } else {
        inputRef.current.accept = Object.keys(ALLOWED_MIME_TYPES).join(',');
      }
      inputRef.current.click();
    }
  };

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files).slice(0, maxFiles);
      const validFiles = fileArray.filter((file) => validateFile(file).valid);

      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }

      // Reset input so same file can be selected again
      if (inputRef.current) {
        inputRef.current.value = '';
        // Reset accept to all
        inputRef.current.accept = Object.keys(ALLOWED_MIME_TYPES).join(',');
      }
      if (cameraInputRef.current) {
        cameraInputRef.current.value = '';
      }
    },
    [maxFiles, onFilesSelected]
  );

  // Build accept string from allowed mime types
  const acceptTypes = Object.keys(ALLOWED_MIME_TYPES).join(',');

  const triggerButton = (
    <IconButton variant="default"
      type="button"
      onClick={showDropdown ? undefined : handleSimpleClick}
      disabled={disabled}
      className={cn(
        'w-11 h-11 flex items-center justify-center rounded-xl text-warm-400 hover:text-warm-700 hover:bg-warm-100/60 active:bg-warm-200/60 active:scale-95',
        'transition-[color,background-color,transform] duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        'data-[state=open]:bg-warm-100/80 data-[state=open]:text-warm-700',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      aria-label="Attach files"
    >
      <IconPaperclip size={20} />
    </IconButton>
  );

  return (
    <div className="relative">
      {showDropdown ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled}>
            {triggerButton}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="w-60"
          >
            <DropdownMenuLabel>Attach</DropdownMenuLabel>

            <AttachmentTypeOption
              icon={<IconImage size={18} />}
              label="Images"
              description={`Up to ${formatFileSize(FILE_SIZE_LIMITS.image ?? 0)}`}
              onSelect={() => handleSelectType('image')}
            />
            <AttachmentTypeOption
              icon={<IconVideo size={18} />}
              label="Videos"
              description={`Up to ${formatFileSize(FILE_SIZE_LIMITS.video ?? 0)}`}
              onSelect={() => handleSelectType('video')}
            />
            <AttachmentTypeOption
              icon={<IconFile size={18} />}
              label="Documents"
              description={`Up to ${formatFileSize(FILE_SIZE_LIMITS.document ?? 0)}`}
              onSelect={() => handleSelectType('document')}
            />
            <AttachmentTypeOption
              icon={<IconMusic size={18} />}
              label="Audio"
              description={`Up to ${formatFileSize(FILE_SIZE_LIMITS.audio ?? 0)}`}
              onSelect={() => handleSelectType('audio')}
            />

            {/* Camera option - mobile only */}
            <div className="lg:hidden">
              <DropdownMenuSeparator />
              <AttachmentTypeOption
                icon={<IconCamera size={18} />}
                label="Take Photo"
                description="Use camera"
                onSelect={() => handleSelectType('camera')}
              />
            </div>

            <DropdownMenuSeparator />
            <AttachmentTypeOption
              icon={<IconPaperclip size={18} />}
              label="Browse All"
              description={`Max ${maxFiles} files`}
              onSelect={() => handleSelectType('all')}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        triggerButton
      )}

      {/* Hidden file inputs */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptTypes}
        onChange={handleChange}
        className="hidden"
        aria-hidden="true"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="hidden"
        aria-hidden="true"
      />
    </div>
  );
}

interface AttachmentTypeOptionProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  onSelect: () => void;
}

function AttachmentTypeOption({
  icon,
  label,
  description,
  onSelect,
}: AttachmentTypeOptionProps) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className="gap-3 px-3 py-2.5"
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-warm-100/60 flex items-center justify-center text-warm-600">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-body font-medium text-warm-800 leading-snug">{label}</p>
        <p className="text-xs text-warm-500 leading-snug">{description}</p>
      </div>
    </DropdownMenuItem>
  );
}
