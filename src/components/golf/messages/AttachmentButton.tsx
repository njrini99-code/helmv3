'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';
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
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleButtonClick = () => {
    if (disabled) return;
    void triggerHaptic('light');
    if (showDropdown) {
      setIsOpen(!isOpen);
    } else {
      inputRef.current?.click();
    }
  };

  const handleSelectType = (type: 'all' | 'image' | 'video' | 'document' | 'audio' | 'camera') => {
    if (disabled) return;
    void triggerHaptic('light');
    setIsOpen(false);

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

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={handleButtonClick}
        disabled={disabled}
        className={cn(
          'w-11 h-11 flex items-center justify-center rounded-xl text-warm-400 hover:text-warm-700 hover:bg-warm-100/60 active:bg-warm-200/60 active:scale-95',
          'transition-[color,background-color,transform] duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
          isOpen && 'bg-warm-100/80 text-warm-700',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
        aria-label="Attach files"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <IconPaperclip size={20} />
      </button>

      {/* Dropdown Menu */}
      {showDropdown && isOpen && (
        <div
          role="menu"
          className={cn(
            'absolute bottom-full left-0 mb-2 w-60',
            'bg-white/95 backdrop-blur-xl rounded-2xl border border-warm-200/50',
            'shadow-[0_12px_40px_rgba(16,24,40,0.14)]',
            'py-1.5 z-50',
            'origin-bottom-left animate-in fade-in zoom-in-95 slide-in-from-bottom-1 duration-180'
          )}
        >
          <div className="px-3 py-1.5 mb-1 border-b border-warm-200/50">
            <p className="text-[11px] font-semibold text-warm-400 uppercase tracking-[0.08em]">Attach</p>
          </div>

          <AttachmentTypeOption
            icon={<IconImage size={18} />}
            label="Images"
            description={`Up to ${formatFileSize(FILE_SIZE_LIMITS.image ?? 0)}`}
            onClick={() => handleSelectType('image')}
          />
          <AttachmentTypeOption
            icon={<IconVideo size={18} />}
            label="Videos"
            description={`Up to ${formatFileSize(FILE_SIZE_LIMITS.video ?? 0)}`}
            onClick={() => handleSelectType('video')}
          />
          <AttachmentTypeOption
            icon={<IconFile size={18} />}
            label="Documents"
            description={`Up to ${formatFileSize(FILE_SIZE_LIMITS.document ?? 0)}`}
            onClick={() => handleSelectType('document')}
          />
          <AttachmentTypeOption
            icon={<IconMusic size={18} />}
            label="Audio"
            description={`Up to ${formatFileSize(FILE_SIZE_LIMITS.audio ?? 0)}`}
            onClick={() => handleSelectType('audio')}
          />

          {/* Camera option - mobile only */}
          <div className="lg:hidden border-t border-warm-200/50 mt-1 pt-1">
            <AttachmentTypeOption
              icon={<IconCamera size={18} />}
              label="Take Photo"
              description="Use camera"
              onClick={() => handleSelectType('camera')}
            />
          </div>

          <div className="border-t border-warm-200/50 mt-1 pt-1">
            <AttachmentTypeOption
              icon={<IconPaperclip size={18} />}
              label="Browse All"
              description={`Max ${maxFiles} files`}
              onClick={() => handleSelectType('all')}
            />
          </div>
        </div>
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
  onClick: () => void;
}

function AttachmentTypeOption({
  icon,
  label,
  description,
  onClick,
}: AttachmentTypeOptionProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px]',
        'text-left hover:bg-warm-100/60 active:bg-warm-100/80 transition-colors duration-100'
      )}
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-warm-100/60 flex items-center justify-center text-warm-600">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-warm-800 leading-snug">{label}</p>
        <p className="text-xs text-warm-500 leading-snug">{description}</p>
      </div>
    </button>
  );
}
