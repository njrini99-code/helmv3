'use client';

import { useMemo, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { m, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { IconButton } from '@/components/fairway/controls/button';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { FW_Z } from '@/components/fairway/overlays/_shared';

/** One action body, with a touch sheet or a collision-aware desktop anchor. */
export function MessageActionsPanel({ open, anchor, own, onClose, children }: {
  open: boolean;
  anchor: () => HTMLElement | null;
  own: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const desktop = useMediaQuery('(min-width: 768px) and (pointer: fine)');
  const reduced = useReducedMotion();
  const virtualRef = useMemo(() => ({ current: {
    getBoundingClientRect: () => anchor()?.getBoundingClientRect() ?? new DOMRect(),
  } }), [anchor]);

  if (!desktop) {
    return (
      <Sheet open={open} onOpenChange={(open) => { if (!open) onClose(); }}
        title="Message actions" hideTitle className="fw-glass-chrome sm:mx-auto sm:max-w-sm">
        <Sheet.Body className="px-3 pt-3">{children}</Sheet.Body>
      </Sheet>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Popover.Anchor virtualRef={virtualRef} />
      <Popover.Portal>
        <Popover.Content asChild side="top" align={own ? 'end' : 'start'}
          sideOffset={10} collisionPadding={12} aria-label="Message actions"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            anchor()?.closest('[data-message-row]')?.querySelector<HTMLButtonElement>('button[aria-label="Message actions"]')?.focus({ preventScroll: true });
          }}>
          <m.div data-fw-message-actions className="fairway-ds relative w-80 max-w-[calc(100vw-1.5rem)] origin-[var(--radix-popover-content-transform-origin)] rounded-card fw-glass-chrome border p-3 text-text-primary shadow-raise outline-none"
            style={{ zIndex: FW_Z.command }}
            initial={reduced ? false : { opacity: 0, scale: 0.96, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}>
            <IconButton variant="ghost" aria-label="Close message actions" className="absolute right-1 top-1" onClick={onClose}>
              <X size={16} aria-hidden="true" />
            </IconButton>
            {children}
          </m.div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
