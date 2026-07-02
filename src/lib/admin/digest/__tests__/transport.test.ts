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

import { sendOpsDigest, __resetOpsTransportForTests } from '@/lib/admin/digest/transport';

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
      expect.objectContaining({ to: 'njrini99@gmail.com', subject: 's' }),
    );
  });
});
