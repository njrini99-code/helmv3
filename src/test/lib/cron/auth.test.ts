import { afterEach, describe, expect, it } from 'vitest';
import { requireCronAuth } from '@/lib/cron/auth';

describe('requireCronAuth', () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('rejects when CRON_SECRET is missing', async () => {
    const res = requireCronAuth(new Request('http://x/cron'));

    expect(res?.status).toBe(401);
    await expect(res?.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('rejects x-vercel-cron without the bearer secret', async () => {
    process.env.CRON_SECRET = 'secret';

    const res = requireCronAuth(
      new Request('http://x/cron', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );

    expect(res?.status).toBe(401);
  });

  it('accepts the configured bearer token', () => {
    process.env.CRON_SECRET = 'secret';

    const res = requireCronAuth(
      new Request('http://x/cron', {
        headers: { authorization: 'Bearer secret' },
      }),
    );

    expect(res).toBeNull();
  });
});
