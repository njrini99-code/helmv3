'use server';

import { createClient } from '@/lib/supabase/server';

export interface DemoRequestInput {
  email: string;
  name?: string;
  organization?: string;
  product?: 'baseball' | 'golf' | 'both';
  message?: string;
}

export async function submitDemoRequest(input: DemoRequestInput) {
  try {
    // Validate email
    if (!input.email || !input.email.includes('@')) {
      return { success: false, error: 'Please provide a valid email address' };
    }

    const supabase = await createClient();

    // Insert demo request into database
    const { error } = await supabase
      .from('demo_requests')
      .insert({
        email: input.email,
        name: input.name || null,
        organization: input.organization || null,
        product: input.product || 'both',
        message: input.message || null,
        status: 'pending',
      });

    if (error) {
      console.error('Demo request error:', error);
      return { success: false, error: 'Failed to submit request. Please try again.' };
    }

    return { success: true };
  } catch (error) {
    console.error('Demo request error:', error);
    return { success: false, error: 'An unexpected error occurred. Please try again.' };
  }
}
