'use client';

import { motion, useReducedMotion } from 'framer-motion';
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
  const prefersReducedMotion = useReducedMotion();
  // Grid layout mimics a green from player's perspective
  // Player is at bottom, green is the center
  const gridLayout: (ApproachMissDirection | 'green' | null)[][] = [
    ['long_left',   'long',   'long_right'],
    ['left',        'green',  'right'],
    ['short_left',  'short',  'short_right'],
  ];

  return (
    <div className="space-y-3">
      <p className="font-fw-sans text-caption font-medium text-text-tertiary">Where did it miss?</p>

      <div className="relative max-w-[280px] mx-auto">
        {/* Grid container */}
        <div className="grid grid-cols-3 gap-2">
          {gridLayout.flat().map((cell, index) => {
            if (cell === 'green') {
              // Center cell represents the green (target)
              return (
                <div
                  key={index}
                  className="flex items-center justify-center rounded-fw-md bg-accent-50 border-2 border-accent-200 aspect-square"
                >
                  <div className="text-center">
                    <div className="w-4 h-4 mx-auto rounded-full bg-accent-500/60 mb-1" />
                    <span className="font-fw-sans text-eyebrow font-semibold text-accent-700">GREEN</span>
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
                aria-label={config.label}
                aria-pressed={isSelected}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  'relative flex flex-col items-center justify-center rounded-fw-md border transition-all duration-200 aspect-square',
                  'font-fw-sans font-medium',
                  'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                  isSelected
                    ? 'bg-accent-700 border-accent-700 text-text-on-accent shadow-flat'
                    : 'bg-surface-sunken border-border-subtle hover:border-accent-300 hover:bg-surface-tint active:bg-surface-tint',
                  disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <span className={cn(
                  'text-lg leading-none',
                  isSelected ? 'text-text-on-accent' : 'text-text-secondary'
                )}>
                  {config.icon}
                </span>
                <span className={cn(
                  'text-micro font-medium leading-none mt-1.5',
                  isSelected ? 'text-text-on-accent' : config.color
                )}>
                  {config.shortLabel}
                </span>

                {/* Selection indicator */}
                {isSelected && (
                  <motion.div
                    layoutId="miss-selection"
                    className="absolute inset-0 rounded-fw-md border-2 border-text-on-accent/20"
                    initial={false}
                    transition={prefersReducedMotion ? { duration: 0 } : ({ type: 'spring', stiffness: 500, damping: 30 })}
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
              className="font-fw-sans text-caption font-medium text-text-secondary"
            >
              Missed <span className={APPROACH_MISS_CONFIG[selectedDirection].color}>
                {APPROACH_MISS_CONFIG[selectedDirection].label}
              </span>
            </motion.p>
          ) : (
            <div className="flex items-center justify-center gap-1 text-text-tertiary">
              <span className="text-xs">You</span>
              <span className="text-sm">⛳</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
