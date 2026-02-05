'use server';

/**
 * Server action to handle demo request submissions from the landing page.
 * Sends an email notification to admin@helmsportslabs.com
 */

export interface DemoRequestResult {
  success: boolean;
  error?: string;
}

export async function submitDemoRequest(email: string): Promise<DemoRequestResult> {
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Please enter a valid email address' };
  }

  const adminEmail = 'admin@helmsportslabs.com';
  const submittedAt = new Date().toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'long',
  });

  try {
    // Check if Resend is configured
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not configured - demo request email not sent');
      // Still return success so the user sees the confirmation
      // Log to console for debugging
      console.log('Demo Request Received:', { email, submittedAt });
      return { success: true };
    }

    // Dynamically import Resend
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Send notification email to admin
    await resend.emails.send({
      from: 'Helm Sports <notifications@helmsportslabs.com>',
      to: adminEmail,
      subject: `🎯 New Demo Request from ${email}`,
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #059669 0%, #10B981 100%); padding: 30px; border-radius: 16px 16px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">New Demo Request</h1>
          </div>

          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">
              Someone is interested in Helm Sports Labs!
            </p>

            <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 120px;">Email:</td>
                  <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">
                    <a href="mailto:${email}" style="color: #059669; text-decoration: none;">${email}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Submitted:</td>
                  <td style="padding: 8px 0; color: #111827; font-size: 14px;">${submittedAt}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Source:</td>
                  <td style="padding: 8px 0; color: #111827; font-size: 14px;">Landing Page Email Capture</td>
                </tr>
              </table>
            </div>

            <a href="mailto:${email}?subject=Welcome%20to%20Helm%20Sports%20Labs!"
               style="display: inline-block; background: #059669; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">
              Reply to ${email}
            </a>
          </div>

          <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 20px;">
            This notification was automatically sent by Helm Sports Labs
          </p>
        </div>
      `,
      text: `New Demo Request\n\nEmail: ${email}\nSubmitted: ${submittedAt}\nSource: Landing Page Email Capture\n\nReply to this lead at: ${email}`,
    });

    console.log('Demo request email sent to admin for:', email);
    return { success: true };
  } catch (error) {
    console.error('Failed to send demo request email:', error);
    // Return success anyway so user sees confirmation
    // The request was received, just email notification failed
    return { success: true };
  }
}
