import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password | Helm Lifting Lab',
  description: 'Reset your Helm Lifting Lab account password.',
};

export default function LiftingForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
