import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In | GolfHelm',
  description: 'Sign in to your GolfHelm account to access your team dashboard.',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
