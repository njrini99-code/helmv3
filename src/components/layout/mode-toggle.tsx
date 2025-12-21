'use client';

import { cn } from '@/lib/utils';

export type Mode = 'recruiting' | 'team';

interface ModeToggleProps {
  currentMode: Mode;
  onModeChange: (mode: Mode) => void;
}

export function ModeToggle({ currentMode, onModeChange }: ModeToggleProps) {
  return (
    <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg">
      <button
        onClick={() => onModeChange('recruiting')}
        className={cn(
          'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all',
          currentMode === 'recruiting'
            ? 'bg-white text-green-700 shadow-sm'
            : 'text-slate-600 hover:text-slate-900'
        )}
      >
        Recruiting
      </button>
      <button
        onClick={() => onModeChange('team')}
        className={cn(
          'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all',
          currentMode === 'team'
            ? 'bg-white text-green-700 shadow-sm'
            : 'text-slate-600 hover:text-slate-900'
        )}
      >
        Team
      </button>
    </div>
  );
}
