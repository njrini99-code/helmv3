'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { chFocusQuietly } from '../../../lib/focus-quietly';

/** The desktop panel: non-modal, no scrim, the board behind stays usable. Focus to its heading, Esc closes, focus back to the opener (AC-INSP). */
export function Inspector({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const panel = useRef<HTMLElement | null>(null);
  // The last panel stays while it slides out, so it doesn't leave empty (MOT-12).
  const last = useRef<ReactNode>(children);
  if (open) last.current = children;
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    opener.current = (document.activeElement as HTMLElement | null) ?? null;
    const heading = panel.current?.querySelector<HTMLElement>('h3, h2, b');
    if (heading) {
      heading.tabIndex = -1;
      chFocusQuietly(heading);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener.current?.isConnected) chFocusQuietly(opener.current);
    };
  }, [open, onClose]);
  return (
    <aside ref={panel} className={'insp' + (open ? ' on' : '')} aria-label={label} aria-hidden={!open} inert={!open || undefined}>
      <div className="ins">{open ? children : last.current}</div>
    </aside>
  );
}
