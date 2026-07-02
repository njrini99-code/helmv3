import { describe, it, expect, vi, beforeEach } from 'vitest';

// Typed with a variadic rest param (not `()`) so `.mock.calls[0]` below is
// `unknown[]` and destructurable — `vi.fn(async () => {})` infers a
// zero-arity tuple and TS rejects indexing it.
const mocks = vi.hoisted(() => ({ logServerEvent: vi.fn(async (..._args: unknown[]) => {}) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerEvent: mocks.logServerEvent }));

import { POST } from '@/app/api/internal/log-auth-failure/route';

function req(body: unknown, key?: string) {
  return new Request('http://localhost/api/internal/log-auth-failure', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-internal-log-key': key } : {}) },
    body: JSON.stringify(body),
  });
}

describe('POST /api/internal/log-auth-failure', () => {
  beforeEach(() => {
    vi.stubEnv('INTERNAL_LOG_KEY', 'secret-key');
    mocks.logServerEvent.mockClear();
  });

  it('rejects a missing/wrong key', async () => {
    const res = await POST(req({ message: 'x' }, 'wrong') as never);
    expect(res.status).toBe(401);
    expect(mocks.logServerEvent).not.toHaveBeenCalled();
  });

  it('accepts and logs with source=auth', async () => {
    const res = await POST(req({ message: 'updateSession failed: boom', pathname: '/golf/dashboard' }, 'secret-key') as never);
    expect(res.status).toBe(204);
    const [message, ctx, severity] = mocks.logServerEvent.mock.calls[0]!;
    expect(message).toContain('updateSession failed');
    expect(ctx).toMatchObject({ source: 'auth', route: '/golf/dashboard' });
    expect(severity).toBe('warning');
  });

  it('caps the message size (no 10MB payloads into admin_events)', async () => {
    await POST(req({ message: 'x'.repeat(20000) }, 'secret-key') as never);
    const [message] = mocks.logServerEvent.mock.calls[0]!;
    expect((message as string).length).toBeLessThanOrEqual(2000);
  });
});
