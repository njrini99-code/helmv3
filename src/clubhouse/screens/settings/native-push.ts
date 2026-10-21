'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { canOpenNativeAppSettings, openNativeAppSettings } from '@/lib/utils/capacitor';
import { nativePushPermission, requestPushPermission } from '@/lib/utils/push-registration';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { useToast } from '../../ui/Toast';
import type { ChNativePush } from './model';

/**
 * This device's push in the iOS app, for Settings › Notifications (docs/clubhouse/phone/push-opt-in.md). Reads what
 * iOS says on mount and again whenever the app comes back to the front, so the row is right after a trip to iOS
 * Settings; push turned on there registers with Apple then, not at the next launch. `turnOn` shows iOS's prompt
 * through the shared `requestPushPermission` (the same one the soft ask uses, which registers on a yes). Undefined on
 * the web and where the plugin can't answer.
 */
export function useNativePush(native: boolean): ChNativePush | undefined {
  const toast = useToast();
  const [status, setStatus] = useState<ChNativePush['status'] | 'unsupported'>('checking');
  const [pending, setPending] = useState(false);
  const last = useRef(status);
  last.current = status;
  const busy = useRef(false);

  const read = useCallback(async () => {
    const next = await nativePushPermission();
    // Turned on in iOS Settings since the last read: register with Apple now (no prompt shows once iOS says yes).
    if (next === 'granted' && last.current === 'denied') void requestPushPermission();
    setStatus(next);
  }, []);

  useEffect(() => {
    if (!native) return;
    void read();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [native, read]);

  const turnOn = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    chTrail('settings native push on');
    setPending(true);
    try {
      const answer = await requestPushPermission();
      await read();
      if (answer === 'granted') {
        haptic('success');
        toast({ title: 'Push is on for this device' });
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, [read, toast]);

  if (!native || status === 'unsupported') return undefined;
  return { status, pending, turnOn, openSettings: canOpenNativeAppSettings() ? openNativeAppSettings : undefined };
}
