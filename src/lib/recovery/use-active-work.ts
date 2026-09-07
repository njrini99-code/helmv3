'use client';

import { useEffect } from 'react';

import { getRecovery } from '@/lib/recovery/client';

/**
 * Register a screen's work with the coordinator for as long as it is mounted.
 *
 * `isDirty` is the screen's own "would the user lose something" predicate —
 * the same one its `beforeunload` guard uses. While any registered owner is
 * dirty, an automatic document replacement is refused outright.
 */
export function useActiveWork(id: string, isDirty: boolean): void {
  useEffect(() => {
    const recovery = getRecovery();
    if (!recovery) return undefined;
    recovery.registerWork(id, isDirty ? 'dirty' : 'clean');
    return () => recovery.releaseWork(id);
  }, [id, isDirty]);
}
