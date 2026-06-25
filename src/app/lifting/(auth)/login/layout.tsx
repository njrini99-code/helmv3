import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In | Helm Lifting Lab',
  description: 'Sign in to the Helm Lifting Lab to manage your strength & conditioning programs.',
};

export default function LiftingLoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
