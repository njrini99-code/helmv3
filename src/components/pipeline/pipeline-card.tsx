'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVerticalIcon, MailIcon, PhoneIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Recruit } from '@/lib/types/player-cards';
import { formatDistanceToNow } from 'date-fns';

// ============================================
// TYPES
// ============================================

interface PipelineCardProps {
  recruit: Recruit;
  isDragging?: boolean;
  onClick?: () => void;
}

// ============================================
// COMPONENT
// ============================================

export function PipelineCard({
  recruit,
  isDragging = false,
  onClick,
}: PipelineCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: recruit.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group',
        'bg-white rounded-[12px]',
        'border border-warm-100',
        'p-3',
        'cursor-pointer',
        'transition-all duration-200',
        isDragging || isSortableDragging
          ? 'shadow-lg scale-105 rotate-2 opacity-90'
          : 'hover:shadow-md hover:border-warm-200'
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="
            mt-1 p-0.5
            text-warm-300 hover:text-warm-500
            cursor-grab active:cursor-grabbing
            opacity-0 group-hover:opacity-100
            transition-opacity duration-200
          "
        >
          <GripVerticalIcon className="w-4 h-4" />
        </div>

        {/* Avatar */}
        <div
          className="
          w-10 h-10 rounded-[8px] overflow-hidden flex-shrink-0
          bg-warm-100
        "
        >
          {recruit.avatar_url ? (
            <img
              src={recruit.avatar_url}
              alt={`${recruit.first_name} ${recruit.last_name}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-warm-500 font-semibold text-sm">
              {recruit.first_name?.[0]}
              {recruit.last_name?.[0]}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm text-warm-900 truncate">
            {recruit.first_name} {recruit.last_name}
          </h4>
          <p className="text-xs text-warm-500 truncate">
            {recruit.primary_position} • {recruit.grad_year}
          </p>
          <p className="text-xs text-warm-400 truncate mt-0.5">{recruit.high_school_name}</p>
        </div>
      </div>

      {/* Quick Contact Icons */}
      <div
        className="
        flex items-center gap-1 mt-2 pt-2
        border-t border-warm-100
        opacity-0 group-hover:opacity-100
        transition-opacity duration-200
      "
      >
        {recruit.email && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.location.href = `mailto:${recruit.email}`;
            }}
            className="p-1.5 text-warm-400 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors"
            title="Send email"
          >
            <MailIcon className="w-3.5 h-3.5" />
          </button>
        )}
        {recruit.phone && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.location.href = `tel:${recruit.phone}`;
            }}
            className="p-1.5 text-warm-400 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors"
            title="Call"
          >
            <PhoneIcon className="w-3.5 h-3.5" />
          </button>
        )}
        <span className="flex-1" />
        {recruit.created_at && (
          <span className="text-[10px] text-warm-400">
            Added {formatDistanceToNow(new Date(recruit.created_at))} ago
          </span>
        )}
      </div>
    </div>
  );
}
