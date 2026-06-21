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
import { IconTarget, IconFlag, IconCircleDot, IconMap, IconBrain } from '@/components/icons';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { PRIORITY_METRICS, PriorityMetric, CoachPhilosophy } from '@/lib/coachhelm/types';
import { IconButton } from '@/components/ui/button';

const METRIC_ICONS: Record<string, React.ReactNode> = {
    priorityBallStriking: <IconTarget size={18} />,
    priorityShortGame: <IconFlag size={18} />,
    priorityPutting: <IconCircleDot size={18} />,
    priorityCourseManagement: <IconMap size={18} />,
    priorityMentalGame: <IconBrain size={18} />,
};

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
                'flex items-center gap-4 p-4 rounded-xl border bg-surface transition-all duration-150',
                isDragging
                    ? 'shadow-raise border-accent-300 scale-[1.02] z-10 relative'
                    : 'border-border-subtle hover:border-border-strong'
            )}
        >
            {/* Drag handle */}
            <IconButton variant="default"
                {...attributes}
                {...listeners}
                className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded hover:bg-surface-sunken transition-colors cursor-grab active:cursor-grabbing touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                aria-label="Drag to reorder"
            >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-text-tertiary">
                    <path d="M4 6h8M4 10h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            </IconButton>

            {/* Rank badge */}
            <div
                className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center text-body-sm font-medium',
                    rank === 1 && 'bg-accent-100 text-accent-700',
                    rank === 2 && 'bg-accent-50 text-accent-600',
                    rank === 3 && 'bg-surface-sunken text-text-secondary',
                    rank === 4 && 'bg-surface-sunken text-text-tertiary',
                    rank === 5 && 'bg-surface-sunken text-text-tertiary'
                )}
            >
                {rank}
            </div>

            {/* Icon */}
            <span className="text-text-secondary">{METRIC_ICONS[metric.key] ?? metric.icon}</span>

            {/* Label & description */}
            <div className="flex-1 min-w-0">
                <div className="font-medium text-text-primary text-sm">{metric.label}</div>
                <div className="text-xs text-text-tertiary truncate">{metric.description}</div>
            </div>

            {/* Priority bar */}
            <div className="w-12 h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                <div
                    className="h-full bg-accent-500 rounded-full transition-all duration-300"
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
        void triggerHaptic('medium');

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
