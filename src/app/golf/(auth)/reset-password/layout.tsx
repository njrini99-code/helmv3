import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password | GolfHelm',
  description: 'Set a new password for your GolfHelm account.',
};

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
