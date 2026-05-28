'use server';

import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';

// SEMGREP-ALLOW: device-token registry is read directly by the push worker, not cached pages
export async function registerDeviceToken(
  token: string,
  platform: 'ios' | 'android' | 'web',
  deviceName?: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Upsert: if token already exists, update it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('device_tokens')
    .upsert(
      {
        user_id: user.id,
        token,
        platform,
        device_name: deviceName || null,
        active: true,
        failed_count: 0,
      },
      { onConflict: 'token' }
    );

  if (error) {
    await logServerError(`Failed to register device token: ${error instanceof Error ? error.message : String(error)}`, { action: 'push_notifications.registerDeviceToken' });
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function unregisterDeviceToken(token: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('device_tokens')
    .update({ active: false })
    .eq('token', token)
    .eq('user_id', user.id);

  if (error) {
    await logServerError(`Failed to unregister device token: ${error instanceof Error ? error.message : String(error)}`, { action: 'push_notifications.unregisterDeviceToken' });
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function getDeviceTokens() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('device_tokens')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (error) {
    await logServerError(`Failed to get device tokens: ${error instanceof Error ? error.message : String(error)}`, { action: 'push_notifications.getDeviceTokens' });
    return { success: false, data: [], error: error.message };
  }

  return { success: true, data: data || [] };
}
