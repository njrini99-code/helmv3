'use client';

import { haptic } from '@/lib/haptics';
import { useState } from 'react';
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
                'flex items-center gap-4 p-4 rounded-xl border bg-surface transition duration-150',
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
                    rank === 2 && 'bg-accent-50 text-accent-ink',
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
                    className="h-full bg-accent-500 rounded-full transition-[width] duration-300"
                    style={{ width: `${(6 - rank) * 20}%` }}
                />
            </div>
        </div>
    );
}

// Sort metrics by their priority values (1 = highest) to get the display order.
function getOrderFromValues(vals: PriorityValues): PriorityKeys[] {
    return [...PRIORITY_METRICS]
        .sort((a, b) => vals[a.key] - vals[b.key])
        .map((m) => m.key);
}

export function PriorityRanker({ values, onChange }: PriorityRankerProps) {
    // DATA-10 — resync from a PRIMITIVE key, not the `values` object. Callers
    // pass `values` as an inline literal, so its identity changes on every
    // parent render; syncing on identity snapped the list back to the saved
    // order the moment a drag's save flipped the parent's `saving` flag. The
    // key only changes when the saved order itself changes (initial load, a
    // successful save, or a remote update). A caller that needs to discard a
    // local order after a failed save remounts the ranker via `key`.
    const orderKey = getOrderFromValues(values).join(',');
    const [items, setItems] = useState<PriorityKeys[]>(() => getOrderFromValues(values));
    const [syncedOrderKey, setSyncedOrderKey] = useState(orderKey);
    if (orderKey !== syncedOrderKey) {
        setSyncedOrderKey(orderKey);
        setItems(orderKey.split(',') as PriorityKeys[]);
    }

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
        void haptic('checkpoint');

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
