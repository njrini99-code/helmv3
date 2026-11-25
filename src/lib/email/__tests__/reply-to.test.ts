import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every email a coach or player can reply to names a reply-to with a real inbox (owner, 2026-11-25): the automated
 * senders (notifications@, noreply@) have no mailbox. The ops digest goes to the owner and is exempt.
 */
const SENDERS = [
  'src/lib/auth/send-password-reset.ts',
  'src/lib/coachhelm/v3/foundation/email.ts',
  'src/lib/golf/player-invite-email.ts',
  'src/lib/lifting/invite-email.ts',
  'src/lib/notifications/email.ts',
];

describe('Helm emails reply to a real inbox', () => {
  it('defaults to admin@helmsportslabs.com', async () => {
    const { HELM_REPLY_TO } = await import('../reply-to');
    expect(HELM_REPLY_TO).toBe(process.env.HELM_REPLY_TO || 'admin@helmsportslabs.com');
  });

  it.each(SENDERS)('%s passes replyTo on every send', (file) => {
    const src = readFileSync(join(process.cwd(), file), 'utf8');
    const sends = src.match(/emails\.send\(/g) ?? [];
    expect(sends.length).toBeGreaterThan(0);
    expect((src.match(/replyTo: HELM_REPLY_TO/g) ?? []).length).toBe(sends.length);
  });
});
