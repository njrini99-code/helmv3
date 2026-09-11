'use client';

import { useEffect } from 'react';

import { getRecovery } from '@/lib/recovery/client';

/**
 * The hydrated half of the recovery coordinator.
 *
 * It used to delete the boot script's attempt markers on every successful
 * mount — which is every reload, including a recovery reload — so a broken
 * bundle got a fresh budget each time round and the "hard cap" never
 * capped anything. Hydration now ABSORBS the URL marker into the session
 * ledger instead of clearing it, and only tidies the URL away once the
 * count is safely stored.
 *
 * Mounting here is also what tells the coordinator that the app is up: from
 * this point on, "no work owner has registered" means the state is unknown
 * rather than provably safe.
 */
export function ChunkLoadErrorHandler() {
  useEffect(() => {
    const recovery = getRecovery();
    if (!recovery) return;
    recovery.absorbUrlMarker();
    recovery.markProviderMounted();
  }, []);

  return null;
}
