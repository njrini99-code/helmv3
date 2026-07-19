'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { IconX, IconSearch } from '@/components/icons';
import { IconButton } from '@/components/ui/button';

// sessionStorage — the hint is a "per session" nudge (audit #27/#107/#115/
// #190), not a permanent opt-out: closing the tab and coming back later
// re-shows it once, but it never reappears mid-session once dismissed.
const STORAGE_KEY = 'helm-shortcut-hint-dismissed';

export function KeyboardShortcutHint() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Check if user has dismissed this hint this session
    const wasDismissed = sessionStorage.getItem(STORAGE_KEY) === 'true';
    setDismissed(wasDismissed);

    if (!wasDismissed) {
      // Show after a short delay
      const timer = setTimeout(() => setVisible(true), 2000);
      // Auto-hide after 8 seconds
      const hideTimer = setTimeout(() => setVisible(false), 10000);
      return () => {
        clearTimeout(timer);
        clearTimeout(hideTimer);
      };
    }
    return undefined;
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    setDismissed(true);
    sessionStorage.setItem(STORAGE_KEY, 'true');
  };

  if (dismissed || !visible) return null;

  return (
    <div className={cn(
      // ⌘K is meaningless on touch — stay `hidden` (no display, no overlap,
      // no focus stop) unless the pointer is fine AND the viewport is `md`+
      // (768px). `md` is deliberate, not `sm` (640px): it's the SAME
      // breakpoint `FairwayBottomNav` uses for `md:hidden` and the sonner
      // Toaster uses for its mobile-vs-desktop position flip (audit #121).
      // At the old `sm` (640px) gate, the 640-767px band showed the mobile
      // bottom tab bar, a bottom-center mobile-styled toast, AND this pill —
      // three fixed-bottom, bottom-center elements stacking on each other.
      // Gating on `md` guarantees the pill only ever renders once the mobile
      // tab bar is gone (`md:hidden`) and the toast has already flipped to
      // its desktop bottom-right slot, so the two surfaces never compete for
      // the same corner.
      'hidden [@media(pointer:fine)_and_(min-width:768px)]:flex',
      // Anchored top-right, under the glass top bar (h-16 = 64px), instead
      // of fixed-bottom over page content — a bottom-fixed pill was landing
      // on top of real in-page controls on long-scroll pages (Round Detail /
      // Review / Qualifier Detail) since desktop has no bottom tab bar
      // reserving space for it. Top-right is never a page's primary content
      // or action-cluster location on this shell.
      'fixed top-20 right-6 z-30 animate-slide-up',
      'bg-warm-900 text-white px-4 py-3 rounded-xl shadow-2xl',
      'items-center gap-3'
    )}>
      <IconSearch size={16} className="text-warm-400" />
      <span className="text-sm">
        Press <kbd className="px-1.5 py-0.5 bg-warm-800 rounded text-xs mx-1">⌘K</kbd> for quick actions
      </span>
      <IconButton variant="default"
        onClick={handleDismiss}
        className="p-1 hover:bg-warm-800 rounded transition-colors"
        aria-label="Dismiss hint"
      >
        <IconX size={14} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
