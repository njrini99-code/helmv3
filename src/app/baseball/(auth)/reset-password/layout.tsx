import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password | BaseballHelm',
  description: 'Set a new password for your BaseballHelm account.',
};

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
