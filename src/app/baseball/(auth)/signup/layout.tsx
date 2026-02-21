import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up | BaseballHelm',
  description: 'Create your BaseballHelm account to join your team and start managing your program.',
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
