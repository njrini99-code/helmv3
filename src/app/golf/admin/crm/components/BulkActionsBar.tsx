'use client';

import { useState } from 'react';
import type { CoachStatus } from '../page';
import { IconX, IconCheck, IconTrash } from '@/components/icons';

interface BulkActionsBarProps {
  selectedCount: number;
  onAction: (action: string, value?: unknown) => void;
  onClear: () => void;
  statusConfig: Record<CoachStatus, { label: string }>;
}

export function BulkActionsBar({
  selectedCount,
  onAction,
  onClear,
  statusConfig,
}: BulkActionsBarProps) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="bg-emerald-600 text-white rounded-xl px-4 py-3 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-4">
        <button
          onClick={onClear}
          className="p-1.5 rounded-lg hover:bg-emerald-500 transition-colors"
        >
          <IconX className="w-4 h-4" />
        </button>
        <span className="font-medium">{selectedCount} selected</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Change Status */}
        <div className="relative">
          <button
            onClick={() => {
              setShowStatusMenu(!showStatusMenu);
              setShowPriorityMenu(false);
            }}
            className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-sm font-medium transition-colors"
          >
            Change Status
          </button>
          {showStatusMenu && (
            <div className="absolute bottom-full mb-2 right-0 bg-white border border-warm-200 rounded-lg shadow-xl py-1 min-w-[180px] max-h-[300px] overflow-y-auto z-50">
              {Object.entries(statusConfig).map(([value, config]) => (
                <button
                  key={value}
                  onClick={() => {
                    onAction('status', value);
                    setShowStatusMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-warm-700 hover:bg-warm-50 transition-colors"
                >
                  {config.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Change Priority */}
        <div className="relative">
          <button
            onClick={() => {
              setShowPriorityMenu(!showPriorityMenu);
              setShowStatusMenu(false);
            }}
            className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-sm font-medium transition-colors"
          >
            Set Priority
          </button>
          {showPriorityMenu && (
            <div className="absolute bottom-full mb-2 right-0 bg-white border border-warm-200 rounded-lg shadow-xl py-1 min-w-[140px] z-50">
              {[
                { value: 3, label: '🔥 Hot' },
                { value: 2, label: '!! Urgent' },
                { value: 1, label: '! High' },
                { value: 0, label: 'Normal' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onAction('priority', opt.value);
                    setShowPriorityMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-warm-700 hover:bg-warm-50 transition-colors"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Delete */}
        {confirmDelete ? (
          <div className="flex items-center gap-2 bg-red-500 rounded-lg px-3 py-1.5">
            <span className="text-sm">Delete {selectedCount}?</span>
            <button
              onClick={() => {
                onAction('delete');
                setConfirmDelete(false);
              }}
              className="p-1 rounded bg-white/20 hover:bg-white/30"
            >
              <IconCheck className="w-4 h-4" />
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="p-1 rounded bg-white/20 hover:bg-white/30"
            >
              <IconX className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="px-4 py-1.5 rounded-lg bg-red-500 hover:bg-red-400 text-sm font-medium transition-colors flex items-center gap-1"
          >
            <IconTrash className="w-4 h-4" />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
