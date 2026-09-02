import { describe, it, expect, vi, afterEach } from 'vitest';
import { vercelWaitUntil, __setVercelRequestContextForTests } from '@/lib/observability/vercel-wait-until';

describe('vercelWaitUntil', () => {
  afterEach(() => __setVercelRequestContextForTests(null));

  it('registers the task with the platform when a request context exposes waitUntil', () => {
    const waitUntil = vi.fn();
    __setVercelRequestContextForTests({ waitUntil });
    const task = Promise.resolve();

    expect(vercelWaitUntil(task)).toBe(true);
    expect(waitUntil).toHaveBeenCalledWith(task);
  });

  it('reports false, and never throws, outside Vercel', () => {
    expect(vercelWaitUntil(Promise.resolve())).toBe(false);
    __setVercelRequestContextForTests({});
    expect(vercelWaitUntil(Promise.resolve())).toBe(false);
  });
});
