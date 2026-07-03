'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { IconStar, IconArrowRight, IconMail, IconTrash, IconX, IconChevronUp } from '@/components/icons';
import type { CoachStatus } from '../crm-config';
import { Button, IconButton } from '@/components/ui/button';

interface BulkActionsBarProps {
  selectedCount: number;
  onAction: (action: string, value?: unknown) => void;
  onClear: () => void;
  statusConfig: Record<CoachStatus, { label: string; icon: React.ReactNode }>;
}

const ALL_STATUSES: CoachStatus[] = [
  'new_lead', 'contacted', 'engaged', 'proposal', 'won', 'lost', 'nurture',
];

export function BulkActionsBar({
  selectedCount,
  onAction,
  onClear,
  statusConfig,
}: BulkActionsBarProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className={cn(
      'fixed z-50 pb-[env(safe-area-inset-bottom)]',
      // Mobile: full-width above the browser toolbar, actions wrap to fit.
      // Desktop (sm+): centered floating pill on a single row.
      'left-3 right-3 bottom-20 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:bottom-6',
      'flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 sm:gap-3 px-4 py-2.5 rounded-2xl',
      'glass-prominent text-warm-800 shadow-2xl',
      'animate-slide-up'
    )}>
      {/* Count */}
      <span className="text-sm font-medium tabular-nums text-warm-900">{selectedCount} selected</span>

      <div className="hidden sm:block w-px h-5 bg-warm-200" />

      {/* Move to Status */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-warm-700 hover:bg-warm-100 transition-colors">
            <IconArrowRight size={14} /> Move to
            <IconChevronUp size={12} className="transition-transform data-[state=open]:rotate-180" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="min-w-[180px] max-h-[400px] overflow-y-auto">
          {ALL_STATUSES.map(status => (
            <DropdownMenuItem
              key={status}
              onSelect={() => onAction('status', status)}
              className="gap-2"
            >
              <span className="flex items-center">{statusConfig[status]?.icon}</span>
              <span>{statusConfig[status]?.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Email */}
      <Button variant="ghost"
        onClick={() => onAction('email')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-warm-700 hover:bg-warm-100 transition-colors"
      >
        <IconMail size={14} /> Email
      </Button>

      {/* Star */}
      <Button variant="ghost"
        onClick={() => onAction('star')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-warm-700 hover:bg-warm-100 transition-colors"
      >
        <IconStar size={14} /> Star
      </Button>

      {/* Unstar */}
      <Button variant="ghost"
        onClick={() => onAction('unstar')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-warm-700 hover:bg-warm-100 transition-colors"
      >
        <IconStar size={14} className="text-warm-400" /> Unstar
      </Button>

      <div className="hidden sm:block w-px h-5 bg-warm-200" />

      {/* Delete */}
      {confirmDelete ? (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
          <span className="text-sm font-medium text-red-700">Delete {selectedCount}?</span>
          <Button variant="danger" onClick={() => { onAction('delete'); setConfirmDelete(false); }}
            className="px-2 py-0.5 rounded-lg bg-red-500 text-white hover:bg-red-600 text-sm font-bold">Yes</Button>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}
            className="px-2 py-0.5 rounded-lg bg-warm-100 text-warm-600 hover:bg-warm-200 text-sm">No</Button>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setConfirmDelete(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
          <IconTrash size={14} /> Delete
        </Button>
      )}

      <div className="hidden sm:block w-px h-5 bg-warm-200" />

      {/* Dismiss */}
      <IconButton variant="default" onClick={onClear} aria-label="Clear selection" className="p-1.5 rounded-md hover:bg-warm-100 transition-colors text-warm-500 hover:text-warm-900">
        <IconX size={14} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
