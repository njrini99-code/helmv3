import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Welcome | Helm Lifting Lab',
  description: 'Set up your Helm Lifting Lab coaching profile.',
};

export default function LiftingCoachOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
