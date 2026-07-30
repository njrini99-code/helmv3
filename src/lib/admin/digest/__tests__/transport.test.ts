import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(async () => ({ data: { id: 'msg-1' }, error: null })),
}));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.send };
    constructor(public key: string) {}
  },
}));

import { sendOpsDigest, sendOpsAlert, __resetOpsTransportForTests } from '@/lib/admin/digest/transport';

const email = { subject: 's', html: '<p>h</p>', text: 't' };

describe('sendOpsDigest', () => {
  beforeEach(() => {
    __resetOpsTransportForTests();
    mocks.send.mockClear();
    vi.stubEnv('OPS_DIGEST_RESEND_API_KEY', 'ops-key');
    vi.stubEnv('OPS_DIGEST_TO', 'njrini99@gmail.com');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('skips (never throws) when the dedicated secret is absent', async () => {
    vi.stubEnv('OPS_DIGEST_RESEND_API_KEY', '');
    await expect(sendOpsDigest(email)).resolves.toEqual({
      sent: false, skipped: true, reason: 'ops-transport-not-configured',
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('skips when no recipient is configured', async () => {
    vi.stubEnv('OPS_DIGEST_TO', '');
    await expect(sendOpsDigest(email)).resolves.toMatchObject({ skipped: true, reason: 'missing-recipient' });
  });

  it('sends to the configured recipient with the ops from-address', async () => {
    const res = await sendOpsDigest(email);
    expect(res).toMatchObject({ sent: true, messageId: 'msg-1' });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['njrini99@gmail.com'], subject: 's' }),
    );
  });

  /**
   * The briefing goes to more than one inbox (owner, 2026-07-30). Resend needs
   * an ARRAY: handed the raw "a@x.com,b@y.com" string it treats the whole thing
   * as one address and rejects it, so this asserts the split rather than just
   * that something was passed through.
   */
  it('splits a comma-separated OPS_DIGEST_TO into separate recipients', async () => {
    vi.stubEnv('OPS_DIGEST_TO', 'admin@helmsportslabs.com,njrini99@gmail.com');
    await sendOpsDigest(email);
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['admin@helmsportslabs.com', 'njrini99@gmail.com'] }),
    );
  });

  it('tolerates whitespace and a trailing comma in the recipient list', async () => {
    vi.stubEnv('OPS_DIGEST_TO', ' admin@helmsportslabs.com , njrini99@gmail.com ,');
    await sendOpsDigest(email);
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['admin@helmsportslabs.com', 'njrini99@gmail.com'] }),
    );
  });

  it('treats an all-whitespace recipient list as unconfigured', async () => {
    vi.stubEnv('OPS_DIGEST_TO', ' , , ');
    await expect(sendOpsDigest(email)).resolves.toMatchObject({ skipped: true, reason: 'missing-recipient' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('sendOpsAlert sends text-only alerts without an html field', async () => {
    const res = await sendOpsAlert({ subject: 'New demo request', text: 'someone@school.edu' });
    expect(res).toMatchObject({ sent: true, messageId: 'msg-1' });
    const payload = (mocks.send.mock.calls[0] as unknown as unknown[] | undefined)?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(payload).toMatchObject({ subject: 'New demo request', text: 'someone@school.edu' });
    expect(payload).not.toHaveProperty('html');
  });

  it('sendOpsAlert skips with the same fail-soft contract when unconfigured', async () => {
    vi.stubEnv('OPS_DIGEST_RESEND_API_KEY', '');
    await expect(sendOpsAlert({ subject: 's', text: 't' })).resolves.toMatchObject({
      skipped: true, reason: 'ops-transport-not-configured',
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
