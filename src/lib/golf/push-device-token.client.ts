'use client';

import type { DeviceTokenResult } from '@/lib/golf/push-device-token.types';

/**
 * Register an APNs/FCM token via the API route (avoids lib → app imports).
 */
export async function registerDeviceTokenClient(
  token: string,
  platform: 'ios' | 'android' | 'web',
  deviceName?: string,
): Promise<DeviceTokenResult> {
  const response = await fetch('/api/golf/device-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token, platform, deviceName }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as DeviceTokenResult | null;
    if (body && body.success === false) return body;
    return { success: false, error: `HTTP ${response.status}` };
  }

  return (await response.json()) as DeviceTokenResult;
}
