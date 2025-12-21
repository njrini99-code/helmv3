'use client';

import { useState, useMemo } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Header } from '@/components/layout/header';
import { PipelineColumn } from '@/components/features/pipeline-column';
import { PipelineCard } from '@/components/features/pipeline-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Loading, PageLoading } from '@/components/ui/loading';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { IconUsers } from '@/components/icons';
import { useWatchlist } from '@/hooks/use-watchlist';
import { useRecruitingRouteProtection } from '@/hooks/use-route-protection';
import Link from 'next/link';
import type { PipelineStage } from '@/lib/types';

const stages: PipelineStage[] = ['watchlist', 'high_priority', 'offer_extended', 'committed', 'uninterested'];

const gradYearOptions = [
  { value: '', label: 'All Years' },
  { value: '2025', label: '2025' },
  { value: '2026', label: '2026' },
  { value: '2027', label: '2027' },
  { value: '2028', label: '2028' },
  { value: '2029', label: '2029' },
];

export default function PipelinePage() {
  const { isAllowed, isLoading: routeLoading } = useRecruitingRouteProtection();
  const { watchlist, loading, updateStage } = useWatchlist();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [gradYearFilter, setGradYearFilter] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px of movement required to start dragging
      },
    })
  );

  // Filter watchlist by grad year
  const filteredWatchlist = useMemo(() => {
    if (!gradYearFilter) return watchlist;
    return watchlist.filter(item => item.player?.grad_year?.toString() === gradYearFilter);
  }, [watchlist, gradYearFilter]);

  const activeItem = filteredWatchlist.find((item) => item.id === activeId);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      return;
    }

    const activeItem = filteredWatchlist.find((item) => item.id === active.id);
    const newStage = over.id as PipelineStage;

    if (activeItem && activeItem.pipeline_stage !== newStage) {
      await updateStage(activeItem.player_id, newStage);
    }

    setActiveId(null);
  };

  // Route protection - show loading while checking or redirecting
  if (routeLoading || !isAllowed) {
    return <PageLoading />;
  }

  if (loading) return <><Header title="Pipeline" /><Loading /></>;

  return (
    <>
      <Header
        title="Pipeline"
        subtitle={watchlist.length === 0 ? 'Manage your recruiting pipeline' : `${filteredWatchlist.length} player${filteredWatchlist.length !== 1 ? 's' : ''} in pipeline`}
      />
      <div className="p-8">
        {/* Empty State Banner */}
        {watchlist.length === 0 && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <IconUsers size={32} className="mx-auto mb-3 text-green-600" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Your pipeline is empty</h3>
            <p className="text-sm text-slate-600 mb-4">
              Start by adding players to your watchlist from the Discover page.
            </p>
            <Link href="/baseball/dashboard/discover">
              <Button>Discover Players</Button>
            </Link>
          </div>
        )}

        {/* Grad Year Filter */}
        {watchlist.length > 0 && (
          <div className="mb-6 flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700">Filter by Grad Year:</label>
            <Select
              options={gradYearOptions}
              value={gradYearFilter}
              onChange={(value) => setGradYearFilter(value)}
              className="w-36"
            />
            {gradYearFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setGradYearFilter('')}
              >
                Clear Filter
              </Button>
            )}
          </div>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-5 gap-4">
            {stages.map((stage) => (
              <PipelineColumn
                key={stage}
                stage={stage}
                items={filteredWatchlist.filter((w) => w.pipeline_stage === stage)}
              />
            ))}
          </div>

          <DragOverlay>
            {activeItem ? (
              <div className="opacity-90">
                <PipelineCard item={activeItem} isDragging />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </>
  );
}
