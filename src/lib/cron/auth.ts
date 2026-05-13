import { NextResponse } from 'next/server';

type CronAuthRequest = Pick<Request, 'headers'>;

export function requireCronAuth(request: CronAuthRequest): Response | null {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
