import { NextResponse } from 'next/server';
import { registerDeviceTokenForUser } from '@/lib/golf/device-token.server';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: string;
    platform?: 'ios' | 'android' | 'web';
    deviceName?: string;
  } | null;

  if (!body?.token || !body.platform) {
    return NextResponse.json(
      { success: false, error: 'token and platform are required' },
      { status: 400 },
    );
  }

  const result = await registerDeviceTokenForUser(body.token, body.platform, body.deviceName);
  const status = result.success ? 200 : result.retryable ? 401 : 400;
  return NextResponse.json(result, { status });
}
