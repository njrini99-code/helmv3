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

    const { error } = await supabase.from('demo_requests').insert({
      email,
      interest_type: 'landing_page',
    });

    if (error) {
      console.error('Failed to save demo request:', error);
      return { success: false, error: 'Something went wrong. Please try again.' };
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to save demo request:', error);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
