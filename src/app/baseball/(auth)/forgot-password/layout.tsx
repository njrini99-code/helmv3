import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Forgot Password | BaseballHelm',
  description: 'Reset your BaseballHelm account password by entering your email address.',
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
