'use client';

import { useState } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { PipelineColumn } from './PipelineColumn';
import { PlayerCard } from './PlayerCard';
import { updateWatchlistStatus } from '@/app/actions/watchlist';
import { useToast } from '@/components/ui/toast';
import type { Watchlist, Player, PipelineStage } from '@/types/database';

type WatchlistWithPlayer = Watchlist & { player: Player };

interface PipelineBoardProps {
  initialData: WatchlistWithPlayer[];
  onPlayerClick?: (player: Player) => void;
}

// Pipeline column configuration
const COLUMNS = [
  { id: 'watchlist', title: 'Prospects', color: 'bg-slate-100 text-slate-700' },
  { id: 'contacted', title: 'Contacted', color: 'bg-blue-100 text-blue-700' },
  { id: 'high_priority', title: 'Interested', color: 'bg-amber-100 text-amber-700' },
  { id: 'campus_visit', title: 'Campus Visit', color: 'bg-purple-100 text-purple-700' },
  { id: 'offer_extended', title: 'Offer Extended', color: 'bg-indigo-100 text-indigo-700' },
  { id: 'committed', title: 'Committed', color: 'bg-green-100 text-green-700' },
] as const;

export function PipelineBoard({ initialData, onPlayerClick }: PipelineBoardProps) {
  const { showToast } = useToast();
  const [data, setData] = useState<WatchlistWithPlayer[]>(initialData);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Group watchlist items by pipeline stage
  const groupedData = COLUMNS.reduce((acc, column) => {
    acc[column.id] = data.filter(item => item.pipeline_stage === column.id);
    return acc;
  }, {} as Record<string, WatchlistWithPlayer[]>);

  const activeItem = activeId ? data.find(item => item.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeItem = data.find(item => item.id === active.id);
    if (!activeItem) return;

    // Determine the target column
    let targetStage: PipelineStage | null = null;

    // Check if dropped directly on a column
    if (COLUMNS.some(col => col.id === over.id)) {
      targetStage = over.id as PipelineStage;
    } else {
      // Dropped on another item - find which column it belongs to
      const overItem = data.find(item => item.id === over.id);
      if (overItem) {
        targetStage = overItem.pipeline_stage;
      }
    }

    if (!targetStage || targetStage === activeItem.pipeline_stage) return;

    // Optimistic update: immediately update UI
    setData(prev => prev.map(item =>
      item.id === activeItem.id
        ? { ...item, pipeline_stage: targetStage as PipelineStage }
        : item
    ));

    // Background update: sync to database
    try {
      await updateWatchlistStatus(activeItem.id, targetStage);
    } catch (error) {
      console.error('Failed to update pipeline status:', error);
      // Revert optimistic update on error
      setData(prev => prev.map(item =>
        item.id === activeItem.id
          ? { ...item, pipeline_stage: activeItem.pipeline_stage }
          : item
      ));
      showToast('Failed to move player. Please try again.', 'error');
    }
  }

  return (
    <DndContext
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {COLUMNS.map(column => (
          <PipelineColumn
            key={column.id}
            id={column.id}
            title={column.title}
            count={groupedData[column.id]?.length || 0}
            color={column.color}
          >
            <SortableContext
              items={groupedData[column.id]?.map(item => item.id) || []}
              strategy={verticalListSortingStrategy}
            >
              {groupedData[column.id]?.map(item => (
                <PlayerCard
                  key={item.id}
                  id={item.id}
                  player={item.player}
                  onClick={() => onPlayerClick?.(item.player)}
                />
              ))}
            </SortableContext>
          </PipelineColumn>
        ))}
      </div>

      {/* Drag Overlay - shows the card being dragged */}
      <DragOverlay>
        {activeItem ? (
          <PlayerCard
            id={activeItem.id}
            player={activeItem.player}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
