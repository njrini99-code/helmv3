'use client';

import { useState } from 'react';
import type { CoachStatus } from '../page';

interface BulkActionsBarProps {
  selectedCount: number;
  onAction: (action: string, value?: unknown) => void;
  onClear: () => void;
  statusConfig: Record<CoachStatus, { label: string; icon: string }>;
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
    <div className="bg-gradient-to-r from-emerald-600 to-teal-500 text-white rounded-2xl px-5 py-3.5 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-4">
        <button
          onClick={onClear}
          className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
        >
          ✕
        </button>
        <span className="font-bold text-lg">{selectedCount} selected</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Change Status */}
        <div className="relative">
          <button
            onClick={() => {
              setShowStatusMenu(!showStatusMenu);
              setShowPriorityMenu(false);
            }}
            className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-sm font-semibold transition-colors"
          >
            📋 Change Status
          </button>
          {showStatusMenu && (
            <div className="absolute bottom-full mb-2 right-0 bg-white border border-slate-200 rounded-xl shadow-xl py-2 min-w-[180px] z-50">
              {Object.entries(statusConfig).map(([value, config]) => (
                <button
                  key={value}
                  onClick={() => {
                    onAction('status', value);
                    setShowStatusMenu(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <span>{config.icon}</span>
                  <span>{config.label}</span>
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
            className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-sm font-semibold transition-colors"
          >
            ⚡ Set Priority
          </button>
          {showPriorityMenu && (
            <div className="absolute bottom-full mb-2 right-0 bg-white border border-slate-200 rounded-xl shadow-xl py-2 min-w-[140px] z-50">
              {[
                { value: 2, label: '🔥 Hot' },
                { value: 1, label: '⚡ High' },
                { value: 0, label: 'Normal' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onAction('priority', opt.value);
                    setShowPriorityMenu(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Delete */}
        {confirmDelete ? (
          <div className="flex items-center gap-2 bg-red-500 rounded-xl px-4 py-2">
            <span className="text-sm font-medium">Delete {selectedCount}?</span>
            <button
              onClick={() => {
                onAction('delete');
                setConfirmDelete(false);
              }}
              className="px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-bold"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-sm"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="px-4 py-2 rounded-xl bg-red-500/80 hover:bg-red-500 text-sm font-semibold transition-colors"
          >
            🗑️ Delete
          </button>
        )}
      </div>
    </div>
  );
}
