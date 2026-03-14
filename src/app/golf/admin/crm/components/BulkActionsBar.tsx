'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
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
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className={cn(
      'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pb-[env(safe-area-inset-bottom)]',
      'flex items-center gap-3 px-4 py-2.5 rounded-2xl',
      'bg-warm-900 text-white shadow-2xl',
      'border border-white/10',
      'animate-slide-up'
    )}>
      {/* Count */}
      <span className="text-sm font-medium tabular-nums">{selectedCount} selected</span>

      <div className="w-px h-5 bg-white/20" />

      {/* Move to Status */}
      <div className="relative">
        <button
          onClick={() => setShowStatusMenu(!showStatusMenu)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
        >
          <IconArrowRight size={14} /> Move to
          <IconChevronUp size={12} className={cn('transition-transform', showStatusMenu && 'rotate-180')} />
        </button>
        {showStatusMenu && (
          <div className="absolute bottom-full mb-2 left-0 bg-white/95 backdrop-blur-xl border border-warm-200/50 rounded-xl shadow-xl py-1 min-w-[180px] max-h-[400px] overflow-y-auto">
            {ALL_STATUSES.map(status => (
              <button key={status}
                onClick={() => { onAction('status', status); setShowStatusMenu(false); }}
                className="w-full text-left px-4 py-2 text-sm text-warm-700 hover:bg-warm-50 active:bg-warm-100 transition-colors flex items-center gap-2">
                <span className="flex items-center">{statusConfig[status]?.icon}</span>
                <span>{statusConfig[status]?.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Email */}
      <button
        onClick={() => onAction('email')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
      >
        <IconMail size={14} /> Email
      </button>

      {/* Star */}
      <button
        onClick={() => onAction('star')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
      >
        <IconStar size={14} /> Star
      </button>

      {/* Unstar */}
      <button
        onClick={() => onAction('unstar')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
      >
        ☆ Unstar
      </button>

      <div className="w-px h-5 bg-white/20" />

      {/* Delete */}
      {confirmDelete ? (
        <div className="flex items-center gap-2 bg-red-500/80 rounded-lg px-3 py-1.5">
          <span className="text-sm font-medium">Delete {selectedCount}?</span>
          <button onClick={() => { onAction('delete'); setConfirmDelete(false); }}
            className="px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-sm font-bold">Yes</button>
          <button onClick={() => setConfirmDelete(false)}
            className="px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-sm">No</button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors">
          <IconTrash size={14} /> Delete
        </button>
      )}

      <div className="w-px h-5 bg-white/20" />

      {/* Dismiss */}
      <button onClick={onClear} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
        <IconX size={16} />
      </button>
    </div>
  );
}
