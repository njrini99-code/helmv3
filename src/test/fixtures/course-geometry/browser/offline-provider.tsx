import type { ReactNode } from 'react';

/** Static fixture boundary: the public phone preview never registers the
 * production service worker, probes health, or initializes sync storage. */
export function OfflineProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
