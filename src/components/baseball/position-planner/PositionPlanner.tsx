'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BaseballDiamond, POSITION_COORDS } from './BaseballDiamond';
import { PositionPlayerStack } from './PositionPlayerPill';
import { PlayerQuickView } from './PlayerQuickView';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { IconUsers, IconTarget, IconFilter } from '@/components/icons';
import type { WatchlistWithPlayer, Player, PipelineStage } from '@/lib/types';

interface PositionPlannerProps {
  watchlist: WatchlistWithPlayer[];
  gradYearFilter?: string;
  onGradYearChange?: (year: string) => void;
}

// Map positions to their canonical form for grouping
const POSITION_ALIASES: Record<string, string> = {
  'RHP': 'P',
  'LHP': 'P',
  'OF': 'CF', // Generic OF goes to center field area
};

const GRAD_YEAR_OPTIONS = [
  { value: '', label: 'All Years' },
  { value: '2025', label: '2025' },
  { value: '2026', label: '2026' },
  { value: '2027', label: '2027' },
  { value: '2028', label: '2028' },
  { value: '2029', label: '2029' },
];

const STAGE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Stages' },
  { value: 'watchlist', label: 'Watching' },
  { value: 'high_priority', label: 'High Priority' },
  { value: 'offer_extended', label: 'Offer Extended' },
  { value: 'committed', label: 'Committed' },
];

// Stage colors for the legend
const LEGEND_ITEMS = [
  { color: 'bg-warm-400', label: 'Watching', glow: 'shadow-warm-400/30' },
  { color: 'bg-amber-500', label: 'Priority', glow: 'shadow-amber-500/30' },
  { color: 'bg-primary-500', label: 'Offer', glow: 'shadow-primary-500/30' },
  { color: 'bg-emerald-500', label: 'Committed', glow: 'shadow-emerald-500/40' },
];

export function PositionPlanner({
  watchlist,
  gradYearFilter = '',
  onGradYearChange,
}: PositionPlannerProps) {
  const [expandedPosition, setExpandedPosition] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [stageFilter, setStageFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  // Filter watchlist
  const filteredWatchlist = useMemo(() => {
    return watchlist.filter(item => {
      if (!item.player?.primary_position) return false;
      if (gradYearFilter && item.player?.grad_year?.toString() !== gradYearFilter) return false;
      if (stageFilter !== 'all' && item.pipeline_stage !== stageFilter) return false;
      return true;
    });
  }, [watchlist, gradYearFilter, stageFilter]);

  // Group players by position
  const playersByPosition = useMemo(() => {
    const grouped: Record<string, Array<{ player: Player; stage: PipelineStage; watchlistId: string }>> = {};

    filteredWatchlist.forEach(item => {
      if (!item.player) return;

      const position = item.player.primary_position;
      if (!position) return;

      // Normalize position
      const normalizedPosition = POSITION_ALIASES[position] || position;

      if (!grouped[normalizedPosition]) {
        grouped[normalizedPosition] = [];
      }

      grouped[normalizedPosition].push({
        player: item.player,
        stage: item.pipeline_stage as PipelineStage,
        watchlistId: item.id,
      });
    });

    // Sort each group alphabetically
    Object.keys(grouped).forEach(pos => {
      const group = grouped[pos];
      if (group) {
        group.sort((a, b) => {
          const nameA = a.player.last_name || a.player.first_name || '';
          const nameB = b.player.last_name || b.player.first_name || '';
          return nameA.localeCompare(nameB);
        });
      }
    });

    return grouped;
  }, [filteredWatchlist]);

  // Stats
  const totalPlayers = filteredWatchlist.length;
  const positionsWithPlayers = Object.keys(playersByPosition).length;
  const totalPositions = Object.keys(POSITION_COORDS).length - 4; // Exclude RHP, LHP, OF, UTL

  const handlePositionClick = (position: string) => {
    setExpandedPosition(prev => prev === position ? null : position);
    setSelectedPlayer(null);
  };

  const handlePlayerClick = (player: Player) => {
    setSelectedPlayer(player);
    setExpandedPosition(null);
  };

  const handleCloseQuickView = () => {
    setSelectedPlayer(null);
  };

  if (watchlist.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <EmptyState
          icon={<IconTarget size={28} />}
          title="No players in pipeline"
          description="Add players from Discover to start building your position depth chart."
        />
      </motion.div>
    );
  }

  return (
    <div className="relative">
      {/* Premium Header Stats & Filters */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between mb-4">
          {/* Stats Pills with premium glass effect */}
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ scale: 1.02, y: -1 }}
              className={cn(
                'flex items-center gap-2.5 px-4 py-2',
                'bg-gradient-to-br from-white/90 to-warm-50/70',
                'backdrop-blur-md',
                'rounded-xl',
                'border border-white/60',
                'shadow-glass-sm',
                // Inner highlight
                'before:absolute before:inset-0 before:rounded-xl',
                'before:bg-gradient-to-b before:from-white/40 before:to-transparent',
                'before:pointer-events-none',
                'relative'
              )}
            >
              <div className="p-1.5 rounded-lg bg-primary-100/60">
                <IconUsers size={14} className="text-primary-600" />
              </div>
              <span className="text-sm font-semibold text-warm-800">
                {totalPlayers}
              </span>
              <span className="text-xs text-warm-500">
                player{totalPlayers !== 1 ? 's' : ''}
              </span>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.02, y: -1 }}
              className={cn(
                'flex items-center gap-2.5 px-4 py-2',
                'bg-gradient-to-br from-white/90 to-warm-50/70',
                'backdrop-blur-md',
                'rounded-xl',
                'border border-white/60',
                'shadow-glass-sm',
                'relative'
              )}
            >
              <div className="p-1.5 rounded-lg bg-emerald-100/60">
                <IconTarget size={14} className="text-emerald-600" />
              </div>
              <span className="text-sm font-semibold text-warm-800">
                {positionsWithPlayers}/{totalPositions}
              </span>
              <span className="text-xs text-warm-500">
                positions
              </span>
            </motion.div>
          </div>

          {/* Filter Toggle Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl',
              'text-sm font-semibold',
              'transition-all duration-300',
              'border',
              showFilters
                ? [
                    'bg-gradient-to-br from-primary-50 to-primary-100/50',
                    'text-primary-700',
                    'border-primary-200/60',
                    'shadow-md shadow-primary-500/10'
                  ]
                : [
                    'bg-gradient-to-br from-white/90 to-warm-50/70',
                    'text-warm-600',
                    'border-white/60',
                    'hover:bg-white hover:shadow-md'
                  ]
            )}
          >
            <IconFilter size={14} />
            Filters
            {(gradYearFilter || stageFilter !== 'all') && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={cn(
                  'ml-1 px-1.5 py-0.5 rounded-md',
                  'text-[10px] font-bold',
                  'bg-primary-500 text-white'
                )}
              >
                {[gradYearFilter, stageFilter !== 'all' ? 1 : 0].filter(Boolean).length}
              </motion.span>
            )}
          </motion.button>
        </div>

        {/* Filters Panel with smooth animation */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0, y: -10 }}
              animate={{ height: 'auto', opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className={cn(
                'flex items-center gap-6 p-5',
                'bg-gradient-to-br from-white/95 to-warm-50/80',
                'backdrop-blur-xl',
                'rounded-2xl',
                'border border-white/60',
                'shadow-glass'
              )}>
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-warm-600">Class:</label>
                  <Select
                    options={GRAD_YEAR_OPTIONS}
                    value={gradYearFilter}
                    onChange={(value) => onGradYearChange?.(value)}
                    className="w-32"
                  />
                </div>
                <div className="w-px h-8 bg-warm-200/50" />
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-warm-600">Stage:</label>
                  <Select
                    options={STAGE_FILTER_OPTIONS}
                    value={stageFilter}
                    onChange={setStageFilter}
                    className="w-40"
                  />
                </div>
                {(gradYearFilter || stageFilter !== 'all') && (
                  <>
                    <div className="w-px h-8 bg-warm-200/50" />
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        onGradYearChange?.('');
                        setStageFilter('all');
                      }}
                      className={cn(
                        'px-3 py-1.5 rounded-lg',
                        'text-sm font-medium',
                        'text-warm-500 hover:text-warm-700',
                        'hover:bg-warm-100/80',
                        'transition-colors duration-200'
                      )}
                    >
                      Clear all
                    </motion.button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Baseball Diamond with Players */}
      <div className="relative">
        <BaseballDiamond>
          {/* Render position stacks */}
          {Object.entries(POSITION_COORDS).map(([position, coords]) => {
            const players = playersByPosition[position] || [];

            // Skip rendering for positions that are aliased
            if (position === 'RHP' || position === 'LHP' || position === 'OF') {
              return null;
            }

            // Skip UTL unless there are players
            if (position === 'UTL' && players.length === 0) {
              return null;
            }

            return (
              <div
                key={position}
                style={{
                  position: 'absolute',
                  left: `${coords.x}%`,
                  top: `${coords.y}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: expandedPosition === position ? 30 : 10,
                }}
              >
                {players.length > 0 ? (
                  <PositionPlayerStack
                    players={players}
                    position={position}
                    onPlayerClick={handlePlayerClick}
                    onExpandClick={() => handlePositionClick(position)}
                    expanded={expandedPosition === position}
                    maxVisible={2}
                  />
                ) : (
                  <PositionEmptyMarker
                    position={position}
                    label={coords.label}
                    onClick={() => handlePositionClick(position)}
                    isActive={expandedPosition === position}
                  />
                )}
              </div>
            );
          })}
        </BaseballDiamond>

        {/* Click outside to close expanded position */}
        <AnimatePresence>
          {expandedPosition && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-5"
              onClick={() => setExpandedPosition(null)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Player Quick View Slideout */}
      <AnimatePresence>
        {selectedPlayer && (
          <PlayerQuickView
            player={selectedPlayer}
            watchlistItem={watchlist.find(w => w.player_id === selectedPlayer.id)}
            onClose={handleCloseQuickView}
          />
        )}
      </AnimatePresence>

      {/* Premium Legend */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className={cn(
          'mt-8 flex items-center justify-center gap-6 px-6 py-3',
          'bg-gradient-to-r from-transparent via-white/50 to-transparent',
          'backdrop-blur-sm',
          'rounded-full',
          'mx-auto w-fit'
        )}
      >
        {LEGEND_ITEMS.map((item, idx) => (
          <LegendItem
            key={item.label}
            color={item.color}
            label={item.label}
            glow={item.glow}
            index={idx}
          />
        ))}
      </motion.div>
    </div>
  );
}

// Premium empty position marker
function PositionEmptyMarker({
  position,
  label,
  onClick,
  isActive,
}: {
  position: string;
  label: string;
  onClick: () => void;
  isActive: boolean;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.1, y: -2 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        'relative w-12 h-12 rounded-xl',
        'flex items-center justify-center',
        'text-[10px] font-bold uppercase tracking-wider',
        'transition-all duration-300',
        'border-2 border-dashed',
        'pointer-events-auto',
        isActive
          ? [
              'bg-warm-100/90 backdrop-blur-sm',
              'text-warm-700',
              'border-warm-400',
              'shadow-md'
            ]
          : [
              'bg-white/40 backdrop-blur-sm',
              'text-warm-400',
              'border-warm-200/60',
              'hover:bg-white/60',
              'hover:border-warm-300',
              'hover:text-warm-500'
            ]
      )}
      title={`${label} (No players)`}
    >
      <span className="relative z-10">{position}</span>
      {/* Subtle pulse for empty positions */}
      <motion.span
        className={cn(
          'absolute inset-0 rounded-xl',
          'border-2 border-dashed border-warm-200/40'
        )}
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.5, 0, 0.5]
        }}
        transition={{
          duration: 2.5,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
      />
    </motion.button>
  );
}

// Premium legend item
function LegendItem({
  color,
  label,
  glow,
  index,
}: {
  color: string;
  label: string;
  glow: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 + index * 0.08 }}
      className="flex items-center gap-2"
    >
      <motion.span
        whileHover={{ scale: 1.2 }}
        className={cn(
          'w-3 h-3 rounded-full',
          'ring-2 ring-white/60',
          color,
          glow && `shadow-lg ${glow}`
        )}
      />
      <span className="text-xs font-medium text-warm-500">
        {label}
      </span>
    </motion.div>
  );
}
