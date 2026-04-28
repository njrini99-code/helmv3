'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';

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

export async function submitDemoRequest(email: string): Promise<DemoRequestResult> {
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Please enter a valid email address' };
  }

  const requestContext = await captureRequestContext();

  try {
    const supabase = await createClient();

    // Save to demo_requests table.
    // interest_type CHECK allows: baseball_coach | baseball_player | golf_coach
    //   | golf_player | organization | other → use 'other' for landing-page leads.
    // status CHECK allows: pending | contacted | scheduled | completed | declined.
    const { error } = await supabase.from('demo_requests').insert({
      email,
      interest_type: 'other',
      status: 'pending',
      notes: 'Submitted from landing page',
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

    // Also create a CRM coach entry so admin can follow up from the CRM
    // Skip if a coach with this email already exists
    const { data: existing } = await supabase
      .from('crm_coaches')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (!existing) {
      await supabase.from('crm_coaches').insert({
        name: email.split('@')[0] || 'Unknown',
        email,
        school: email.split('@')[1]?.split('.')[0] || 'Unknown',
        conference: 'Unknown',
        division: 'D3',
        program: 'both',
        status: 'new_lead',
        source: 'website',
        notes: 'Submitted demo request from landing page',
      });
    }

    return { success: true };
  } catch (error) {
    await logServerError(
      `Failed to save demo request: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
      { action: 'demo_request.submitDemoRequest', metadata: { email, ...requestContext } },
    );
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
