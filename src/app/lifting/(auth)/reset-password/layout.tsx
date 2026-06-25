import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Set New Password | Helm Lifting Lab',
  description: 'Set a new password for your Helm Lifting Lab account.',
};

export default function LiftingResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
