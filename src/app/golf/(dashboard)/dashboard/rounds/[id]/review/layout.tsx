import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Round Review | GolfHelm',
  description: 'AI-generated analysis of your completed round with insights and recommendations.',
};

export default function RoundReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
