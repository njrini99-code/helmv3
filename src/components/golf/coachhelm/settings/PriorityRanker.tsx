'use client';

import { useState, useEffect } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { PRIORITY_METRICS, PriorityMetric, CoachPhilosophy } from '@/lib/coachhelm/types';

// Types for the component
type PriorityKeys = 'priorityBallStriking' | 'priorityShortGame' | 'priorityPutting' | 'priorityCourseManagement' | 'priorityMentalGame';
type PriorityValues = Pick<CoachPhilosophy, PriorityKeys>;

interface PriorityRankerProps {
    values: PriorityValues;
    onChange: (values: PriorityValues) => void;
}

// Single draggable item
function SortableItem({ metric, rank }: { metric: PriorityMetric; rank: number }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: metric.key,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'flex items-center gap-4 p-4 rounded-xl border bg-white transition-all duration-150',
                isDragging
                    ? 'shadow-xl border-primary-300 scale-[1.02] z-10 relative'
                    : 'border-warm-200 hover:border-warm-300'
            )}
        >
            {/* Drag handle */}
            <button
                {...attributes}
                {...listeners}
                className="p-1 rounded hover:bg-warm-100 transition-colors cursor-grab active:cursor-grabbing touch-none"
                aria-label="Drag to reorder"
            >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-warm-400">
                    <path d="M4 6h8M4 10h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            </button>

            {/* Rank badge */}
            <div
                className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold',
                    rank === 1 && 'bg-primary-100 text-primary-700',
                    rank === 2 && 'bg-primary-50 text-primary-600',
                    rank === 3 && 'bg-warm-100 text-warm-600',
                    rank === 4 && 'bg-warm-50 text-warm-500',
                    rank === 5 && 'bg-warm-50 text-warm-400'
                )}
            >
                {rank}
            </div>

            {/* Icon */}
            <span className="text-xl">{metric.icon}</span>

            {/* Label & description */}
            <div className="flex-1 min-w-0">
                <div className="font-medium text-warm-900 text-sm">{metric.label}</div>
                <div className="text-xs text-warm-500 truncate">{metric.description}</div>
            </div>

            {/* Priority bar */}
            <div className="w-12 h-1.5 bg-warm-100 rounded-full overflow-hidden">
                <div
                    className="h-full bg-primary-500 rounded-full transition-all duration-300"
                    style={{ width: `${(6 - rank) * 20}%` }}
                />
            </div>
        </div>
    );
}

export function PriorityRanker({ values, onChange }: PriorityRankerProps) {
    // Sort metrics by their current priority values to get initial order
    const getOrderFromValues = (vals: PriorityValues): PriorityKeys[] => {
        return [...PRIORITY_METRICS]
            .sort((a, b) => vals[a.key] - vals[b.key])
            .map((m) => m.key);
    };

    const [items, setItems] = useState<PriorityKeys[]>(() => getOrderFromValues(values));

    // Sync if values change externally (e.g. initial load)
    useEffect(() => {
        // Only update if the order implies a difference (this prevents loops if not careful, but basic object comparison is tricky here)
        // A simple way is to check if the current derived order matches 'items'
        // But since 'items' drives the UI, we should update it when 'values' (source of truth) changes significantly.
        // For now, we'll rely on the parent only updating 'values' when we trigger onChange.
        // However, on first load 'values' comes in asynchronously.
        setItems(getOrderFromValues(values));
    }, [values]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = items.indexOf(active.id as PriorityKeys);
        const newIndex = items.indexOf(over.id as PriorityKeys);
        const newItems = arrayMove(items, oldIndex, newIndex);

        setItems(newItems);

        // Convert order to priority values (index + 1)
        const newValues = {} as PriorityValues;
        newItems.forEach((key, index) => {
            newValues[key] = index + 1;
        });

        onChange(newValues);
    }

    return (
        <div className="space-y-2">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={items} strategy={verticalListSortingStrategy}>
                    {items.map((key, index) => {
                        const metric = PRIORITY_METRICS.find((m) => m.key === key)!;
                        return <SortableItem key={key} metric={metric} rank={index + 1} />;
                    })}
                </SortableContext>
            </DndContext>
        </div>
    );
}
