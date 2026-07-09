'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { POSITIONS } from '@/lib/types';
import { GripVertical, X, Plus } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/button';
import { PaperCard } from '@/components/baseball/living-annual';

interface PositionPriorityRankerProps {
  priorities: string[];
  onChange: (priorities: string[]) => void;
  maxPositions?: number;
}

const POSITION_INFO: Record<string, { label: string; description: string }> = {
  C: { label: 'Catcher', description: 'Primary backstop position' },
  '1B': { label: 'First Base', description: 'Corner infield position' },
  '2B': { label: 'Second Base', description: 'Middle infield position' },
  '3B': { label: 'Third Base', description: 'Corner infield, hot corner' },
  SS: { label: 'Shortstop', description: 'Middle infield, defensive anchor' },
  OF: { label: 'Outfield', description: 'LF, CF, or RF' },
  LHP: { label: 'Left-Handed Pitcher', description: 'Southpaw on the mound' },
  RHP: { label: 'Right-Handed Pitcher', description: 'Right-handed hurler' },
  UTL: { label: 'Utility', description: 'Multi-position player' },
};

export function PositionPriorityRanker({
  priorities,
  onChange,
  maxPositions = 9,
}: PositionPriorityRankerProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const availablePositions = POSITIONS.filter((p) => !priorities.includes(p));

  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedIndex !== null && draggedIndex !== index) {
        setDragOverIndex(index);
      }
    },
    [draggedIndex]
  );

  const handleDragEnd = useCallback(() => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const newPriorities = [...priorities];
      const [removed] = newPriorities.splice(draggedIndex, 1);
      if (removed !== undefined) {
        newPriorities.splice(dragOverIndex, 0, removed);
        onChange(newPriorities);
      }
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [draggedIndex, dragOverIndex, priorities, onChange]);

  const handleRemove = useCallback(
    (index: number) => {
      const newPriorities = priorities.filter((_, i) => i !== index);
      onChange(newPriorities);
    },
    [priorities, onChange]
  );

  const handleAdd = useCallback(
    (position: string) => {
      if (priorities.length < maxPositions && !priorities.includes(position)) {
        onChange([...priorities, position]);
      }
      setShowAddMenu(false);
    },
    [priorities, maxPositions, onChange]
  );

  const handleClear = useCallback(() => {
    onChange([]);
  }, [onChange]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-warm-900">Position Priorities</h3>
          <p className="text-sm text-warm-500 mt-1">
            Drag to reorder. Top positions get bonus points in matching.
          </p>
        </div>
        {priorities.length > 0 && (
          <Button variant="ghost"
            onClick={handleClear}
            className="text-sm text-warm-500 hover:text-warm-700 underline"
          >
            Clear all
          </Button>
        )}
      </div>

      {/* Priority list */}
      <div className="space-y-2">
        {priorities.length === 0 ? (
          <div className="bg-warm-50 rounded-xl p-8 text-center">
            <p className="text-warm-500 mb-4">No position priorities set</p>
            <p className="text-sm text-warm-400">
              Add positions to give bonus points to players at those positions
            </p>
          </div>
        ) : (
          priorities.map((position, index) => {
            const info = POSITION_INFO[position];
            const isBeingDragged = draggedIndex === index;
            const isDragTarget = dragOverIndex === index;

            return (
              // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- draggable list item, keyboard reordering not yet implemented
              <div
                key={position}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border transition-all',
                  'bg-cream-50 cursor-grab active:cursor-grabbing',
                  isBeingDragged && 'opacity-50 scale-95',
                  isDragTarget && 'border-primary-500 bg-primary-50',
                  !isBeingDragged && !isDragTarget && 'border-warm-200 hover:border-warm-300'
                )}
              >
                {/* Drag handle */}
                <GripVertical className="w-4 h-4 text-warm-400 flex-shrink-0" />

                {/* Rank number */}
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                    index === 0
                      ? 'bg-primary-100 text-primary-700'
                      : index === 1
                        ? 'bg-primary-50 text-primary-600'
                        : index === 2
                          ? 'bg-warm-100 text-warm-600'
                          : 'bg-warm-50 text-warm-400'
                  )}
                >
                  {index + 1}
                </div>

                {/* Position info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-warm-900">{position}</span>
                    <span className="text-warm-500">—</span>
                    <span className="text-sm text-warm-600">{info?.label}</span>
                  </div>
                  <p className="text-xs text-warm-400 truncate">{info?.description}</p>
                </div>

                {/* Bonus indicator */}
                <div className="text-right flex-shrink-0">
                  <span
                    className={cn(
                      'text-xs font-medium px-2 py-0.5 rounded-full',
                      index === 0
                        ? 'bg-primary-100 text-primary-700'
                        : index < 3
                          ? 'bg-warm-100 text-warm-600'
                          : 'bg-warm-50 text-warm-400'
                    )}
                  >
                    +{Math.max(2, 10 - index * 2)} pts
                  </span>
                </div>

                {/* Remove button */}
                <IconButton variant="default" aria-label="Close"
                  onClick={() => handleRemove(index)}
                  className="p-1 text-warm-400 hover:text-red-500 hover:bg-red-50 active:bg-red-100 rounded transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </IconButton>
              </div>
            );
          })
        )}
      </div>

      {/* Add button */}
      {availablePositions.length > 0 && priorities.length < maxPositions && (
        <div className="relative">
          <Button variant="primary"
            onClick={() => setShowAddMenu(!showAddMenu)}
            className={cn(
              'w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed transition-colors',
              showAddMenu
                ? 'border-primary-300 bg-primary-50 text-primary-700'
                : 'border-warm-200 text-warm-500 hover:border-warm-300 hover:text-warm-700'
            )}
          >
            <Plus className="w-4 h-4" />
            <span className="font-medium">Add Position Priority</span>
          </Button>

          {/* Dropdown menu */}
          {showAddMenu && (
            <PaperCard className="absolute top-full left-0 right-0 mt-2 shadow-lg z-10" grain={false}>
              <div className="max-h-64 overflow-y-auto">
                {availablePositions.map((position) => {
                  const info = POSITION_INFO[position];
                  return (
                    <Button variant="ghost"
                      key={position}
                      onClick={() => handleAdd(position)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-warm-50 active:bg-warm-100 transition-colors text-left"
                    >
                      <span className="font-semibold text-warm-900 w-10">{position}</span>
                      <span className="text-sm text-warm-600">{info?.label}</span>
                    </Button>
                  );
                })}
              </div>
            </PaperCard>
          )}
        </div>
      )}

      {/* Summary */}
      {priorities.length > 0 && (
        <div className="bg-warm-50 rounded-xl p-4">
          <p className="text-xs font-medium text-warm-500 uppercase tracking-wider mb-2">
            Bonus Points Structure
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-warm-600">
            <span>
              <strong>#1:</strong> +10 pts
            </span>
            <span>
              <strong>#2:</strong> +8 pts
            </span>
            <span>
              <strong>#3:</strong> +6 pts
            </span>
            <span>
              <strong>#4:</strong> +4 pts
            </span>
            <span>
              <strong>#5+:</strong> +2 pts
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
