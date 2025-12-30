import { redirect } from 'next/navigation';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Coach Onboarding | Helm Sports',
  description: 'Complete your coaching profile setup to start connecting with talented baseball players.',
};

// Redirect to new cinematic onboarding flow
export default function LegacyCoachOnboarding() {
  redirect('/baseball/coach-onboarding');
}
