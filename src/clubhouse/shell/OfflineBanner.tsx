'use client';

import { AnimatePresence, m } from 'motion/react';
import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOfflineSyncStatus } from '@/stores/offline-sync-store';
import { Icon } from '../ui/Icon';
import { haptic } from '../lib/haptics';
import { chTween } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import { chTrail } from '../lib/track';

/** The line under the headline when round scoring is waiting on this device (rounds, holes and shots in IndexedDB). */
export function pendingLine(total: number): string | null {
  if (!(total > 0)) return null;
  return `${total} ${total === 1 ? 'change' : 'changes'} saved on this device will sync when you reconnect.`;
}

/**
 * CH-1901: a slim banner under the top bar while the device is offline. Saves
 * are refused with CH-1903 instead of spinning; only round scoring keeps going
 * (it is held on the device and synced later), so the copy says exactly that.
 * When the offline queue holds anything, the banner counts it. The banner
 * clears itself when the connection comes back.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const reduced = useChReducedMotion();
  const pending = pendingLine(useOfflineSyncStatus().pendingCount.total);
  useEffect(() => {
    const sync = () => {
      const now = navigator.onLine === false;
      setOffline((was) => {
        if (was !== now) {
          chTrail(now ? 'went offline' : 'back online');
          // CH-1706: the OS warning as the connection drops; CH-1605: the banner fades in and out.
          if (now) haptic('warning');
        }
        return now;
      });
    };
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);
  return (
    <AnimatePresence initial={false}>
      {offline && (
        <m.div
          className="ch-offline"
          role="status"
          data-ch-code="CH-1901"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={chTween('base', reduced)}
        >
          <Icon icon={WifiOff} size={15} />
          <span>
            You&apos;re offline. You can keep reading and keep scoring a round; other changes need a connection.
            {pending && <span data-ch-offline-pending=""> {pending}</span>}
          </span>
        </m.div>
      )}
    </AnimatePresence>
  );
}
