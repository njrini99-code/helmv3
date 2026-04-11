'use client';

/**
 * Dashboard route template — fires on every route segment change.
 *
 * Provides a subtle iOS-native crossfade when the user navigates between
 * dashboard tabs (Dashboard -> Roster -> Calendar, etc.). Previously these
 * transitions were an abrupt cut.
 *
 * iOS pattern: 250ms opacity crossfade with ease-out curve
 * (cubic-bezier(0.25, 0.1, 0.25, 1)).
 *
 * This uses framer-motion's `m` (tree-shaken) via LazyMotion that is already
 * mounted in GolfDashboardShell. Reduced-motion is handled by the parent
 * MotionConfig and will collapse the animation to an instant swap.
 */

import { m } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { IOS_DURATION_NORMAL, IOS_EASE } from '@/lib/ios-animations';

export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <m.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: IOS_DURATION_NORMAL, ease: IOS_EASE }}
      className="min-h-full"
    >
      {children}
    </m.div>
  );
}
