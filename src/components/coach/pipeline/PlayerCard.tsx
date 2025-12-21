'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePeekPanelStore } from '@/stores/peek-panel-store';
import type { Player } from '@/lib/types';

interface PlayerCardProps {
  id: string;
  player: Player;
  onClick?: () => void;
}

export function PlayerCard({ id, player, onClick }: PlayerCardProps) {
  const { openPlayerPanel } = usePeekPanelStore();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      openPlayerPanel(player.id);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md hover:border-green-200 transition-all cursor-move"
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        {player.avatar_url ? (
          <img
            src={player.avatar_url}
            alt={player.full_name || ''}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
            <span className="text-sm font-medium text-slate-600">
              {player.first_name?.[0]}{player.last_name?.[0]}
            </span>
          </div>
        )}

        {/* Player Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">
            {player.full_name}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
              {player.primary_position}
            </span>
            <span className="text-xs text-slate-500">
              '{String(player.grad_year).slice(-2)}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 truncate">
            {player.city && player.state ? `${player.city}, ${player.state}` : player.state || 'N/A'}
          </p>
        </div>
      </div>
    </div>
  );
}
