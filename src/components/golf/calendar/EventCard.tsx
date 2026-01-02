'use client';

import { forwardRef } from 'react';
import { MapPin, GripVertical } from 'lucide-react';
import { useDraggable, type DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { cn } from '@/lib/utils';
import type { EventType } from '@/lib/types/calendar';
import { getEventTypeConfig, formatTime } from '@/lib/calendar/event-styles';

export interface EventCardProps {
  id: string;
  title: string;
  type: string; // Event type string (accepts any event type for flexibility)
  startTime: string;
  endTime: string;
  location?: string;
  compact?: boolean;
  onClick?: () => void;
  isDraggable?: boolean;
  isOverlay?: boolean;
}

// Inner card component for rendering
const EventCardInner = forwardRef<
  HTMLButtonElement,
  EventCardProps & {
    isDragging?: boolean;
    dragAttributes?: DraggableAttributes;
    dragListeners?: SyntheticListenerMap;
  }
>(function EventCardInner(
  {
    title,
    type,
    startTime,
    location,
    compact = false,
    onClick,
    isDragging = false,
    isOverlay = false,
    isDraggable = false,
    dragAttributes,
    dragListeners,
  },
  ref
) {
  // Cast string type to EventType for styling (fallback to 'other' if not matched)
  const styles = getEventTypeConfig(type as EventType);

  if (compact) {
    return (
      <button
        ref={ref}
        onClick={onClick}
        className={cn(
          'w-full rounded-[8px] overflow-hidden text-left px-2.5 py-1.5',
          'border-l-[3px]',
          'transition-all duration-200',
          'hover:scale-[1.02] hover:shadow-md hover:z-10',
          'backdrop-blur-sm',
          isDragging && 'opacity-50 shadow-lg scale-105',
          isOverlay && 'shadow-xl scale-105 cursor-grabbing',
          isDraggable && !isDragging && 'cursor-grab',
          !isDraggable && 'cursor-pointer',
          styles.bgColor,
          styles.borderColor,
          styles.textColor
        )}
        {...dragAttributes}
        {...dragListeners}
      >
        <p className="font-semibold text-[10px] truncate leading-tight">{title}</p>
      </button>
    );
  }

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={cn(
        'w-full h-full rounded-[10px] overflow-hidden text-left px-3 py-2.5',
        'border-l-[3px]',
        'transition-all duration-200',
        'hover:scale-[1.01] hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] hover:z-10',
        'backdrop-blur-sm',
        isDragging && 'opacity-50 shadow-lg scale-105',
        isOverlay && 'shadow-xl scale-105 cursor-grabbing ring-2 ring-stone-200',
        isDraggable && !isDragging && 'cursor-grab',
        !isDraggable && 'cursor-pointer',
        styles.bgColor,
        styles.borderColor,
        styles.textColor
      )}
      {...dragAttributes}
      {...dragListeners}
    >
      <div className="flex items-start gap-1.5">
        {isDraggable && (
          <GripVertical className="w-3 h-3 opacity-40 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-xs truncate leading-tight mb-1">{title}</p>
          <p className="text-[10px] opacity-75 leading-tight font-medium">
            {formatTime(startTime)}
          </p>
          {location && (
            <p className="text-[10px] opacity-60 leading-tight flex items-center gap-0.5 mt-0.5">
              <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="truncate">{location}</span>
            </p>
          )}
        </div>
      </div>
    </button>
  );
});

export function EventCard(props: EventCardProps) {
  const { isDraggable = false, isOverlay = false } = props;

  // If not draggable or is overlay, render without DnD hooks
  if (!isDraggable || isOverlay) {
    return <EventCardInner {...props} />;
  }

  // Draggable version
  return <DraggableEventCard {...props} />;
}

function DraggableEventCard(props: EventCardProps) {
  const { id } = props;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id,
    data: {
      eventId: id,
      type: 'event',
    },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} className="h-full">
      <EventCardInner
        {...props}
        isDragging={isDragging}
        dragAttributes={attributes}
        dragListeners={listeners}
      />
    </div>
  );
}
