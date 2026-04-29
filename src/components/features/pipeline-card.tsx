'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getFullName, getPipelineStageLabel } from '@/lib/utils';
import { useWatchlist } from '@/hooks/use-watchlist';
import type { Watchlist, PipelineStage, Player } from '@/lib/types';
import { cn } from '@/lib/utils';

const stages: PipelineStage[] = ['watchlist', 'high_priority', 'offer_extended', 'committed', 'uninterested'];

// Watchlist with joined player data
type WatchlistItem = Watchlist & {
  player?: Player;
};

interface PipelineCardProps {
  item: WatchlistItem;
  isDragging?: boolean;
}

export function PipelineCard({ item, isDragging = false }: PipelineCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging: isActuallyDragging } = useDraggable({
    id: item.id,
  });

  const { updateStage, removeFromWatchlist } = useWatchlist();
  const name = getFullName(item.player?.first_name, item.player?.last_name);

  const currentStage = item.pipeline_stage ?? 'watchlist';
  const nextStage = stages[stages.indexOf(currentStage) + 1];
  const prevStage = stages[stages.indexOf(currentStage) - 1];

  const style = {
    transform: CSS.Transform.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'transition-all duration-200',
        isActuallyDragging && 'opacity-50 cursor-grabbing',
        !isActuallyDragging && 'cursor-grab active:cursor-grabbing',
        isDragging && 'shadow-elevation-3 scale-105'
      )}
    >
      <div className={cn(
        'relative bg-cream-100/75 backdrop-blur-md rounded-[20px] border border-warm-200/55 shadow-sm overflow-clip',
        'hover:shadow-lg hover:-translate-y-1 transition-all duration-200',
        isActuallyDragging && 'rotate-2 shadow-xl scale-105'
      )}>
        {/* Shine effect */}
        <div
          className="absolute inset-x-0 top-0 h-px pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
          }}
        />
        <div className="p-3">
          <Link
            href={`/baseball/dashboard/players/${item.player_id}`}
            className="flex items-center gap-3 group"
            onClick={(e) => {
              if (isActuallyDragging) e.preventDefault();
            }}
          >
            <Avatar name={name} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate group-hover:text-slate-700 transition-colors">{name}</p>
              <p className="text-xs text-slate-500">{item.player?.primary_position} • {item.player?.grad_year}</p>
            </div>
          </Link>
          {item.notes && <p className="text-xs text-slate-500 mt-2 line-clamp-2">{item.notes}</p>}
          {!isDragging && (
            <div className="flex gap-1 mt-3 flex-wrap opacity-0 group-hover:opacity-100 transition-opacity">
              {prevStage && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateStage(item.player_id, prevStage);
                  }}
                  className="text-xs px-2 h-7"
                >
                  ← {getPipelineStageLabel(prevStage)}
                </Button>
              )}
              {nextStage && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateStage(item.player_id, nextStage);
                  }}
                  className="text-xs px-2 h-7"
                >
                  {getPipelineStageLabel(nextStage)} →
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFromWatchlist(item.player_id);
                }}
                className="text-xs px-2 h-7 text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors active:bg-red-100 ml-auto"
              >
                Remove
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
