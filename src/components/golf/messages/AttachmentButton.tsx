'use client';

import { useRef, useCallback, useState } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { Button } from '@/components/fairway/controls/button';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { fairwayToast } from '@/components/fairway';
import { logError } from '@/lib/error-logging';
import { IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [sheetOpen, setSheetOpen] = useState(false);
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

    setSheetOpen(false);
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

      // A rejected file used to vanish. `.filter(f => validateFile(f).valid)`
      // threw away a reason `validateFile` had already computed — "File type
      // not supported…" or "File too large…" — so a player tapped attach,
      // picked a photo, and NOTHING happened: no toast, no console line, no
      // log, and no network call, because rejection happens before any request
      // is made.
      //
      // That silence is why "we can't do pictures" could not be investigated
      // from production. This failure leaves no Sentry event, no storage
      // object and no database row — the same evidence profile as nobody
      // having tried. The most likely trigger is a device reporting a
      // `file.type` that `ALLOWED_MIME_TYPES` does not carry (an empty string,
      // or an HEIC variant), which is exactly the case a phone produces and a
      // desktop does not.
      //
      // Telling the person is the fix. The log is `low` severity so an
      // ordinary oversized photo is not treated as an incident, but the
      // filename and mime type reach Sentry so the NEXT occurrence is
      // diagnosable instead of invisible.
      const validFiles: File[] = [];
      for (const file of fileArray) {
        const result = validateFile(file);
        if (result.valid) {
          validFiles.push(file);
          continue;
        }
        fairwayToast.danger(result.error || `${file.name} can't be attached`);
        logError(
          new Error(`Attachment rejected: ${result.error || 'unknown reason'}`),
          {
            component: 'AttachmentButton',
            action: 'validate-file',
            sport: 'golf',
            fileName: file.name,
            mimeType: file.type || '(none reported)',
            fileSize: file.size,
          },
          'low',
        );
      }

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
      onClick={showDropdown ? (isDesktop ? undefined : () => setSheetOpen(true)) : handleSimpleClick}
      disabled={disabled}
      // Fairway tokens, not the retired pre-Fairway `warm-*` palette. The
      // design system retires `warm-*`/`cream-*` on golf-dashboard surfaces
      // with exactly one named exception (`ui/skeleton.tsx`), and this control
      // sits in the team-message composer — as golf-dashboard as it gets.
      //
      // The focus ring mattered most: `ring-primary-500/40` is the brand green
      // at FORTY PERCENT opacity, which is far below the 3:1 a focus indicator
      // owes and worse than the accent-500 case the token fix addressed. It is
      // now the same accent-600 ring every other control uses.
      className={cn(
        'w-11 h-11 flex items-center justify-center rounded-fw-md',
        'text-text-tertiary hover:text-text-primary hover:bg-surface-sunken active:bg-surface-sunken active:scale-95 motion-reduce:active:scale-100',
        'transition-[color,background-color,transform] duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'data-[state=open]:bg-surface-sunken data-[state=open]:text-text-primary',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      aria-label="Attach files"
      aria-haspopup={showDropdown ? (isDesktop ? 'menu' : 'dialog') : undefined}
      aria-expanded={showDropdown && !isDesktop ? sheetOpen : undefined}
    >
      <IconPaperclip size={20} />
    </IconButton>
  );

  const options = [
    { type: 'image' as const, icon: <IconImage size={20} />, label: 'Photo library', description: `Images up to ${formatFileSize(FILE_SIZE_LIMITS.image ?? 0)}` },
    { type: 'camera' as const, icon: <IconCamera size={20} />, label: 'Take photo', description: 'Use your camera' },
    { type: 'video' as const, icon: <IconVideo size={20} />, label: 'Video', description: `Up to ${formatFileSize(FILE_SIZE_LIMITS.video ?? 0)}` },
    { type: 'document' as const, icon: <IconFile size={20} />, label: 'Document', description: `Up to ${formatFileSize(FILE_SIZE_LIMITS.document ?? 0)}` },
    { type: 'audio' as const, icon: <IconMusic size={20} />, label: 'Audio', description: `Up to ${formatFileSize(FILE_SIZE_LIMITS.audio ?? 0)}` },
    { type: 'all' as const, icon: <IconPaperclip size={20} />, label: 'Browse files', description: `Up to ${maxFiles} files` },
  ];

  return (
    <div className="relative shrink-0">
      {showDropdown && isDesktop ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled}>
            {triggerButton}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-60">
            <DropdownMenuLabel>Attach</DropdownMenuLabel>
            {options.filter((option) => option.type !== 'camera').map((option) => (
              <AttachmentTypeOption key={option.type} {...option} onSelect={() => handleSelectType(option.type)} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : triggerButton}
      {showDropdown && !isDesktop && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="Add attachment" side="bottom">
          <Sheet.Body className="px-4">
            <div className="divide-y divide-border-subtle rounded-card bg-surface">
              {options.map((option) => (
                <AttachmentTypeOption key={option.type} {...option} inSheet onSelect={() => handleSelectType(option.type)} />
              ))}
            </div>
          </Sheet.Body>
        </Sheet>
      )}

      {/* Hidden file inputs */}
      <Input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptTypes}
        onChange={handleChange}
        className="hidden"
        aria-hidden="true"
      />
      <Input
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
  inSheet?: boolean;
}

function AttachmentTypeOption({
  icon,
  label,
  description,
  onSelect,
  inSheet = false,
}: AttachmentTypeOptionProps) {
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center text-text-secondary">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="text-body font-medium leading-snug text-text-primary">{label}</span>
        <span className="text-caption font-normal leading-snug text-text-tertiary">{description}</span>
      </span>
    </>
  );
  return inSheet ? (
    <Button type="button" variant="ghost" onClick={onSelect} className="h-auto min-h-14 w-full justify-start gap-2 rounded-none px-3 py-2.5 first:rounded-t-card last:rounded-b-card">
      <span className="flex items-center gap-2">{content}</span>
    </Button>
  ) : (
    <DropdownMenuItem onSelect={onSelect} className="gap-2 px-2 py-2">
      {content}
    </DropdownMenuItem>
  );
}
