'use client';

import { Fragment, useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TimeRange = '24h' | '7d' | '30d' | 'all';

export interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  showTimeRange?: boolean;
  selectedTimeRange?: TimeRange;
  onTimeRangeChange?: (range: TimeRange) => void;
  onExport?: () => void;
  width?: 'md' | 'lg' | 'xl' | 'full';
}

// ---------------------------------------------------------------------------
// Width Config
// ---------------------------------------------------------------------------

const widthClasses = {
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-[480px]',
};

// ---------------------------------------------------------------------------
// Time Range Tabs
// ---------------------------------------------------------------------------

const TIME_RANGES: { id: TimeRange; label: string }[] = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All time' },
];

function TimeRangeTabs({
  selected,
  onChange,
}: {
  selected: TimeRange;
  onChange: (range: TimeRange) => void;
}) {
  return (
    <div className="flex bg-warm-100/80 rounded-xl p-1">
      {TIME_RANGES.map((range) => (
        <Button variant="ghost"
          key={range.id}
          onClick={() => onChange(range.id)}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200',
            selected === range.id
              ? 'bg-white text-warm-900 shadow-sm'
              : 'text-warm-500 hover:text-warm-700'
          )}
        >
          {range.label}
        </Button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DetailModal Component
// ---------------------------------------------------------------------------

export function DetailModal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  showTimeRange = true,
  selectedTimeRange = '7d',
  onTimeRangeChange,
  onExport,
  width = 'full',
}: DetailModalProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>(selectedTimeRange);

  const handleTimeRangeChange = (range: TimeRange) => {
    setTimeRange(range);
    onTimeRangeChange?.(range);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Fragment>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-warm-900/30 backdrop-blur-sm z-50"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={cn(
              'fixed inset-y-0 right-0 z-50 flex flex-col',
              'bg-white/95 backdrop-blur-2xl border-l border-white/30 shadow-2xl',
              'w-full',
              widthClasses[width]
            )}
          >
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-5 border-b border-warm-100/80">
              <div className="flex items-start justify-between">
                <div className="pr-8">
                  <h2 className="text-xl font-bold text-warm-900">{title}</h2>
                  {subtitle && (
                    <p className="text-sm text-warm-500 mt-0.5">{subtitle}</p>
                  )}
                </div>
                
                <IconButton variant="default"
                  onClick={onClose}
                  aria-label="Close panel"
                  className="p-2 -mt-1 -mr-2 rounded-xl hover:bg-warm-100 active:bg-warm-200 text-warm-400 hover:text-warm-600 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </IconButton>
              </div>

              {/* Time range & Export row */}
              {(showTimeRange || onExport) && (
                <div className="flex items-center justify-between mt-4 gap-3">
                  {showTimeRange && (
                    <TimeRangeTabs
                      selected={timeRange}
                      onChange={handleTimeRangeChange}
                    />
                  )}
                  
                  {onExport && (
                    <Button variant="ghost"
                      onClick={onExport}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium',
                        'bg-warm-100/80 text-warm-600 hover:bg-warm-200/80 transition-colors'
                      )}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Export
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {children}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-warm-100/80">
              <div className="flex items-center justify-end gap-3">
                <Button variant="ghost"
                  onClick={onClose}
                  className={cn(
                    'px-5 py-2.5 rounded-xl text-sm font-medium',
                    'bg-warm-100 text-warm-700 hover:bg-warm-200 transition-colors'
                  )}
                >
                  Close
                </Button>
              </div>
            </div>
          </motion.div>
        </Fragment>
      )}
    </AnimatePresence>
  );
}

export default DetailModal;
