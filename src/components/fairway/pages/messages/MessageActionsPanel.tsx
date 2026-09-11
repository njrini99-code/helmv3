'use client';

import { useMemo, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useSafeAreaInsets } from '@/hooks/use-mobile-detection';
import { IconButton } from '@/components/fairway/controls/button';
import { FW_Z } from '@/components/fairway/overlays/_shared';
import { cn } from '@/lib/utils';

/** A contextual reaction stack that expands from the message on every device. */
export function MessageActionsPanel({ open, anchor, own, onClose, children }: {
  open: boolean;
  anchor: () => HTMLElement | null;
  own: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const desktop = useMediaQuery('(min-width: 768px) and (pointer: fine)');
  const reduced = useReducedMotion();
  const safeArea = useSafeAreaInsets();
  const collisionPadding = {
    top: Math.max(12, safeArea.top + 8),
    bottom: Math.max(12, safeArea.bottom + 8),
    left: Math.max(12, safeArea.left + 8),
    right: Math.max(12, safeArea.right + 8),
  };
  const virtualRef = useMemo(() => ({ current: {
    getBoundingClientRect: () => anchor()?.getBoundingClientRect() ?? new DOMRect(),
  } }), [anchor]);

  return (
    <Popover.Root open={open} modal={!desktop} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Popover.Anchor virtualRef={virtualRef} />
      {/* Radix keeps positioning/focus ownership while Presence finishes the exit. */}
      <Popover.Portal forceMount>
        <AnimatePresence>
          {open && !desktop && (
            <m.div
              key="backdrop"
              data-slot="message-actions-backdrop"
              className="fixed inset-0 bg-[oklch(0.18_0.01_50_/_0.18)] backdrop-blur-[8px] motion-reduce:backdrop-blur-none"
              style={{ zIndex: FW_Z.overlay }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.18 }}
              onPointerDown={onClose}
              aria-hidden="true"
            />
          )}
          {open && (
            <Popover.Content
              key="actions"
              forceMount
              asChild
              side="top"
              align={own ? 'end' : 'start'}
              sideOffset={12}
              collisionPadding={collisionPadding}
              aria-label="Message actions"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                anchor()?.closest('[data-message-row]')?.querySelector<HTMLButtonElement>('button[aria-label="Message actions"]')?.focus({ preventScroll: true });
              }}
            >
              <m.div
                data-fw-message-actions
                data-slot="message-actions"
                className={cn(
                  'fairway-ds relative max-w-[calc(100vw-1.5rem)] origin-[var(--radix-popover-content-transform-origin)] p-1 overflow-y-auto overscroll-contain outline-none',
                  desktop ? 'w-80' : 'w-[min(22rem,calc(100vw-1.5rem))]',
                )}
                style={{ zIndex: desktop ? FW_Z.command : FW_Z.modal, maxHeight: 'var(--radix-popover-content-available-height)' }}
                initial={reduced ? false : { opacity: 0, scale: 0.9, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 3 }}
                transition={{ duration: reduced ? 0 : 0.24, ease: [0.2, 0.85, 0.25, 1] }}
              >
                {children}
                <span className="sr-only">
                  <IconButton variant="ghost" aria-label="Close message actions" tabIndex={-1} onClick={onClose}>
                    <X size={16} aria-hidden="true" />
                  </IconButton>
                </span>
              </m.div>
            </Popover.Content>
          )}
        </AnimatePresence>
      </Popover.Portal>
    </Popover.Root>
  );
}
