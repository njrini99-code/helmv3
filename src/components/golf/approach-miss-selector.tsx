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
      <p className="text-sm text-warm-600 font-medium">Where did it miss?</p>
      
      <div className="relative max-w-[280px] mx-auto">
        {/* Grid container */}
        <div className="grid grid-cols-3 gap-2">
          {gridLayout.flat().map((cell, index) => {
            if (cell === 'green') {
              // Center cell represents the green (target)
              return (
                <div
                  key={index}
                  className="flex items-center justify-center rounded-xl bg-primary-500/20 border-2 border-primary-500/40 aspect-square"
                >
                  <div className="text-center">
                    <div className="w-4 h-4 mx-auto rounded-full bg-primary-500/60 mb-1" />
                    <span className="text-xs text-primary-600 font-medium">GREEN</span>
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
                  'relative flex flex-col items-center justify-center rounded-xl border transition-all duration-200 aspect-square',
                  'font-medium',
                  isSelected
                    ? 'bg-primary-600 border-primary-600 text-white shadow-sm shadow-primary-950/10'
                    : 'bg-cream-100/75 backdrop-blur-sm border-warm-200 hover:border-primary-300 hover:bg-primary-50 active:bg-primary-100',
                  disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <span className={cn(
                  'text-lg leading-none',
                  isSelected ? 'text-white' : 'text-warm-600'
                )}>
                  {config.icon}
                </span>
                <span className={cn(
                  'text-micro font-semibold leading-none mt-1.5',
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

        {/* Player position indicator + selected direction label */}
        <div className="mt-3 text-center">
          {selectedDirection ? (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-warm-700 font-medium"
            >
              Missed <span className={APPROACH_MISS_CONFIG[selectedDirection].color}>
                {APPROACH_MISS_CONFIG[selectedDirection].label}
              </span>
            </motion.p>
          ) : (
            <div className="flex items-center justify-center gap-1 text-warm-400">
              <span className="text-xs">You</span>
              <span className="text-sm">⛳</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
