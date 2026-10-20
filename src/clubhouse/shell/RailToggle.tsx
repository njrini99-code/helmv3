'use client';

import { useCallback, useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { haptic } from '../lib/haptics';
import { CH_RAIL_COOKIE } from '../lib/rail-cookie';
import { Icon } from '../ui/Icon';
import { Tooltip } from '../ui/Tooltip';
import { isApple, modKey } from './command/shortcuts';

/** Remembers the fold for the next load (read on the server by railHint, so a reload draws the rail first). */
function rememberFold(folded: boolean): void {
  document.cookie = `${CH_RAIL_COOKIE}=${folded ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * The little circle on the sidebar's edge that folds it to an icon rail and opens it again (owner, 2026-10-17: "a
 * little circle that collapses the sidebar and just shows the golfhelm logo and all the icons"). It sits on the seam
 * between the sidebar and the canvas, level with the brand, and rides the edge as it moves. Cmd or Ctrl with \ does
 * the same. Desktop only: the phone has no sidebar. The motion itself is CSS (shell.css, "The folding sidebar").
 */
export function RailToggle({ folded, onFold }: { folded: boolean; onFold: (folded: boolean) => void }) {
  const toggle = useCallback(() => {
    const next = !folded;
    onFold(next);
    rememberFold(next);
    haptic('select');
  }, [folded, onFold]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '\\' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  // Only drawn once the tip is up, which is on the client: the key is the platform's own (the Command key on a Mac).
  const mod = modKey(isApple(typeof navigator === 'undefined' ? undefined : navigator));
  const label = folded ? 'Expand sidebar' : 'Collapse sidebar';
  return (
    <Tooltip label={label} shortcut={[mod, '\\']}>
      <button
        type="button"
        className="ch-railtoggle"
        aria-controls="ch-sidebar"
        aria-expanded={!folded}
        aria-label={label}
        aria-keyshortcuts="Meta+Backslash Control+Backslash"
        onClick={toggle}
      >
        <Icon icon={ChevronLeft} size={13} />
      </button>
    </Tooltip>
  );
}
