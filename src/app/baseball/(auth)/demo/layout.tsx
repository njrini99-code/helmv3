import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Live Demo | BaseballHelm',
  description:
    'Step inside a fully-populated BaseballHelm program — live roster, practice plans, and CoachHelm AI insights. No signup, no credit card.',
  manifest: '/baseball-manifest.webmanifest',
};

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
