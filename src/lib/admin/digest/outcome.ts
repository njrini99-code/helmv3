import type { SendOpsDigestResult } from './transport';

export type DigestRunOutcome = {
  sent: boolean;
  skipped: boolean;
  reason?: string;
  messageId?: string;
  recipients: string;
};

/**
 * The admin-digest run's outcome as top-level scalars, so `recordJobRun`
 * keeps all of it on the `background_job_logs` heartbeat: which message went
 * to which addresses (the 2026-08-04 "it never arrived" question) without a
 * success line landing in the Bridge's error feed (b07625a4).
 */
export const digestRunOutcome = (result: SendOpsDigestResult): DigestRunOutcome => ({
  sent: result.sent,
  skipped: result.skipped,
  ...(result.reason ? { reason: result.reason } : {}),
  ...(result.messageId ? { messageId: result.messageId } : {}),
  recipients: result.recipients?.length ? result.recipients.join(', ') : '(none configured)',
});
