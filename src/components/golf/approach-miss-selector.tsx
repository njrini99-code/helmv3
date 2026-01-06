'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ApproachMissDirection, APPROACH_MISS_CONFIG } from '@/lib/types/golf';

interface ApproachMissSelectorProps {
  selectedDirection: ApproachMissDirection | null;
  onDirectionChange: (direction: ApproachMissDirection) => void;
  disabled?: boolean;
}

export function ApproachMissSelector({
  selectedDirection,
  onDirectionChange,
  disabled
}: ApproachMissSelectorProps) {
  // Grid layout mimics a green from player's perspective
  // Player is at bottom, green is the center
  const gridLayout: (ApproachMissDirection | 'green' | null)[][] = [
    ['long_left',   'long',   'long_right'],
    ['left',        'green',  'right'],
    ['short_left',  'short',  'short_right'],
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 font-medium">Where did it miss?</p>
      
      <div className="relative aspect-square max-w-[280px] mx-auto">
        {/* Grid container */}
        <div className="grid grid-cols-3 gap-2 h-full">
          {gridLayout.flat().map((cell, index) => {
            if (cell === 'green') {
              // Center cell represents the green (target)
              return (
                <div
                  key={index}
                  className="flex items-center justify-center rounded-xl bg-emerald-500/20 border-2 border-emerald-500/40"
                >
                  <div className="text-center">
                    <div className="w-4 h-4 mx-auto rounded-full bg-emerald-500/60 mb-1" />
                    <span className="text-xs text-emerald-600 font-medium">GREEN</span>
                  </div>
                </div>
              );
            }

            if (cell === null) {
              return <div key={index} />;
            }

            const config = APPROACH_MISS_CONFIG[cell];
            const isSelected = selectedDirection === cell;

            return (
              <motion.button
                key={cell}
                type="button"
                onClick={() => onDirectionChange(cell)}
                disabled={disabled}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  'relative flex flex-col items-center justify-center rounded-xl border transition-all duration-200',
                  'text-sm font-medium p-2',
                  isSelected
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                    : 'bg-white/70 backdrop-blur-sm border-slate-200 hover:border-emerald-300 hover:bg-emerald-50',
                  disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <span className={cn(
                  'text-2xl mb-1',
                  isSelected ? 'text-white' : 'text-slate-600'
                )}>
                  {config.icon}
                </span>
                <span className={cn(
                  'text-xs font-semibold',
                  isSelected ? 'text-white' : config.color
                )}>
                  {config.shortLabel}
                </span>
                
                {/* Selection indicator */}
                {isSelected && (
                  <motion.div
                    layoutId="miss-selection"
                    className="absolute inset-0 rounded-xl border-2 border-white/20"
                    initial={false}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Player position indicator */}
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 text-slate-500">
          <span className="text-xs">You</span>
          <span>⛳</span>
        </div>
      </div>

      {/* Selected direction label */}
      {selectedDirection && (
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-sm text-slate-700 font-medium"
        >
          Missed <span className={APPROACH_MISS_CONFIG[selectedDirection].color}>
            {APPROACH_MISS_CONFIG[selectedDirection].label}
          </span>
        </motion.p>
      )}
    </div>
  );
}
