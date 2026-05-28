'use client';

/**
 * Dashboard route template — fires on every route segment change.
 *
 * Provides a subtle cinematic transition when the user navigates between
 * dashboard tabs (Dashboard → Roster → Calendar, etc.). Previously these
 * transitions were an abrupt cut.
 *
 * Premium recipe (May 2026):
 *   - Opacity fade-in 0 → 1 over 380ms
 *   - Tiny slide-up: 6px translate-y → 0
 *   - Cubic-bezier(0.16, 1, 0.3, 1) — the "Apple iOS" out-quint ease
 *     used everywhere else in the system (DropdownMenu, Tooltip,
 *     Popover, Drawer, Tabs)
 *
 * This uses framer-motion's `m` (tree-shaken) via LazyMotion that is already
 * mounted in GolfDashboardShell. Reduced-motion is handled by the parent
 * MotionConfig and will collapse the animation to an instant swap.
 */

import { m } from 'framer-motion';
import { usePathname } from 'next/navigation';

const PREMIUM_EASE = [0.16, 1, 0.3, 1] as const;
const PREMIUM_DURATION = 0.38;

export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <m.div
      key={pathname}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: PREMIUM_DURATION, ease: PREMIUM_EASE }}
      className="min-h-full"
    >
      {children}
    </m.div>
  );
}
