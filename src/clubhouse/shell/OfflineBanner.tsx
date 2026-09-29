'use client';

import { AnimatePresence, m } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import { haptic } from '../lib/haptics';
import { chTween } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import { chTrail } from '../lib/track';

/**
 * CH-1901: a slim banner under the top bar while the device is offline. Saves
 * are refused with CH-1903 instead of spinning; the banner clears itself when
 * the connection comes back.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const reduced = useChReducedMotion();
  useEffect(() => {
    const sync = () => {
      const now = navigator.onLine === false;
      setOffline((was) => {
        if (was !== now) {
          chTrail(now ? 'went offline' : 'back online');
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
          transition={chTween('base')}
        >
          <Icon icon={WifiOff} size={15} />
          <span>You&apos;re offline. You can keep reading; changes will wait until you reconnect.</span>
        </m.div>
      )}
    </AnimatePresence>
  );
}
