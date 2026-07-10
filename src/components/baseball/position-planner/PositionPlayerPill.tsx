'use client';

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Avatar } from '@/components/ui/avatar';
import { cn, getFullName } from '@/lib/utils';
import type { Player, PipelineStage } from '@/lib/types';

// Stage color configuration type
interface StageColorConfig {
  bg: string;
  border: string;
  text: string;
  dot: string;
}

// Pipeline stage colors — clay-ink opacity ramp, War Room lane (spec §4.2
// rule 1: never mix inks within a lane's chrome). Matches PositionPlanner's
// LEGEND_ITEMS ramp exactly (bg-pursuit/[0.3] → /[0.55] → /[0.8] → solid
// bg-pursuit) so the legend key stays true; `uninterested` extends the same
// ramp one rung below `watchlist` since a passed recruit carries less signal
// than one still being watched. One ink family at increasing intensity toward
// a commitment — never a second "success green" (primary-*) or a raw
// amber/warm swatch.
// Note: Only 5 valid PipelineStage values: watchlist, high_priority, offer_extended, committed, uninterested
const STAGE_COLORS: Record<PipelineStage, StageColorConfig> = {
  uninterested: {
    bg: 'bg-pursuit/[0.04]',
    border: 'border-pursuit/[0.1]',
    text: 'text-pursuit/[0.55]',
    dot: 'bg-pursuit/[0.15]',
  },
  watchlist: {
    bg: 'bg-pursuit/[0.08]',
    border: 'border-pursuit/[0.18]',
    text: 'text-pursuit/[0.75]',
    dot: 'bg-pursuit/[0.3]',
  },
  high_priority: {
    bg: 'bg-pursuit/[0.14]',
    border: 'border-pursuit/[0.28]',
    text: 'text-pursuit',
    dot: 'bg-pursuit/[0.55]',
  },
  offer_extended: {
    bg: 'bg-pursuit/[0.2]',
    border: 'border-pursuit/[0.38]',
    text: 'text-pursuit',
    dot: 'bg-pursuit/[0.8]',
  },
  committed: {
    // Deepest tone in the funnel (watchlist → high_priority → offer_extended
    // → committed) — full-strength clay ink, never oxblood (--pursuit-deep
    // is reserved for seals/stamps only, spec §4.2) and never a second
    // "success green" (primary-*).
    bg: 'bg-pursuit/[0.28]',
    border: 'border-pursuit/[0.5]',
    text: 'text-pursuit',
    dot: 'bg-pursuit',
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
// Mirrors `watchlist` — the same clay-ink ramp, never a raw warm swatch.
const DEFAULT_COLORS: StageColorConfig = {
  bg: 'bg-pursuit/[0.08]',
  border: 'border-pursuit/[0.18]',
  text: 'text-pursuit/[0.75]',
  dot: 'bg-pursuit/[0.3]',
};

export function PositionPlayerPill({
  player,
  stage,
  onClick,
  isSelected,
  index = 0,
  compact = false,
}: PositionPlayerPillProps) {
  const prefersReducedMotion = useReducedMotion();
  const colors: StageColorConfig = STAGE_COLORS[stage] ?? DEFAULT_COLORS;
  const fullName = getFullName(player.first_name, player.last_name);

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.8, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: -8 }}
      transition={prefersReducedMotion ? { duration: 0 } : ({
        delay: Math.min(index, 4) * 0.06,
        duration: 0.35,
        ease: [0.16, 1, 0.3, 1]
      })}
      whileHover={{
        scale: 1.05,
        y: -2,
        transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] }
      }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        // Base styles
        'relative flex items-center gap-2 px-2.5 py-1.5 rounded-full',
        'border',
        'transition-all duration-300 cursor-pointer',
        'pointer-events-auto',

        // Flat paper fill — clay-ink tint + letterpress depth (spec §4.3),
        // the same treatment PositionPlanner uses for its expanded stack
        // container. Never a gradient, never a glass highlight.
        colors.bg,
        colors.border,
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-1px_0_rgba(0,0,0,0.06)]',

        // Hover — border deepens to full clay ink, no colored glow
        'hover:border-pursuit',

        // Selection state — clay-ink ring, never a raw primary swatch
        isSelected && 'ring-2 ring-pursuit ring-offset-2 ring-offset-[var(--paper)]'
      )}
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
          transition={prefersReducedMotion ? { duration: 0 } : ({ delay: Math.min(index, 4) * 0.06 + 0.2, type: 'spring', stiffness: 500, damping: 25 })}
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
          transition={prefersReducedMotion ? { duration: 0 } : ({ delay: Math.min(index, 4) * 0.06 + 0.1, duration: 0.25 })}
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
  const prefersReducedMotion = useReducedMotion();
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
          'bg-[var(--paper)]',
          'rounded-2xl',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-1px_0_rgba(0,0,0,0.06)]',
          'border border-[color:var(--hairline)]',
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
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.2, ease: [0.16, 1, 0.3, 1] })}
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
          transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.2, ease: [0.16, 1, 0.3, 1] })}
          className={cn(
            'relative flex items-center justify-center',
            'w-7 h-7 rounded-full',
            'bg-gradient-to-br from-warm-100/90 to-warm-50/70',
            'border border-warm-200/60',
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

