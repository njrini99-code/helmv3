'use client';

import { memo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, type Variants, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { usePeekPanelStore } from '@/stores/peek-panel-store';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { PlayerPeekContent } from './PlayerPeekContent';
import { IconX } from '@/components/icons';

interface PeekPanelProps {
  className?: string;
}

const PANEL_WIDTH = 400;

// Animation variants for the slide-in panel
const panelVariants: Variants = {
  hidden: {
    x: PANEL_WIDTH,
    opacity: 0,
  },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 400,
      damping: 35,
      mass: 0.8,
    },
  },
  exit: {
    x: PANEL_WIDTH,
    opacity: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 400,
      damping: 40,
    },
  },
};

// Animation variants for the backdrop
const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2 },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15 },
  },
};

const PeekPanelComponent = function PeekPanel({ className }: PeekPanelProps) {
  const prefersReducedMotion = useReducedMotion();
  const { isOpen, panelType, selectedId, closePanel } = usePeekPanelStore();
  const { modalRef } = useFocusTrap(isOpen, closePanel);
  const panelRef = useRef<HTMLDivElement>(null);

  // Handle click outside
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        closePanel();
      }
    },
    [closePanel]
  );

  // Lock body scroll when panel is open
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Render content based on panel type
  const renderContent = (): React.ReactNode => {
    if (!selectedId) {
      return null;
    }

    switch (panelType) {
      case 'player':
        return <PlayerPeekContent playerId={selectedId} onClose={closePanel} />;
      case 'school':
        // School peek content can be added later
        return (
          <div className="p-5 text-center text-warm-500">
            School details are not available for this program.
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              'fixed inset-0 z-40',
              'bg-black/20 backdrop-blur-[2px]',
              'cursor-pointer'
            )}
            onClick={handleBackdropClick}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            ref={modalRef}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-label={panelType === 'player' ? 'Player preview' : 'Preview panel'}
            className={cn(
              'fixed top-0 right-0 z-50',
              'h-full w-full max-w-[400px]',
              'bg-cream-50/95 backdrop-blur-xl',
              'shadow-2xl shadow-black/10',
              'border-l border-warm-200/50',
              'flex flex-col',
              'overflow-hidden',
              className
            )}
          >
            {/* Close button */}
            <motion.button
              onClick={closePanel}
              className={cn(
                'absolute top-4 right-4 z-10',
                'w-9 h-9 flex items-center justify-center',
                'rounded-xl bg-warm-100/80 backdrop-blur-sm',
                'text-warm-500 hover:text-warm-700 hover:bg-warm-200/80',
                'transition-colors duration-200',
                'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2'
              )}
              whileHover={prefersReducedMotion ? undefined : ({ scale: 1.05 })}
              whileTap={prefersReducedMotion ? undefined : ({ scale: 0.95 })}
              aria-label="Close panel"
            >
              <IconX size={18} />
            </motion.button>

            {/* Panel content */}
            <div ref={panelRef} className="flex-1 overflow-y-auto">
              {renderContent()}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export const PeekPanel = memo(PeekPanelComponent);
PeekPanel.displayName = 'PeekPanel';
