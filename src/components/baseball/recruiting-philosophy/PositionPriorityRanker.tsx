'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { POSITIONS } from '@/lib/types';
import { GripVertical, X, Plus } from 'lucide-react';

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
          <h3 className="text-lg font-semibold text-slate-900">Position Priorities</h3>
          <p className="text-sm text-slate-500 mt-1">
            Drag to reorder. Top positions get bonus points in matching.
          </p>
        </div>
        {priorities.length > 0 && (
          <button
            onClick={handleClear}
            className="text-sm text-slate-500 hover:text-slate-700 underline"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Priority list */}
      <div className="space-y-2">
        {priorities.length === 0 ? (
          <div className="bg-slate-50 rounded-xl p-8 text-center">
            <p className="text-slate-500 mb-4">No position priorities set</p>
            <p className="text-sm text-slate-400">
              Add positions to give bonus points to players at those positions
            </p>
          </div>
        ) : (
          priorities.map((position, index) => {
            const info = POSITION_INFO[position];
            const isBeingDragged = draggedIndex === index;
            const isDragTarget = dragOverIndex === index;

            return (
              <div
                key={position}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border transition-all',
                  'bg-white cursor-grab active:cursor-grabbing',
                  isBeingDragged && 'opacity-50 scale-95',
                  isDragTarget && 'border-green-500 bg-green-50',
                  !isBeingDragged && !isDragTarget && 'border-slate-200 hover:border-slate-300'
                )}
              >
                {/* Drag handle */}
                <GripVertical className="w-4 h-4 text-slate-400 flex-shrink-0" />

                {/* Rank number */}
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                    index === 0
                      ? 'bg-green-100 text-green-700'
                      : index === 1
                        ? 'bg-green-50 text-green-600'
                        : index === 2
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-slate-50 text-slate-400'
                  )}
                >
                  {index + 1}
                </div>

                {/* Position info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{position}</span>
                    <span className="text-slate-500">—</span>
                    <span className="text-sm text-slate-600">{info?.label}</span>
                  </div>
                  <p className="text-xs text-slate-400 truncate">{info?.description}</p>
                </div>

                {/* Bonus indicator */}
                <div className="text-right flex-shrink-0">
                  <span
                    className={cn(
                      'text-xs font-medium px-2 py-0.5 rounded-full',
                      index === 0
                        ? 'bg-green-100 text-green-700'
                        : index < 3
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-slate-50 text-slate-400'
                    )}
                  >
                    +{Math.max(2, 10 - index * 2)} pts
                  </span>
                </div>

                {/* Remove button */}
                <button
                  onClick={() => handleRemove(index)}
                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Add button */}
      {availablePositions.length > 0 && priorities.length < maxPositions && (
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className={cn(
              'w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed transition-colors',
              showAddMenu
                ? 'border-green-300 bg-green-50 text-green-700'
                : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
            )}
          >
            <Plus className="w-4 h-4" />
            <span className="font-medium">Add Position Priority</span>
          </button>

          {/* Dropdown menu */}
          {showAddMenu && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-lg z-10 overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                {availablePositions.map((position) => {
                  const info = POSITION_INFO[position];
                  return (
                    <button
                      key={position}
                      onClick={() => handleAdd(position)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors text-left"
                    >
                      <span className="font-semibold text-slate-900 w-10">{position}</span>
                      <span className="text-sm text-slate-600">{info?.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      {priorities.length > 0 && (
        <div className="bg-slate-50 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
            Bonus Points Structure
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
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
