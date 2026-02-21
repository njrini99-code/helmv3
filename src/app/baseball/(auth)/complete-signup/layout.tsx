import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Complete Signup | BaseballHelm',
  description: 'Complete your BaseballHelm account setup by choosing your role.',
};

export default function CompleteSignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
