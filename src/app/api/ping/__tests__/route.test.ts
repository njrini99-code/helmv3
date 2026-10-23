import { describe, it, expect, vi } from 'vitest';

/**
 * /api/ping is the liveness probe the browser's connectivity hook uses. Its
 * whole contract is that it never waits on Supabase: a ping that does cannot
 * tell a slow database from an offline phone (see the route's header).
 */
const createClient = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/server', () => ({ createClient }));

import { GET, HEAD } from '../route';

describe('/api/ping — liveness only', () => {
  it.each([
    ['GET', GET],
    ['HEAD', HEAD],
  ])('%s answers 204 with no body and no caching', async (_method, handler) => {
    const response = handler();

    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    expect(await response.text()).toBe('');
  });

  it('never opens a Supabase client', () => {
    GET();
    HEAD();

    expect(createClient).not.toHaveBeenCalled();
  });
});
