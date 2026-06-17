import 'server-only';
import { validate } from 'deep-email-validator';

// ============================================================================
// EMAIL DELIVERABILITY VERIFICATION (anti-bounce)
// ============================================================================
//
// Bounces are one of the strongest spam signals for a warming domain, so we
// verify an address is actually deliverable BEFORE sending cold mail to it.
//
// We deliberately do NOT do an SMTP mailbox probe (validateSMTP: false):
//   • .edu / Gmail / most modern servers don't answer SMTP VRFY/RCPT honestly,
//     so it's unreliable, AND
//   • connecting out to recipients' mail servers from our IP to "test" mailboxes
//     is itself a reputation risk.
// What IS reliable + free: syntax (regex), MX-record presence (the domain can
// receive mail at all), and disposable-domain detection. That catches the dead
// addresses that cause bounces without any of the SMTP downsides.
//
// crm_coaches.email_status defaults to 'valid' for EVERY row, so "valid" is not
// a verification signal on its own — callers should verify at send time and
// persist a failure (-> 'unknown', which the send gate skips) so a bad address
// is only ever attempted once.
// ============================================================================

export interface EmailDeliverability {
  deliverable: boolean;
  // 'ok' | 'regex' | 'mx' | 'disposable' | 'verify_error'
  reason: string;
}

export async function verifyEmailDeliverability(email: string): Promise<EmailDeliverability> {
  try {
    const r = await validate({
      email,
      validateRegex: true,
      validateMx: true,
      validateTypo: false,      // typo "suggestions" cause false rejections
      validateDisposable: true,
      validateSMTP: false,      // see header — unreliable + reputation risk
    });
    if (r.valid) return { deliverable: true, reason: 'ok' };
    return { deliverable: false, reason: r.reason ?? 'invalid' };
  } catch {
    // Verifier threw (e.g. transient DNS failure). FAIL OPEN — never suppress a
    // real coach over a transient lookup error; a genuinely dead address will be
    // caught on a later attempt (or by a real bounce webhook).
    return { deliverable: true, reason: 'verify_error' };
  }
}
