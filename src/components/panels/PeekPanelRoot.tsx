'use client';

import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { IconX } from '@/components/icons';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/button';
import { useMediaQuery } from '@/hooks/use-media-query';

interface PeekPanelProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
  title?: string;
  className?: string;
}

const widthClasses = {
  sm: 'w-80',      // 320px
  md: 'w-96',      // 384px
  lg: 'w-[32rem]', // 512px
  xl: 'w-[40rem]', // 640px
};

export function PeekPanelRoot({
  isOpen,
  onClose,
  children,
  width = 'lg',
  title,
  className,
}: PeekPanelProps) {
  const prefersReducedMotion = useReducedMotion();
  // Below `sm` (640px) this renders as a bottom sheet instead of the
  // right-edge desktop panel — the fixed `lg` (512px) width previously used
  // unconditionally left most of the panel off-screen on any phone.
  const isDesktop = useMediaQuery('(min-width: 640px)');
  // Handle ESC key
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleEscape);
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, handleEscape]);

  // Don't render portal on server
  if (typeof window === 'undefined') return null;

  const content = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.2 })}
            onClick={onClose}
            className="fixed inset-0 bg-warm-900/30 backdrop-blur-sm z-40"
          />

          {/* Panel — bottom sheet on phone, right-edge dock at `sm:` and up */}
          <motion.div
            initial={isDesktop ? { x: '100%' } : { y: '100%' }}
            animate={isDesktop ? { x: 0 } : { y: 0 }}
            exit={isDesktop ? { x: '100%' } : { y: '100%' }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ type: 'spring', damping: 25, stiffness: 300 })}
            className={cn(
              'fixed glass-prominent shadow-2xl z-50 flex flex-col',
              isDesktop
                ? cn('top-0 right-0 h-full', widthClasses[width])
                : 'inset-x-0 bottom-0 w-full max-h-[85dvh] rounded-t-[24px]',
              className
            )}
          >
            {/* Drag-affordance bar — mobile bottom-sheet only, decorative. */}
            {!isDesktop && (
              <div
                aria-hidden="true"
                className="mx-auto mt-2.5 mb-0.5 h-1.5 w-10 shrink-0 rounded-full bg-warm-300"
              />
            )}

            {/* Header */}
            {title && (
              <div className="flex items-center justify-between px-6 py-4 border-b border-warm-200 flex-shrink-0">
                <h2 className="text-lg font-semibold text-warm-900">{title}</h2>
                <IconButton variant="default"
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 active:bg-warm-200 transition-colors"
                  aria-label="Close panel"
                >
                  <IconX size={20} />
                </IconButton>
              </div>
            )}

            {/* Content - Scrollable */}
            <div
              className="flex-1 overflow-y-auto"
              style={!isDesktop ? { paddingBottom: 'env(safe-area-inset-bottom, 0px)' } : undefined}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
