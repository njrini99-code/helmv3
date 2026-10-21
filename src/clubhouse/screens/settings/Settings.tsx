'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { usePushSubscription } from '@/hooks/golf/use-push-subscription';
import { isNativeApp } from '@/lib/utils/capacitor';
import type { ChDevice, ChSettingsData, ChSettingsSection } from './model';
import { SettingsView } from './SettingsView';
import { createLiveWrites } from './writes';
import { useNativePush } from './native-push';

/** Push-to-self (D1-6): the server sends one fixed test to the signed-in person's own subscriptions. */
async function sendTestPush(): Promise<{ ok: boolean; sent?: number; error?: string }> {
  const res = await fetch('/api/push-subscriptions/test', { method: 'POST' });
  const body = (await res.json().catch(() => ({}))) as { sent?: number; error?: string };
  return res.ok ? { ok: true, sent: body.sent } : { ok: false, error: body.error };
}

/** The live Settings: server data from the route, the real writes, this device's push and haptics. */
export function Settings({ data, section, opened = false }: { data: ChSettingsData; section: ChSettingsSection; opened?: boolean }) {
  const router = useRouter();
  const push = usePushSubscription();
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);
  // In the iOS app push is Apple's, not the browser's (blocker 12): the row reads and asks iOS.
  const nativePush = useNativePush(native);
  const writes = useMemo(
    () =>
      createLiveWrites({
        role: data.role,
        userId: data.userId,
        email: data.email,
        coachId: data.coachId,
        playerId: data.playerId,
        teamId: data.teamId,
        refresh: () => router.refresh(),
      }),
    [data.role, data.userId, data.email, data.coachId, data.playerId, data.teamId, router],
  );
  const device: ChDevice = { native, nativePush, push: { ...push, test: sendTestPush } };
  return <SettingsView data={data} writes={writes} device={device} initialSection={section} opened={opened} onDeleted={() => void writes.cleanupAfterDelete()} />;
}
