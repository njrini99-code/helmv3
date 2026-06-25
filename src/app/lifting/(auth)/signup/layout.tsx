import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up | Helm Lifting Lab',
  description: 'Create your Helm Lifting Lab account to start building strength & conditioning programs.',
};

export default function LiftingSignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
