'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { BaseballDiamond, POSITION_COORDS } from './BaseballDiamond';
import { PositionPlayerStack } from './PositionPlayerPill';
import { PlayerQuickView } from './PlayerQuickView';
import { EmptyState } from '@/components/ui/empty-state';
import { RuledStatLine, InkBadge, PaperCard } from '@/components/baseball/living-annual';
import { Button, Select } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { IconTarget, IconFilter } from '@/components/icons';
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

/** Fairway `<Select>` needs a real option value — map the "no filter" empty
 * string to this sentinel at the select boundary only; every other piece of
 * filtering logic (gradYearFilter / onGradYearChange) keeps comparing against
 * `''` exactly as before. */
const ALL_GRAD_YEARS = '__all__';

const GRAD_YEAR_OPTIONS = [
  { value: ALL_GRAD_YEARS, label: 'All Years' },
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

// Pipeline legend — War Room lane, clay ink only (spec §4.2 rule 1: never mix
// inks within a lane's chrome). Ramps from a faint clay tint to full
// `--pursuit-ink` as a recruit moves toward a commitment — the same "darkens
// toward the deadline" language as `<AgingBar>`, not raw amber/green swatches.
const LEGEND_ITEMS = [
  { label: 'Watching', dot: 'bg-pursuit/[0.3]' },
  { label: 'Priority', dot: 'bg-pursuit/[0.55]' },
  { label: 'Offer', dot: 'bg-pursuit/[0.8]' },
  { label: 'Committed', dot: 'bg-pursuit' },
] as const;

export function PositionPlanner({
  watchlist,
  gradYearFilter = '',
  onGradYearChange,
}: PositionPlannerProps) {
  const prefersReducedMotion = useReducedMotion();
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
  // Active filter count for the Filters toggle badge — same semantics as
  // before: the grad-year filter counts if set, the stage filter counts if
  // it isn't 'all'.
  const activeFilterCount = (gradYearFilter ? 1 : 0) + (stageFilter !== 'all' ? 1 : 0);

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
        transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.4 })}
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
      {/* Header stats & filters — War Room (clay) lane */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.4 })}
        className="mb-8"
      >
        <PaperCard className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Stat pills — the numeral carries the contrast, clay rule beneath */}
            <div className="flex flex-wrap items-center gap-8">
              <RuledStatLine label="Players" value={totalPlayers} ink="pursuit" size="row" />
              <RuledStatLine
                label="Positions"
                value={`${positionsWithPlayers}/${totalPositions}`}
                ink="pursuit"
                size="row"
              />
            </div>

            {/* Filter Toggle Button */}
            <Button
              variant={showFilters ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              aria-expanded={showFilters}
              leftIcon={<IconFilter size={14} />}
            >
              <span className="inline-flex items-center gap-1.5">
                Filters
                {activeFilterCount > 0 ? <InkBadge label={String(activeFilterCount)} tone="pursuit" /> : null}
              </span>
            </Button>
          </div>
        </PaperCard>

        {/* Filters Panel with smooth animation */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0, y: -10 }}
              animate={{ height: 'auto', opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: -10 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.3, ease: [0.16, 1, 0.3, 1] })}
              className="overflow-hidden"
            >
              <PaperCard className="mt-3 p-5">
                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-3">
                    <span className="text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
                      Class
                    </span>
                    <div className="w-32">
                      <Select
                        size="sm"
                        aria-label="Filter by grad year"
                        value={gradYearFilter || ALL_GRAD_YEARS}
                        onValueChange={(v) => onGradYearChange?.(!v || v === ALL_GRAD_YEARS ? '' : v)}
                        options={GRAD_YEAR_OPTIONS}
                      />
                    </div>
                  </div>
                  <div className="h-8 w-px bg-[color:var(--hairline)]" />
                  <div className="flex items-center gap-3">
                    <span className="text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
                      Stage
                    </span>
                    <div className="w-40">
                      <Select
                        size="sm"
                        aria-label="Filter by pipeline stage"
                        value={stageFilter}
                        onValueChange={(v) => v && setStageFilter(v)}
                        options={STAGE_FILTER_OPTIONS}
                      />
                    </div>
                  </div>
                  {(gradYearFilter || stageFilter !== 'all') && (
                    <>
                      <div className="h-8 w-px bg-[color:var(--hairline)]" />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          onGradYearChange?.('');
                          setStageFilter('all');
                        }}
                      >
                        Clear all
                      </Button>
                    </>
                  )}
                </div>
              </PaperCard>
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

      {/* Pipeline legend — clay ink ramp, War Room lane */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.3, duration: 0.4 })}
        className="mx-auto mt-8 flex w-fit items-center justify-center gap-6 px-6 py-3"
      >
        {LEGEND_ITEMS.map((item, idx) => (
          <LegendItem key={item.label} dot={item.dot} label={item.label} index={idx} />
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
        'text-micro font-bold uppercase tracking-wider',
        'transition-all duration-300',
        // Static dashed hairline — an unfilled position reads like a ghosted
        // measurable (spec §7 `ghost` doctrine), never a decorative infinite
        // pulse. Nothing here animates on a loop, so there's nothing for
        // prefers-reduced-motion to suppress.
        'border-2 border-dashed',
        'pointer-events-auto',
        isActive
          ? [
              'bg-[var(--paper)]',
              'text-warm-700',
              'border-warm-400',
              'shadow-md'
            ]
          : [
              'bg-[var(--paper-canvas)]',
              'text-warm-400',
              'border-warm-200/60',
              'hover:bg-cream-100/68',
              'hover:border-warm-300',
              'hover:text-warm-500'
            ]
      )}
      title={`${label} (No players)`}
    >
      <span className="relative z-10">{position}</span>
    </motion.button>
  );
}

// Pipeline legend item — a clay-ink dot (intensity ramps with recruiting
// stage) + a quiet graphite/60 label. The dot carries the ink; the label
// stays quiet, matching `<RuledStatLine>`'s label convention.
function LegendItem({
  dot,
  label,
  index,
}: {
  dot: string;
  label: string;
  index: number;
}) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.4 + index * 0.08 })}
      className="flex items-center gap-2"
    >
      <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', dot)} />
      <span className="text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
        {label}
      </span>
    </motion.div>
  );
}
