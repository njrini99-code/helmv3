'use client';

import { useCallback } from 'react';
import { haptic } from '../../lib/haptics';
import { useToast } from '../../ui/Toast';

/** Copy the join code or link: the OS success tap and a toast (CH-3703), or how to do it by hand (CH-3006). */
export function useCopyText() {
  const toast = useToast();
  return useCallback(
    async (text: string, what: string) => {
      try {
        await navigator.clipboard.writeText(text);
        haptic('success');
        toast({ title: `${what} copied` });
      } catch {
        haptic('error');
        toast({ tone: 'error', title: `Couldn't copy the ${what.toLowerCase()}`, body: 'Select it and copy it by hand.', code: 'CH-3006' });
      }
    },
    [toast],
  );
}
