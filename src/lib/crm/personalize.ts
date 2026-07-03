'use client';

import { createClient } from '@/lib/supabase/client';

interface CoachData {
  name: string;
  school: string;
  conference: string;
  division?: string;
  program?: string;
  team_size?: number;
  current_software?: string;
  pain_points?: string[];
  notes?: string;
  tags?: string[];
  decision_timeline?: string;
}

interface PersonalizeResult {
  subject: string;
  body: string;
}

export async function personalizeEmail(
  template: string,
  subject: string,
  coachData: CoachData
): Promise<PersonalizeResult> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const response = await fetch(`${supabaseUrl}/functions/v1/personalize-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      template,
      subject,
      coachData,
      senderName: 'Rick Nini',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Personalization failed: ${error}`);
  }

  return response.json();
}


