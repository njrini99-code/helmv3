import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Coaching Intelligence | GolfHelm',
  description: 'Configure your coaching philosophy, alert thresholds, and AI insight preferences.',
};

export default function CoachingIntelligenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
