import 'server-only';

import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';

/**
 * Password-reset delivery through OUR Resend account, not Supabase's mailer.
 *
 * WHY
 * ---
 * Supabase's built-in email service is rate limited to a couple of messages an
 * hour. Two resets ~7 minutes apart on 2026-08-05 produced: the first logged a
 * `/recover` 200, the second never appeared in the auth log at all, and NEITHER
 * arrived. The UI said "Check your email — we've sent a reset link" both times,
 * because that copy renders regardless of what the mailer did.
 *
 * A coach who mistypes their password the night their team signs up would be
 * told help was on the way, receive nothing, and have no self-serve route back
 * in — with nothing in the incident queue to show a failure, since the request
 * either 200s or vanishes silently.
 *
 * Resend is already the transport for every other email the platform sends, on
 * a verified domain, and — the part that matters most — it writes into
 * `public.emails`, so a reset that fails to deliver becomes VISIBLE instead of
 * silent.
 *
 * HOW
 * ---
 * `generateLink({ type: 'recovery' })` mints the same recovery URL Supabase
 * would have mailed, without sending anything. We then send it ourselves.
 *
 * PRIVACY: callers must keep their existing generic response. This function
 * reports what happened for LOGGING only — never surface the difference between
 * "no such account" and "sent", or the endpoint becomes an account-enumeration
 * oracle.
 */

export type PasswordResetOutcome =
  | 'sent'
  | 'no-account'
  | 'link-failed'
  | 'send-failed'
  | 'unconfigured';

const DEFAULT_FROM = 'Helm Sports <notifications@helmsportslabs.com>';

function body(link: string, appName: string): { text: string; html: string } {
  const text = [
    'Reset your password',
    '',
    `Use the link below to choose a new ${appName} password. It expires in 1 hour.`,
    '',
    link,
    '',
    "If you didn't ask to reset your password, you can ignore this email — nothing has changed.",
  ].join('\n');

  const html = `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1c1917">
<p style="margin:0 0 14px">Reset your password</p>
<p style="margin:0 0 18px">Use the button below to choose a new ${appName} password. It expires in 1 hour.</p>
<p style="margin:0 0 22px"><a href="${link}" style="display:inline-block;background:#0f5132;color:#fff;padding:11px 18px;border-radius:8px;font-weight:700;text-decoration:none">Choose a new password</a></p>
<p style="margin:0 0 14px;color:#57534e;font-size:13px">Or paste this into your browser:<br><span style="word-break:break-all">${link}</span></p>
<p style="margin:0;color:#57534e;font-size:13px">If you didn&rsquo;t ask to reset your password, you can ignore this email — nothing has changed.</p>
</div>`;

  return { text, html };
}

export async function sendPasswordResetEmail(
  email: string,
  redirectTo: string,
  appName = 'GolfHelm',
): Promise<PasswordResetOutcome> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return 'unconfigured';

  let link: string;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });
    // No account for this address is the common, harmless case — the caller
    // still returns its generic "if an account exists" response.
    if (error || !data?.properties?.hashed_token) return 'no-account';

    // Link straight to OUR reset page carrying the hashed token, instead of
    // emailing Supabase's `action_link`.
    //
    // WHY THIS IS THE WHOLE BUG. `action_link` points at Supabase's
    // /auth/v1/verify, which redirects to `redirectTo` in the flow the PROJECT
    // is configured for. This link is minted SERVER-SIDE by the admin API, so
    // the recipient's browser never stored a PKCE `code_verifier` — there is
    // nothing for `exchangeCodeForSession()` to exchange against, and an
    // implicit-flow redirect puts its tokens in the URL FRAGMENT, which the
    // reset page (reading `?code=` / `?token_hash=` from the query string)
    // cannot see either. Both paths land on "This reset link is invalid or has
    // expired", deterministically, for every user.
    //
    // A `token_hash` needs no verifier: the page's existing
    // verifyOtp({ type: 'recovery', token_hash }) branch — already written and
    // already correct — handles it. It simply never received one.
    //
    // Measured, not assumed: sslate@guilford.edu was sent three of these
    // (2026-08-07 x2, 2026-08-09), opened and clicked every one within seconds,
    // and was still locked out. The emails were never the problem.
    const resetUrl = new URL(redirectTo);
    resetUrl.searchParams.set('token_hash', data.properties.hashed_token);
    resetUrl.searchParams.set('type', 'recovery');
    link = resetUrl.toString();
  } catch {
    return 'link-failed';
  }

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: process.env.PASSWORD_RESET_FROM || DEFAULT_FROM,
      to: [email],
      subject: `Reset your ${appName} password`,
      ...body(link, appName),
    });
    if (error) {
      await logServerError(
        `password reset send failed for ${email}: ${error.message ?? 'unknown'}`,
        { action: 'auth.sendPasswordResetEmail', source: 'auth' },
      ).catch(() => {});
      return 'send-failed';
    }
    return 'sent';
  } catch (err) {
    await logServerError(
      `password reset send threw for ${email}: ${err instanceof Error ? err.message : 'unknown'}`,
      { action: 'auth.sendPasswordResetEmail', source: 'auth' },
    ).catch(() => {});
    return 'send-failed';
  }
}
