import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In | BaseballHelm',
  description: 'Sign in to your BaseballHelm account to access your team dashboard.',
  manifest: '/baseball-manifest.webmanifest',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
