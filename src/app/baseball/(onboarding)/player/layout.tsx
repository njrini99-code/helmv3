import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Player Onboarding | Helm Sports',
  description: 'Complete your player profile to start connecting with college baseball coaches and showcase your skills.',
  manifest: '/baseball-manifest.webmanifest',
};

export default function PlayerOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
