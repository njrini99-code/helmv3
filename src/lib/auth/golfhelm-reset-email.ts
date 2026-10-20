import 'server-only';

/**
 * The GolfHelm password reset email (Forest design, owner-approved 2026-10-18).
 *
 * GolfHelm resets are sent through our Resend account by
 * `sendPasswordResetEmail` (src/lib/auth/send-password-reset.ts), not by
 * Supabase's mailer, so `supabase/templates/recovery.html` never reaches a golf
 * user. This module renders the same design for that path. Keep the two in
 * step: the Supabase template is still what Baseball and Lift Lab client-side
 * resets receive.
 *
 * Every interpolated value is HTML-escaped. The link is ours (reset page +
 * token_hash), but the first name comes from user_metadata, which the user
 * controls.
 */

export interface GolfHelmResetEmailInput {
  link: string;
  email: string;
  firstName?: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A first name worth greeting by: trimmed, single-line, and not absurdly long. */
function cleanFirstName(firstName: string | null | undefined): string | null {
  const name = firstName?.replace(/\s+/g, ' ').trim();
  if (!name || name.length > 40) return null;
  return name;
}

export function renderGolfHelmResetEmail({ link, email, firstName }: GolfHelmResetEmailInput): RenderedEmail {
  const name = cleanFirstName(firstName);
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
  const safeEmail = escapeHtml(email);
  const safeLink = escapeHtml(link);

  const text = [
    name ? `Hi ${name},` : 'Hi,',
    '',
    `Use the link below to choose a new password for ${email}. The link expires in 1 hour.`,
    '',
    link,
    '',
    "If you didn't ask for this, you can safely ignore this email. Your password won't change.",
    '',
    'The GolfHelm team',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Reset your GolfHelm password</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <!-- Poppins loads in Apple Mail, iOS Mail and other clients that allow web fonts; Gmail and Outlook use the fallback stack. -->
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
  <!--[if mso]><style>td, p, h1, a, span { font-family: 'Segoe UI', Arial, sans-serif !important; }</style><![endif]-->
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a { text-decoration: none; }
    @media only screen and (max-width: 620px) {
      .outer { padding: 28px 12px 36px 12px !important; }
      .col { width: 100% !important; }
      .card { padding: 36px 24px 36px 24px !important; }
      .h1 { font-size: 26px !important; }
      .btn-table { width: 100% !important; }
      .btn-cell { width: 100% !important; }
    }
    @media (prefers-color-scheme: dark) {
      .bg-page { background-color: #121210 !important; }
      .bg-card { background-color: #1C1B18 !important; border-top-color: #6BBB8C !important; border-bottom-color: #24412F !important; }
      .t-ink { color: #EDE7D8 !important; }
      .t-sub { color: #C7C0AF !important; }
      .t-mute { color: #8F8A7E !important; }
      .t-brand { color: #6BBB8C !important; }
      .t-link { color: #6BBB8C !important; }
      .btn-link { background-color: #6BBB8C !important; color: #082B1C !important; }
    }
    [data-ogsc] .t-ink { color: #EDE7D8 !important; }
    [data-ogsc] .t-sub { color: #C7C0AF !important; }
    [data-ogsc] .t-mute { color: #8F8A7E !important; }
    [data-ogsc] .t-brand { color: #6BBB8C !important; }
    [data-ogsb] .bg-page { background-color: #121210 !important; }
    [data-ogsb] .bg-card { background-color: #1C1B18 !important; }
  </style>
</head>
<body class="bg-page" style="margin:0; padding:0; background-color:#ECE9DF;">
  <!-- Preheader (hidden) -->
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">
    Choose a new password. The link expires in 1 hour.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" class="bg-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ECE9DF" style="background-color:#ECE9DF;">
    <tr>
      <td class="outer" align="center" style="padding:44px 16px 56px 16px;">
        <table role="presentation" class="col" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px;">

          <!-- Lockup, as on the sign-in screen -->
          <tr>
            <td align="center" style="padding:0 0 28px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="padding-right:9px;">
                    <img src="https://helmsportslabs.com/helm-golf-logo-transparent.png" width="34" height="28" alt="" style="display:block; border:0; outline:none;">
                  </td>
                  <td valign="middle" style="font-family:Poppins,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:22px; font-weight:600; letter-spacing:-0.026em; line-height:1;">
                    <span class="t-ink" style="color:#1C1B18;">Golf</span><span class="t-brand" style="color:#1F7A4A;">Helm</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card: a rule on top, a lighter one underneath -->
          <tr>
            <td class="card bg-card" bgcolor="#FFFFFF" style="background-color:#FFFFFF; border-top:3px solid #155A39; border-bottom:3px solid #BCD6C4; padding:48px 52px 44px 52px;">

              <h1 class="h1 t-ink" style="margin:0 0 28px 0; font-family:Poppins,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:34px; line-height:1.15; font-weight:600; letter-spacing:-0.01em; color:#1C1B18;">Reset your password</h1>

              <p class="t-ink" style="margin:0 0 14px 0; font-family:Poppins,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:18px; line-height:1.5; color:#1C1B18;">${greeting}</p>
              <p class="t-sub" style="margin:0 0 14px 0; font-family:Poppins,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:17px; line-height:1.6; color:#46433D;">
                Tap the button below to choose a new password for <span class="t-ink" style="color:#1C1B18;">${safeEmail}</span>. The link expires in 1&nbsp;hour.
              </p>
              <p class="t-sub" style="margin:0; font-family:Poppins,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:17px; line-height:1.6; color:#46433D;">
                If you didn&rsquo;t ask for this, you can safely ignore this email. Your password won&rsquo;t change.
              </p>

              <!-- Button -->
              <table role="presentation" class="btn-table" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:34px auto 0 auto;">
                <tr>
                  <td class="btn-cell" align="center" width="320" style="width:320px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeLink}" style="height:52px;v-text-anchor:middle;width:320px;" arcsize="15%" strokecolor="#155A39" fillcolor="#155A39">
                    <w:anchorlock/>
                    <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Reset password</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <a class="btn-link" href="${safeLink}" target="_blank" style="display:block; padding:16px 24px; font-family:Poppins,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:16px; font-weight:600; line-height:1.2; color:#FFFFFF; background-color:#155A39; border-radius:8px; text-align:center; text-decoration:none;">Reset password</a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>

              <p class="t-sub" style="margin:36px 0 6px 0; font-family:Poppins,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:14px; line-height:1.6; color:#46433D;">
                If the button doesn&rsquo;t work, copy and paste this link into your browser:
              </p>
              <p style="margin:0; font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace; font-size:12px; line-height:1.6; word-break:break-all;">
                <a class="t-link" href="${safeLink}" target="_blank" style="color:#155A39; text-decoration:underline;">${safeLink}</a>
              </p>

              <p class="t-ink" style="margin:32px 0 0 0; font-family:Poppins,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.5; font-weight:600; color:#1C1B18;">The GolfHelm team</p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:22px 0 0 0;">
              <p class="t-mute" style="margin:0; font-family:Poppins,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:12px; line-height:1.5; color:#6F6B60;">
                Helm Sports Labs
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: 'Reset your GolfHelm password', html, text };
}
