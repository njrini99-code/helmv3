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
      'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pb-[env(safe-area-inset-bottom)]',
      'flex items-center gap-3 px-4 py-2.5 rounded-2xl',
      'bg-white/80 backdrop-blur-xl text-warm-800 shadow-2xl',
      'border border-white/20',
      'animate-slide-up'
    )}>
      {/* Count */}
      <span className="text-sm font-medium tabular-nums text-warm-900">{selectedCount} selected</span>

      <div className="w-px h-5 bg-warm-200" />

      {/* Move to Status */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-warm-700 hover:bg-warm-100 transition-colors">
            <IconArrowRight size={14} /> Move to
            <IconChevronUp size={12} className="transition-transform data-[state=open]:rotate-180" />
          </button>
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
      <button
        onClick={() => onAction('email')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-warm-700 hover:bg-warm-100 transition-colors"
      >
        <IconMail size={14} /> Email
      </button>

      {/* Star */}
      <button
        onClick={() => onAction('star')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-warm-700 hover:bg-warm-100 transition-colors"
      >
        <IconStar size={14} /> Star
      </button>

      {/* Unstar */}
      <button
        onClick={() => onAction('unstar')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-warm-700 hover:bg-warm-100 transition-colors"
      >
        <IconStar size={14} className="text-warm-400" /> Unstar
      </button>

      <div className="w-px h-5 bg-warm-200" />

      {/* Delete */}
      {confirmDelete ? (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
          <span className="text-sm font-medium text-red-700">Delete {selectedCount}?</span>
          <button onClick={() => { onAction('delete'); setConfirmDelete(false); }}
            className="px-2 py-0.5 rounded-lg bg-red-500 text-white hover:bg-red-600 text-sm font-bold">Yes</button>
          <button onClick={() => setConfirmDelete(false)}
            className="px-2 py-0.5 rounded-lg bg-warm-100 text-warm-600 hover:bg-warm-200 text-sm">No</button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
          <IconTrash size={14} /> Delete
        </button>
      )}

      <div className="w-px h-5 bg-warm-200" />

      {/* Dismiss */}
      <button onClick={onClear} aria-label="Clear selection" className="p-1.5 rounded-md hover:bg-warm-100 transition-colors text-warm-500 hover:text-warm-900">
        <IconX size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
