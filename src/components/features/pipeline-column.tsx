'use client';

import { useDroppable } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { PipelineCard } from './pipeline-card';
import { getPipelineStageLabel, cn } from '@/lib/utils';
import type { Watchlist, PipelineStage, Player } from '@/lib/types';

// Watchlist with joined player data
type WatchlistItem = Watchlist & {
  player?: Player;
};

interface PipelineColumnProps {
  stage: PipelineStage;
  items: WatchlistItem[];
}

export function PipelineColumn({ stage, items }: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative rounded-2xl p-4 min-h-[500px] transition-all duration-200 overflow-hidden',
        'bg-white/50 backdrop-blur-sm border border-white/30',
        isOver && 'ring-2 ring-slate-900 ring-offset-2 bg-slate-50/80'
      )}
    >
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
        }}
      />
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900 tracking-tight text-sm">{getPipelineStageLabel(stage)}</h3>
        <Badge variant="secondary" className={cn(
          'tabular-nums',
          isOver && 'bg-slate-900 text-white'
        )}>{items.length}</Badge>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="animate-fade-in"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <PipelineCard item={item} />
          </div>
        ))}
        {items.length === 0 && (
          <p className={cn(
            'text-sm text-center py-8 transition-colors',
            isOver ? 'text-slate-900 font-medium' : 'text-slate-400'
          )}>
            {isOver ? 'Drop here' : 'No players'}
          </p>
        )}
      </div>
    </div>
  );
}
