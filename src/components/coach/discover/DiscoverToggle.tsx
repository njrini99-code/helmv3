'use client';

import { memo, useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconUsers, IconBuilding } from '@/components/icons';

export type DiscoverMode = 'players' | 'teams';

interface DiscoverToggleProps {
  mode: DiscoverMode;
  onChange: (mode: DiscoverMode) => void;
  playerCount?: number;
  teamCount?: number;
  className?: string;
}

export const DiscoverToggle = memo(function DiscoverToggle({
  mode,
  onChange,
  playerCount,
  teamCount,
  className,
}: DiscoverToggleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  // Calculate indicator position based on active button
  useEffect(() => {
    if (!containerRef.current) return;

    const activeButton = containerRef.current.querySelector(
      `[data-mode="${mode}"]`
    ) as HTMLButtonElement;

    if (activeButton) {
      setIndicatorStyle({
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
      });
    }
  }, [mode]);

  const options = [
    {
      value: 'players' as const,
      label: 'Players',
      icon: IconUsers,
      count: playerCount,
      description: 'Find individual prospects',
    },
    {
      value: 'teams' as const,
      label: 'Teams',
      icon: IconBuilding,
      count: teamCount,
      description: 'Discover programs with talent',
    },
  ];

  return (
    <div className={cn('relative', className)}>
      {/* Toggle Container */}
      <div
        ref={containerRef}
        className="relative inline-flex items-center p-1 rounded-xl bg-warm-100/80 backdrop-blur-sm border border-warm-200/50"
        role="tablist"
        aria-label="Discovery mode"
      >
        {/* Animated Background Indicator */}
        <motion.div
          className="absolute top-1 bottom-1 rounded-lg bg-white shadow-sm border border-warm-200/80"
          initial={false}
          animate={{
            left: indicatorStyle.left,
            width: indicatorStyle.width,
          }}
          transition={{
            type: 'spring',
            stiffness: 500,
            damping: 35,
          }}
          style={{
            boxShadow: `
              0 1px 3px rgba(0,0,0,0.08),
              0 4px 6px -1px rgba(0,0,0,0.05),
              inset 0 1px 0 rgba(255,255,255,0.9)
            `,
          }}
        />

        {/* Toggle Buttons */}
        {options.map((option) => {
          const Icon = option.icon;
          const isActive = mode === option.value;

          return (
            <button
              key={option.value}
              data-mode={option.value}
              onClick={() => onChange(option.value)}
              role="tab"
              aria-selected={isActive}
              aria-controls={`${option.value}-panel`}
              className={cn(
                'relative z-10 flex items-center gap-2 px-4 py-2 rounded-lg',
                'text-sm font-medium transition-colors duration-200',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
                isActive
                  ? 'text-warm-900'
                  : 'text-warm-500 hover:text-warm-700'
              )}
            >
              <Icon
                size={18}
                className={cn(
                  'transition-colors duration-200',
                  isActive ? 'text-primary-600' : 'text-warm-400'
                )}
              />
              <span>{option.label}</span>

              {/* Count Badge */}
              <AnimatePresence mode="wait">
                {option.count !== undefined && (
                  <motion.span
                    key={`${option.value}-${option.count}`}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      'ml-1 px-2 py-0.5 text-xs font-semibold rounded-full',
                      'transition-colors duration-200',
                      isActive
                        ? 'bg-primary-100 text-primary-700'
                        : 'bg-warm-200/80 text-warm-500'
                    )}
                  >
                    {option.count.toLocaleString()}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </div>

      {/* Mode Description (subtle hint) */}
      <AnimatePresence mode="wait">
        <motion.p
          key={mode}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
          className="mt-2 text-xs text-warm-400"
        >
          {options.find(o => o.value === mode)?.description}
        </motion.p>
      </AnimatePresence>
    </div>
  );
});
