'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { z } from 'zod';
import type { DeviceTokenResult } from '@/lib/golf/push-device-token.types';

// Device-token payloads arrive from the iOS Capacitor bridge as raw
// strings — validate before they reach the database.
const registerDeviceTokenSchema = z.object({
  token: z.string().min(1, 'token is required').max(512),
  platform: z.enum(['ios', 'android', 'web']),
  deviceName: z.string().max(256).optional(),
});

const deviceTokenSchema = z.string().min(1, 'token is required').max(512);

/**
 * Register (or refresh) an APNs/FCM device token for the current user.
 * Auth-first per server-action convention; on a missing session it returns
 * a retryable result rather than throwing so the iOS login-confirm cookie
 * race can be retried silently by the caller.
 */
// nosemgrep: helmv3-action-missing-revalidate -- device-token registry; no cached page reads this table
// SEMGREP-ALLOW: device-token registry is read directly by the push worker, not cached pages
export async function registerDeviceToken(
  token: string,
  platform: 'ios' | 'android' | 'web',
  deviceName?: string
): Promise<DeviceTokenResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // The iOS webview fires this during login-confirm before the session
    // cookie has fully propagated. Return a retryable failure so the caller
    // re-tries silently rather than throwing into Sentry on a routine race.
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

  // Upsert via the service-role client. The session is already verified above
  // (user is the authenticated caller and user_id is forced to user.id, so a
  // user can never claim a token for someone else). The admin client is needed
  // because `onConflict: 'token'` reassigns a SHARED device's existing token row
  // to the new user — and the row's old owner makes the RLS UPDATE
  // `USING (auth.uid() = user_id)` clause fail ("new row violates row-level
  // security policy for table device_tokens"). Reassigning the device to whoever
  // is currently signed in on it is the intended behaviour.
  const admin = createAdminClient();
  // nosemgrep: helmv3-action-missing-revalidate
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
      { onConflict: 'token' }
    );

  if (error) {
    // Supabase PostgrestError is a plain object, not an Error instance —
    // `String(error)` becomes "[object Object]". Read message directly.
    await logServerError(`Failed to register device token: ${error.message}`, { action: 'push_notifications.registerDeviceToken' });
    return { success: false, error: error.message };
  }

  return { success: true };
}

/** Soft-deactivate a device token for the current user (auth-first). */
// nosemgrep: helmv3-action-missing-revalidate -- device-token registry; no cached page reads this table
export async function unregisterDeviceToken(token: string): Promise<DeviceTokenResult> {
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

  // nosemgrep: helmv3-action-missing-revalidate
  const { error } = await supabase
    .from('device_tokens')
    .update({ active: false })
    .eq('token', parsed.data)
    .eq('user_id', user.id);

  if (error) {
    await logServerError(`Failed to unregister device token: ${error.message}`, { action: 'push_notifications.unregisterDeviceToken' });
    return { success: false, error: error.message };
  }

  return { success: true };
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
