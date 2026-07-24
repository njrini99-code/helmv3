'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { sendOpsAlert } from '@/lib/admin/digest/transport';

async function captureRequestContext() {
  const h = await headers();
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null,
    userAgent: h.get('user-agent') ?? null,
    referer: h.get('referer') ?? null,
    country: h.get('x-vercel-ip-country') ?? null,
    city: h.get('x-vercel-ip-city') ?? null,
  };
}

/**
 * Server action to handle demo request submissions from the landing page.
 * Saves the email to the demo_requests table.
 */

export interface DemoRequestResult {
  success: boolean;
  error?: string;
}

export interface DemoRequestDetails {
  /** Requester's name, from the landing modal. */
  name?: string;
  /** Program / school, from the landing modal. */
  school?: string;
  /** Which marketing surface captured the lead (defaults to 'landing'). */
  source?: 'landing' | 'pricing';
}

export async function submitDemoRequest(
  email: string,
  details?: DemoRequestDetails,
): Promise<DemoRequestResult> {
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Please enter a valid email address' };
  }

  // Cap free-text lengths — these flow into CRM rows and the ops alert.
  const name = details?.name?.trim().slice(0, 120) || undefined;
  const school = details?.school?.trim().slice(0, 160) || undefined;
  const source = details?.source ?? 'landing';

  const requestContext = await captureRequestContext();

  try {
    const supabase = await createClient();

    // Save to demo_requests table.
    // interest_type CHECK allows: baseball_coach | baseball_player | golf_coach
    //   | golf_player | organization | other → use 'other' for landing-page leads.
    // status CHECK allows: pending | contacted | scheduled | completed | declined.
    // nosemgrep: coderabbit.semgrep.helmv3-server-action-missing-auth-check -- public landing-page capture form; callers are anonymous by design, RLS allows anon INSERT only
    const { error } = await supabase.from('demo_requests').insert({
      email,
      interest_type: 'other',
      status: 'pending',
      notes: [
        `Submitted from ${source} page`,
        name ? `Name: ${name}` : null,
        school ? `Program: ${school}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    });

    if (error) {
      // Supabase PostgrestError is a plain object — String(err) yields "[object Object]".
      // Stringify the whole shape so code/details/hint actually reach the log.
      await logServerError(
        `Failed to save demo request: ${JSON.stringify(error)}`,
        {
          action: 'demo_request.submitDemoRequest',
          errorCode: error.code,
          errorHint: error.hint,
          errorDetails: error.details,
          metadata: { email, ...requestContext },
        },
      );
      return { success: false, error: 'Something went wrong. Please try again.' };
    }

    // Also create a CRM coach entry so admin can follow up from the CRM.
    // Landing-page visitors are anonymous and crm_coaches RLS is admin-only,
    // so the lookup + insert must run as service role — under the visitor
    // session both silently RLS-fail and no lead row is ever created.
    try {
      const admin = createAdminClient();
      // nosemgrep: coderabbit.semgrep.helmv3-server-action-missing-auth-check -- anonymous public action; service-role scope is limited to this fixed-shape crm_coaches lead upsert
      const { data: existing, error: lookupError } = await admin
        .from('crm_coaches')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (lookupError) {
        await logServerError(
          `Demo request saved but CRM coach lookup failed: ${JSON.stringify(lookupError)}`,
          { action: 'demo_request.createCrmCoach', errorCode: lookupError.code, metadata: { email } },
        );
      } else if (!existing) {
        // nosemgrep: coderabbit.semgrep.helmv3-server-action-missing-auth-check -- see above; values are derived server-side from the validated email only
        const { error: coachError } = await admin.from('crm_coaches').insert({
          name: name || email.split('@')[0] || 'Unknown',
          email,
          school: school || email.split('@')[1]?.split('.')[0] || 'Unknown',
          conference: 'Unknown',
          division: 'D3',
          program: 'both',
          status: 'new_lead',
          source: 'website',
          notes: 'Submitted demo request from landing page',
        });
        if (coachError) {
          await logServerError(
            `Demo request saved but CRM coach creation failed: ${JSON.stringify(coachError)}`,
            { action: 'demo_request.createCrmCoach', errorCode: coachError.code, metadata: { email } },
          );
        }
      }
    } catch (coachError) {
      // The lead itself is already safe in demo_requests — never fail the
      // visitor flow over the CRM convenience row.
      await logServerError(
        `Demo request saved but CRM coach creation threw: ${coachError instanceof Error ? coachError.message : JSON.stringify(coachError)}`,
        { action: 'demo_request.createCrmCoach', metadata: { email } },
      );
    }

    // A hot lead shouldn't wait for someone to open the CRM tab — alert ops
    // immediately. Production-only (preview submissions are test noise);
    // sendOpsAlert is fail-soft and unconfigured environments just skip.
    if (process.env.VERCEL_ENV === 'production') {
      try {
        await sendOpsAlert({
          subject: `New demo request — ${school ? `${school} (${email})` : email}`,
          text: [
            `${name ? `${name} <${email}>` : email} just requested a demo from the ${source} page.`,
            school ? `Program: ${school}` : null,
            requestContext.country
              ? `From: ${[requestContext.city, requestContext.country].filter(Boolean).join(', ')}`
              : null,
            '',
            'Inbound leads: https://helmsportslabs.com/golf/admin/crm',
          ]
            .filter((line): line is string => line !== null)
            .join('\n'),
        });
      } catch {
        // Alerting must never break the signup flow.
      }
    }

    // Refresh admin CRM lead lists so a new submission appears immediately.
    revalidatePath('/golf/admin');
    revalidatePath('/baseball/admin');

    return { success: true };
  } catch (error) {
    await logServerError(
      `Failed to save demo request: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
      { action: 'demo_request.submitDemoRequest', metadata: { email, ...requestContext } },
    );
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
