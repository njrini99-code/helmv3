'use client';

import { useState, useMemo } from 'react';
import { ShineEffect } from '@/components/ui/shine-effect';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Header } from '@/components/layout/header';
import { PipelineColumn } from '@/components/features/pipeline-column';
import { PipelineCard } from '@/components/features/pipeline-card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageLoading } from '@/components/ui/loading';
import { SkeletonPipeline } from '@/components/ui/skeleton-loader';
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
  const [error, setError] = useState<string | null>(null);

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
      try {
        await updateStage(activeItem.player_id, newStage);
        setError(null); // Clear any previous errors on success
      } catch (err) {
        console.error('Error updating pipeline stage:', err);
        setError('Failed to update player stage. Please try again.');
      }
    }

    setActiveId(null);
  };

  // Route protection - show loading while checking or redirecting
  if (routeLoading || !isAllowed) {
    return <PageLoading />;
  }

  if (loading) return (
    <>
      <Header title="Pipeline" subtitle="Manage your recruiting pipeline" />
      <div className="p-6 lg:p-8">
        <SkeletonPipeline />
      </div>
    </>
  );

  return (
    <>
      <Header
        title="Pipeline"
        subtitle={watchlist.length === 0 ? 'Manage your recruiting pipeline' : `${filteredWatchlist.length} player${filteredWatchlist.length !== 1 ? 's' : ''} in pipeline`}
      />
      <div className="p-6 lg:p-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-700 font-medium transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Empty State Banner */}
        {watchlist.length === 0 && (
          <div className="relative glass-standard rounded-2xl p-8 mb-6 text-center overflow-hidden">
            <ShineEffect />
            <IconUsers size={32} className="mx-auto mb-3 text-green-600" />
            <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-2">Your pipeline is empty</h3>
            <p className="text-sm leading-relaxed text-slate-600 mb-4">
              Start by adding players to your watchlist from the Discover page.
            </p>
            <Link href="/baseball/dashboard/discover">
              <Button>Discover Players</Button>
            </Link>
          </div>
        )}

        {/* Grad Year Filter */}
        {watchlist.length > 0 && (
          <div className="relative glass-standard rounded-2xl p-4 mb-6 overflow-hidden">
            <ShineEffect />
            <div className="flex items-center gap-3">
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
