'use client';

/**
 * ============================================================================
 * NotificationPanelContext — shared open-state for the ONE notifications feed
 * ----------------------------------------------------------------------------
 * `NotificationBell` (mounted once, in FairwayTopBar's actions slot) owns the
 * actual popover/sheet. Every OTHER "View all" entry point — the coach/player
 * home "Latest" module today, any future one tomorrow — opens that SAME
 * instance instead of growing its own duplicate feed UI. This context is the
 * thin wire between them: just `open` + a setter, nothing else. Item data,
 * fetching, and mark-read state all stay local to `NotificationBell`.
 *
 * Mounted once in FairwayDashboardShell (alongside NotificationBadgeProvider)
 * so it wraps both the top bar and every page's content.
 * ========================================================================== */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface NotificationPanelContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const NotificationPanelContext = createContext<NotificationPanelContextValue | null>(null);

export function NotificationPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo<NotificationPanelContextValue>(() => ({ open, setOpen }), [open]);
  return (
    <NotificationPanelContext.Provider value={value}>{children}</NotificationPanelContext.Provider>
  );
}

/**
 * Access the shared notifications feed open-state. Returns a safe no-op
 * fallback outside the provider (rather than throwing) — a "View all" button
 * that never opens anything is a much smaller failure than crashing the page
 * it lives on.
 */
export function useNotificationPanel(): NotificationPanelContextValue {
  const ctx = useContext(NotificationPanelContext);
  return ctx ?? { open: false, setOpen: () => {} };
}
