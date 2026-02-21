'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Avatar } from '@/components/ui/avatar';
import { cn, getFullName } from '@/lib/utils';
import type { Player, PipelineStage } from '@/lib/types';

// Stage color configuration type
interface StageColorConfig {
  bg: string;
  border: string;
  text: string;
  dot: string;
  glow: string;
  gradient: string;
}

// Premium pipeline stage colors with glassmorphism
// Note: Only 5 valid PipelineStage values: watchlist, high_priority, offer_extended, committed, uninterested
const STAGE_COLORS: Record<PipelineStage, StageColorConfig> = {
  watchlist: {
    bg: 'bg-warm-50/90',
    border: 'border-warm-200/60',
    text: 'text-warm-700',
    dot: 'bg-warm-400',
    glow: 'shadow-[0_0_20px_rgba(168,162,158,0.3)]',
    gradient: 'from-warm-100/50 to-warm-50/30',
  },
  high_priority: {
    bg: 'bg-amber-50/90',
    border: 'border-amber-300/60',
    text: 'text-amber-800',
    dot: 'bg-amber-500',
    glow: 'shadow-[0_0_20px_rgba(245,158,11,0.35)]',
    gradient: 'from-amber-100/50 to-amber-50/30',
  },
  offer_extended: {
    bg: 'bg-primary-50/90',
    border: 'border-primary-300/60',
    text: 'text-primary-800',
    dot: 'bg-primary-500',
    glow: 'shadow-[0_0_20px_rgba(22,163,74,0.4)]',
    gradient: 'from-primary-100/50 to-primary-50/30',
  },
  committed: {
    bg: 'bg-emerald-50/90',
    border: 'border-emerald-300/60',
    text: 'text-emerald-800',
    dot: 'bg-emerald-500',
    glow: 'shadow-[0_0_24px_rgba(16,185,129,0.45)]',
    gradient: 'from-emerald-100/50 to-emerald-50/30',
  },
  uninterested: {
    bg: 'bg-slate-50/80',
    border: 'border-slate-200/50',
    text: 'text-slate-500',
    dot: 'bg-slate-400',
    glow: 'shadow-none',
    gradient: 'from-slate-100/50 to-slate-50/30',
  },
};

const STAGE_LABELS: Record<PipelineStage, string> = {
  watchlist: 'Watching',
  high_priority: 'Priority',
  offer_extended: 'Offer',
  committed: 'Committed',
  uninterested: 'Passed',
};

interface PositionPlayerPillProps {
  player: Player;
  stage: PipelineStage;
  onClick?: () => void;
  isSelected?: boolean;
  index?: number;
  compact?: boolean;
}

// Default colors for fallback (declared after STAGE_COLORS to ensure it's available)
const DEFAULT_COLORS: StageColorConfig = {
  bg: 'bg-warm-50/90',
  border: 'border-warm-200/60',
  text: 'text-warm-700',
  dot: 'bg-warm-400',
  glow: 'shadow-[0_0_20px_rgba(168,162,158,0.3)]',
  gradient: 'from-warm-100/50 to-warm-50/30',
};

export function PositionPlayerPill({
  player,
  stage,
  onClick,
  isSelected,
  index = 0,
  compact = false,
}: PositionPlayerPillProps) {
  const colors: StageColorConfig = STAGE_COLORS[stage] ?? DEFAULT_COLORS;
  const fullName = getFullName(player.first_name, player.last_name);

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.8, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: -8 }}
      transition={{
        delay: index * 0.06,
        duration: 0.35,
        ease: [0.16, 1, 0.3, 1]
      }}
      whileHover={{
        scale: 1.05,
        y: -2,
        transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] }
      }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        // Base styles
        'relative flex items-center gap-2 px-2.5 py-1.5 rounded-full',
        'border backdrop-blur-md',
        'transition-all duration-300 cursor-pointer',
        'pointer-events-auto',

        // Glass effect
        'bg-gradient-to-br',
        colors.gradient,
        colors.bg,
        colors.border,

        // Shadow and glow
        'shadow-glass-sm',

        // Hover glow effect
        'hover:shadow-lg',
        stage !== 'uninterested' && 'hover:' + colors.glow,

        // Selection state
        isSelected && [
          'ring-2 ring-primary-500/50 ring-offset-2 ring-offset-white/50',
          colors.glow
        ],

        // Inner highlight
        'before:absolute before:inset-0 before:rounded-full',
        'before:bg-gradient-to-b before:from-white/40 before:to-transparent',
        'before:opacity-60 before:pointer-events-none'
      )}
      style={{
        // Subtle inner shadow for depth
        boxShadow: isSelected
          ? undefined
          : 'inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 8px rgba(0,0,0,0.08)'
      }}
    >
      {/* Avatar with ring effect */}
      <div className="relative">
        <Avatar
          src={player.avatar_url}
          name={fullName}
          size="xs"
          className="ring-1 ring-white/50"
        />
        {/* Stage indicator badge on avatar */}
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: index * 0.06 + 0.2, type: 'spring', stiffness: 500, damping: 25 }}
          className={cn(
            'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full',
            'ring-2 ring-white/80',
            colors.dot
          )}
          title={STAGE_LABELS[stage]}
        />
      </div>

      {/* Name with elegant typography */}
      {!compact && (
        <motion.span
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.06 + 0.1, duration: 0.25 }}
          className={cn(
            'text-xs font-semibold truncate max-w-[100px]',
            'tracking-tight',
            colors.text
          )}
        >
          {player.last_name || player.first_name}
        </motion.span>
      )}
    </motion.button>
  );
}

// Premium stacked pills for multiple players at one position
interface PositionPlayerStackProps {
  players: Array<{ player: Player; stage: PipelineStage; watchlistId: string }>;
  position: string;
  onPlayerClick?: (player: Player) => void;
  onExpandClick?: () => void;
  maxVisible?: number;
  expanded?: boolean;
}

export function PositionPlayerStack({
  players,
  position,
  onPlayerClick,
  onExpandClick,
  maxVisible = 2,
  expanded = false,
}: PositionPlayerStackProps) {
  // Sort by stage priority then alphabetically
  const stagePriority: Record<PipelineStage, number> = {
    committed: 0,
    offer_extended: 1,
    high_priority: 2,
    watchlist: 3,
    uninterested: 4,
  };

  const sortedPlayers = [...players].sort((a, b) => {
    const priorityA = stagePriority[a.stage] ?? 99;
    const priorityB = stagePriority[b.stage] ?? 99;
    const priorityDiff = priorityA - priorityB;
    if (priorityDiff !== 0) return priorityDiff;
    const nameA = a.player.last_name || a.player.first_name || '';
    const nameB = b.player.last_name || b.player.first_name || '';
    return nameA.localeCompare(nameB);
  });

  const visiblePlayers = expanded ? sortedPlayers : sortedPlayers.slice(0, maxVisible);
  const hiddenCount = players.length - maxVisible;

  if (players.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      layout
      className={cn(
        'flex flex-col items-center',
        'pointer-events-auto',
        expanded && [
          'gap-2 p-3',
          'bg-white/95 backdrop-blur-xl',
          'rounded-2xl',
          'shadow-glass-lg',
          'border border-white/60',
          // Ambient glow when expanded
          'before:absolute before:inset-0 before:-z-10',
          'before:rounded-2xl before:blur-xl',
          'before:bg-primary-500/5'
        ],
        !expanded && 'gap-1'
      )}
    >
      {/* Position label when expanded */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.9 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'flex items-center gap-2 mb-1 px-2',
              'text-micro font-bold uppercase tracking-widest',
              'text-warm-500'
            )}
          >
            <div className="w-3 h-px bg-warm-300" />
            {position}
            <div className="w-3 h-px bg-warm-300" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Player pills */}
      <AnimatePresence mode="popLayout">
        {visiblePlayers.map((item, idx) => (
          <PositionPlayerPill
            key={item.watchlistId}
            player={item.player}
            stage={item.stage}
            onClick={() => onPlayerClick?.(item.player)}
            index={idx}
            compact={!expanded && players.length > 1}
          />
        ))}
      </AnimatePresence>

      {/* Premium "more" indicator */}
      {!expanded && hiddenCount > 0 && (
        <motion.button
          onClick={onExpandClick}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.1, y: -1 }}
          whileTap={{ scale: 0.95 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'relative flex items-center justify-center',
            'w-7 h-7 rounded-full',
            'bg-gradient-to-br from-warm-100/90 to-warm-50/70',
            'border border-warm-200/60',
            'backdrop-blur-sm',
            'text-micro font-bold text-warm-600',
            'transition-all duration-200',
            'hover:bg-warm-100 active:bg-warm-200 hover:border-warm-300/80',
            'hover:shadow-md',
            'pointer-events-auto',
            // Inner highlight
            'before:absolute before:inset-0 before:rounded-full',
            'before:bg-gradient-to-b before:from-white/50 before:to-transparent',
            'before:pointer-events-none'
          )}
          style={{
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 6px rgba(0,0,0,0.08)'
          }}
        >
          <span className="relative z-10">+{hiddenCount}</span>
        </motion.button>
      )}

      {/* Collapse button when expanded */}
      <AnimatePresence>
        {expanded && players.length > maxVisible && (
          <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            onClick={onExpandClick}
            className={cn(
              'mt-2 px-3 py-1 rounded-full',
              'text-micro font-medium text-warm-500',
              'bg-warm-100/50 hover:bg-warm-100 active:bg-warm-200',
              'border border-warm-200/50',
              'transition-all duration-200',
              'hover:text-warm-700',
              'pointer-events-auto'
            )}
          >
            Show less
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Premium position count badge (for compact view)
interface PositionCountBadgeProps {
  count: number;
  position: string;
  onClick?: () => void;
  isActive?: boolean;
  dominantStage?: PipelineStage;
}

export function PositionCountBadge({
  count,
  position,
  onClick,
  isActive,
  dominantStage = 'watchlist',
}: PositionCountBadgeProps) {
  const colors: StageColorConfig = STAGE_COLORS[dominantStage] ?? DEFAULT_COLORS;

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.08, y: -2 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        'relative flex items-center justify-center',
        'w-10 h-10 rounded-xl',
        'bg-gradient-to-br',
        colors.gradient,
        colors.bg,
        'border',
        colors.border,
        'backdrop-blur-md',
        'transition-all duration-300',
        'cursor-pointer',
        'pointer-events-auto',

        // Hover and active states
        'hover:shadow-lg',
        isActive && [
          'ring-2 ring-primary-500/40 ring-offset-2 ring-offset-white/50',
          colors.glow
        ],

        // Inner highlight
        'before:absolute before:inset-0 before:rounded-xl',
        'before:bg-gradient-to-b before:from-white/40 before:to-transparent',
        'before:pointer-events-none'
      )}
      style={{
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 8px rgba(0,0,0,0.08)'
      }}
    >
      <div className="relative z-10 text-center">
        <span className={cn('text-sm font-bold', colors.text)}>
          {count}
        </span>
        <span className={cn('block text-[8px] font-semibold uppercase tracking-wider', colors.text, 'opacity-60')}>
          {position}
        </span>
      </div>
    </motion.button>
  );
}
