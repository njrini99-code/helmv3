'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { HoleReviewData } from '@/app/golf/actions/golf';
import { HoleAccordion } from './HoleAccordion';
import { IconChevronDown, IconChevronUp, IconLayoutGrid, IconList } from '@/components/icons';

interface ShotTimelineProps {
  holes: HoleReviewData[];
  className?: string;
}

type ViewMode = 'list' | 'overview';
type NineFilter = 'all' | 'front' | 'back';

export function ShotTimeline({ holes, className }: ShotTimelineProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [nineFilter, setNineFilter] = useState<NineFilter>('all');
  const [expandAll, setExpandAll] = useState(false);

  // Filter holes based on front/back nine selection
  const filteredHoles = holes.filter((hole) => {
    if (nineFilter === 'front') return hole.hole_number <= 9;
    if (nineFilter === 'back') return hole.hole_number > 9;
    return true;
  });

  // Count holes with shot data
  const holesWithShots = holes.filter((h) => h.shots.length > 0).length;
  const totalShots = holes.reduce((sum, h) => sum + h.shots.length, 0);

  // Calculate stats
  const frontNine = holes.filter((h) => h.hole_number <= 9);
  const backNine = holes.filter((h) => h.hole_number > 9);
  const frontScore = frontNine.reduce((sum, h) => sum + (h.score || 0), 0);
  const backScore = backNine.reduce((sum, h) => sum + (h.score || 0), 0);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Stats summary */}
        <div className="flex items-center gap-4 text-sm text-warm-600">
          <span>
            <span className="font-medium text-warm-900">{totalShots}</span> shots tracked
          </span>
          <span className="text-warm-300">|</span>
          <span>
            <span className="font-medium text-warm-900">{holesWithShots}</span> of {holes.length} holes
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Nine filter */}
          <div className="flex bg-warm-100 rounded-lg p-0.5">
            <button
              onClick={() => setNineFilter('all')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                nineFilter === 'all'
                  ? 'bg-white text-warm-900 shadow-sm'
                  : 'text-warm-600 hover:text-warm-900'
              )}
            >
              All 18
            </button>
            <button
              onClick={() => setNineFilter('front')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                nineFilter === 'front'
                  ? 'bg-white text-warm-900 shadow-sm'
                  : 'text-warm-600 hover:text-warm-900'
              )}
            >
              Front ({frontScore || '--'})
            </button>
            <button
              onClick={() => setNineFilter('back')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                nineFilter === 'back'
                  ? 'bg-white text-warm-900 shadow-sm'
                  : 'text-warm-600 hover:text-warm-900'
              )}
            >
              Back ({backScore || '--'})
            </button>
          </div>

          {/* View mode toggle */}
          <div className="flex bg-warm-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                viewMode === 'list'
                  ? 'bg-white text-warm-900 shadow-sm'
                  : 'text-warm-500 hover:text-warm-900'
              )}
              title="List view"
            >
              <IconList size={16} />
            </button>
            <button
              onClick={() => setViewMode('overview')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                viewMode === 'overview'
                  ? 'bg-white text-warm-900 shadow-sm'
                  : 'text-warm-500 hover:text-warm-900'
              )}
              title="Overview"
            >
              <IconLayoutGrid size={16} />
            </button>
          </div>

          {/* Expand/collapse all */}
          {viewMode === 'list' && (
            <button
              onClick={() => setExpandAll(!expandAll)}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                'bg-warm-100 text-warm-600 hover:bg-warm-200 hover:text-warm-900'
              )}
            >
              {expandAll ? (
                <>
                  <IconChevronUp size={14} />
                  Collapse
                </>
              ) : (
                <>
                  <IconChevronDown size={14} />
                  Expand
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {viewMode === 'list' ? (
        <div className="space-y-3">
          {filteredHoles.map((hole, index) => (
            <motion.div
              key={hole.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
            >
              <HoleAccordion
                hole={hole}
                defaultExpanded={expandAll}
              />
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {filteredHoles.map((hole) => (
            <HoleOverviewCard key={hole.id} hole={hole} />
          ))}
        </div>
      )}
    </div>
  );
}

// Compact overview card for grid view
function HoleOverviewCard({ hole }: { hole: HoleReviewData }) {
  const score = hole.score;
  const par = hole.par;
  const diff = score !== null ? score - par : null;

  let scoreColor = 'text-warm-900';
  let bgColor = 'bg-warm-50';

  if (diff !== null) {
    if (diff <= -2) {
      scoreColor = 'text-amber-600';
      bgColor = 'bg-amber-50';
    } else if (diff === -1) {
      scoreColor = 'text-primary-600';
      bgColor = 'bg-primary-50';
    } else if (diff === 0) {
      scoreColor = 'text-warm-700';
      bgColor = 'bg-warm-50';
    } else if (diff >= 1) {
      scoreColor = 'text-red-600';
      bgColor = 'bg-red-50';
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'rounded-xl border border-warm-200 p-4 text-center',
        bgColor
      )}
    >
      <div className="text-xs text-warm-500 mb-1">Hole {hole.hole_number}</div>
      <div className={cn('text-2xl font-bold mb-1', scoreColor)}>
        {score ?? '--'}
      </div>
      <div className="text-xs text-warm-400">Par {par}</div>
      <div className="mt-2 pt-2 border-t border-warm-200 text-xs text-warm-500">
        {hole.shots.length} shots
      </div>
    </motion.div>
  );
}
