import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up | GolfHelm',
  description: 'Create your GolfHelm account to join your team and start tracking performance.',
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
