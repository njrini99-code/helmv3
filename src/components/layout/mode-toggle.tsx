'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type Mode = 'recruiting' | 'team';

interface ModeToggleProps {
  currentMode: Mode;
  onModeChange: (mode: Mode) => void;
}

export function ModeToggle({ currentMode, onModeChange }: ModeToggleProps) {
  return (
    <div className="flex items-center gap-2 p-1 bg-warm-100 rounded-lg">
      <Button variant="ghost"
        onClick={() => onModeChange('recruiting')}
        className={cn(
          'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all',
          currentMode === 'recruiting'
            ? 'bg-cream-50 text-primary-700 shadow-sm'
            : 'text-warm-600 hover:text-warm-900'
        )}
      >
        Recruiting
      </Button>
      <Button variant="ghost"
        onClick={() => onModeChange('team')}
        className={cn(
          'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all',
          currentMode === 'team'
            ? 'bg-cream-50 text-primary-700 shadow-sm'
            : 'text-warm-600 hover:text-warm-900'
        )}
      >
        Team
      </Button>
    </div>
  );
}
