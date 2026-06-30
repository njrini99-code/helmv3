import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { z } from 'zod';
import type { DeviceTokenResult } from '@/lib/golf/push-device-token.types';

const registerDeviceTokenSchema = z.object({
  token: z.string().min(1, 'token is required').max(512),
  platform: z.enum(['ios', 'android', 'web']),
  deviceName: z.string().max(256).optional(),
});

const deviceTokenSchema = z.string().min(1, 'token is required').max(512);

export async function registerDeviceTokenForUser(
  token: string,
  platform: 'ios' | 'android' | 'web',
  deviceName?: string,
): Promise<DeviceTokenResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHORIZED_RETRYABLE',
      retryable: true,
    };
  }

  const parsed = registerDeviceTokenSchema.safeParse({ token, platform, deviceName });
  if (!parsed.success) {
    return { success: false, error: 'Invalid device token payload' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('device_tokens')
    .upsert(
      {
        user_id: user.id,
        token: parsed.data.token,
        platform: parsed.data.platform,
        device_name: parsed.data.deviceName ?? null,
        active: true,
        failed_count: 0,
      },
      { onConflict: 'token' },
    );

  if (error) {
    await logServerError(`Failed to register device token: ${error.message}`, {
      action: 'push_notifications.registerDeviceToken',
    });
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function unregisterDeviceTokenForUser(token: string): Promise<DeviceTokenResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHORIZED_RETRYABLE',
      retryable: true,
    };
  }

  const parsed = deviceTokenSchema.safeParse(token);
  if (!parsed.success) {
    return { success: false, error: 'Invalid device token' };
  }

  const { error } = await supabase
    .from('device_tokens')
    .update({ active: false })
    .eq('token', parsed.data)
    .eq('user_id', user.id);

  if (error) {
    await logServerError(`Failed to unregister device token: ${error.message}`, {
      action: 'push_notifications.unregisterDeviceToken',
    });
    return { success: false, error: error.message };
  }

  return { success: true };
}
