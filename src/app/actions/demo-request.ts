'use server';

import { createClient } from '@/lib/supabase/server';

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

  try {
    const supabase = await createClient();

    // Save to demo_requests table
    const { error } = await supabase.from('demo_requests').insert({
      email,
      interest_type: 'landing_page',
      status: 'new',
    });

    if (error) {
      console.error('Failed to save demo request:', error);
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
    console.error('Failed to save demo request:', error);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
