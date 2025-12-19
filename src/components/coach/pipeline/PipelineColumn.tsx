'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

interface PipelineColumnProps {
  id: string;
  title: string;
  count: number;
  color: string;
  children: React.ReactNode;
}

export function PipelineColumn({ id, title, count, color, children }: PipelineColumnProps) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div className="bg-slate-50 rounded-2xl p-4 min-h-[600px] flex flex-col">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${color}`}>
          {count}
        </span>
      </div>

      {/* Droppable Area */}
      <div ref={setNodeRef} className="flex-1 space-y-3">
        {children}
      </div>
    </div>
  );
}
