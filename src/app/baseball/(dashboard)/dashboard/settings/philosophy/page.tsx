import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { PhilosophySettingsClient } from '@/components/baseball/settings/PhilosophySettingsClient';
import type { BaseballCoachPhilosophy } from '@/lib/types';

export default async function PhilosophySettingsPage() {
  const supabase = await createClient();

  // Single cached auth fetch — coach profile already resolved
  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');

  const coach = session.coach;
  if (!coach) redirect('/baseball/coach');

  // Only college and JUCO coaches have access
  if (coach.coach_type !== 'college' && coach.coach_type !== 'juco') {
    redirect('/baseball/dashboard');
  }

  // Get existing philosophy settings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: philosophy } = await (supabase as any)
    .from('baseball_coach_philosophy')
    .select('*')
    .eq('coach_id', coach.id)
    .single() as { data: BaseballCoachPhilosophy | null };

  // Default values if no philosophy exists
  const defaultPhilosophy: BaseballCoachPhilosophy = {
    id: '',
    coach_id: coach.id,
    alert_sensitivity: 'balanced',
    decline_threshold: 3.0,
    pressure_gap_threshold: 2.0,
    bubble_zone_range: 1.5,
    priority_hitting: 1,
    priority_power: 2,
    priority_plate_discipline: 3,
    priority_speed: 4,
    priority_defense: 5,
    created_at: '',
    updated_at: '',
  };

  return (
    <PhilosophySettingsClient
      coachId={coach.id}
      coachName={coach.full_name || 'Coach'}
      philosophy={philosophy || defaultPhilosophy}
      isNew={!philosophy}
    />
  );
}
