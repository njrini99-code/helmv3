'use client';

import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { IconX } from '@/components/icons';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/button';

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

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ type: 'spring', damping: 25, stiffness: 300 })}
            className={cn(
              'fixed top-0 right-0 h-full glass-prominent shadow-2xl z-50 flex flex-col',
              widthClasses[width],
              className
            )}
          >
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
            <div className="flex-1 overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
