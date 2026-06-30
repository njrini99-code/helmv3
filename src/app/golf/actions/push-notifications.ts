'use server';

import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import type { DeviceTokenResult } from '@/lib/golf/push-device-token.types';
import {
  registerDeviceTokenForUser,
  unregisterDeviceTokenForUser,
} from '@/lib/golf/device-token.server';

/**
 * Register (or refresh) an APNs/FCM device token for the current user.
 */
export async function registerDeviceToken(
  token: string,
  platform: 'ios' | 'android' | 'web',
  deviceName?: string,
): Promise<DeviceTokenResult> {
  return registerDeviceTokenForUser(token, platform, deviceName);
}

/** Soft-deactivate a device token for the current user (auth-first). */
export async function unregisterDeviceToken(token: string): Promise<DeviceTokenResult> {
  return unregisterDeviceTokenForUser(token);
}

/** List the current user's active device tokens (auth-first). */
export async function getDeviceTokens() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      success: false as const,
      data: [],
      error: 'Unauthorized',
      code: 'UNAUTHORIZED_RETRYABLE' as const,
      retryable: true,
    };
  }

  const { data, error } = await supabase
    .from('device_tokens')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (error) {
    await logServerError(`Failed to get device tokens: ${error.message}`, { action: 'push_notifications.getDeviceTokens' });
    return { success: false as const, data: [], error: error.message };
  }

  return { success: true as const, data: data ?? [] };
}
