'use client';

import { useEffect, useState } from 'react';
import { Drawer as VaulDrawer } from 'vaul';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResponsiveDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  /** On desktop, renders as centered modal. On mobile, renders as bottom sheet. */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Snap points for the bottom sheet (mobile only). Default: [1] (full height) */
  snapPoints?: (number | string)[];
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-3xl',
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1023px)');
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

/**
 * Responsive Drawer component.
 * - Mobile (< lg): Bottom sheet with drag handle, drag-to-dismiss
 * - Desktop (>= lg): Centered modal (unchanged from current modal behavior)
 */
export function ResponsiveDrawer({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  snapPoints,
}: ResponsiveDrawerProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <VaulDrawer.Root
        open={open}
        onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
        snapPoints={snapPoints}
      >
        <VaulDrawer.Portal>
          <VaulDrawer.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
          <VaulDrawer.Content
            className={cn(
              'fixed inset-x-0 bottom-0 z-50 flex flex-col',
              'rounded-t-2xl bg-white',
              'max-h-[96dvh]',
              'focus:outline-none'
            )}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="h-1.5 w-10 rounded-full bg-warm-300" />
            </div>

            {/* Header */}
            {(title || description) && (
              <div className="px-5 pb-3 border-b border-warm-100">
                {title && (
                  <VaulDrawer.Title className="text-lg font-semibold text-warm-900">
                    {title}
                  </VaulDrawer.Title>
                )}
                {description && (
                  <VaulDrawer.Description className="text-sm text-warm-500 mt-0.5">
                    {description}
                  </VaulDrawer.Description>
                )}
              </div>
            )}

            {/* Content */}
            <div
              className="flex-1 overflow-y-auto px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
              data-scroll-container
            >
              {children}
            </div>
          </VaulDrawer.Content>
        </VaulDrawer.Portal>
      </VaulDrawer.Root>
    );
  }

  // Desktop: standard centered modal
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={cn(
          'relative z-10 w-full mx-4',
          sizeClasses[size],
          'bg-white rounded-2xl shadow-2xl',
          'max-h-[90vh] flex flex-col',
          'animate-in fade-in zoom-in-95 duration-200'
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        {(title || description) && (
          <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-warm-100">
            <div>
              {title && (
                <h2 className="text-lg font-semibold text-warm-900">{title}</h2>
              )}
              {description && (
                <p className="text-sm text-warm-500 mt-0.5">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4" data-scroll-container>
          {children}
        </div>
      </div>
    </div>
  );
}
