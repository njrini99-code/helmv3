'use server';

import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { z } from 'zod';

// Device-token payloads arrive from the iOS Capacitor bridge as raw
// strings — validate before they reach the database.
const registerDeviceTokenSchema = z.object({
  token: z.string().min(1, 'token is required').max(512),
  platform: z.enum(['ios', 'android', 'web']),
  deviceName: z.string().max(256).optional(),
});

const deviceTokenSchema = z.string().min(1, 'token is required').max(512);

/**
 * Result shape for device-token mutations.
 *
 * `UNAUTHORIZED_RETRYABLE` is returned (not thrown) when the iOS webview
 * fires registration before the Supabase session cookie has propagated.
 * The caller retries silently instead of surfacing a noisy Sentry error.
 */
type DeviceTokenResult =
  | { success: true }
  | {
      success: false;
      error: string;
      code?: 'UNAUTHORIZED_RETRYABLE';
      retryable?: boolean;
    };

/**
 * Register (or refresh) an APNs/FCM device token for the current user.
 * Auth-first per server-action convention; on a missing session it returns
 * a retryable result rather than throwing so the iOS login-confirm cookie
 * race can be retried silently by the caller.
 */
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

  // SECURITY DEFINER RPC handles the iPhone-changes-hands case (same APNs
  // token previously registered to a different user) — direct upsert on the
  // table would trip the device_tokens UPDATE policy. See migration
  // 20260604040000_device_tokens_allow_user_takeover.sql.
  const { error } = await supabase.rpc('claim_device_token', {
    p_token: parsed.data.token,
    p_platform: parsed.data.platform,
    p_device_name: parsed.data.deviceName ?? null,
  });

  if (error) {
    // Supabase PostgrestError is a plain object, not an Error instance —
    // `String(error)` becomes "[object Object]". Read message directly.
    await logServerError(`Failed to register device token: ${error.message}`, { action: 'push_notifications.registerDeviceToken' });
    return { success: false, error: error.message };
  }

  return { success: true };
}

/** Soft-deactivate a device token for the current user (auth-first). */
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
