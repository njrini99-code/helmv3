import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Forgot Password | GolfHelm',
  description: 'Reset your GolfHelm account password by entering your email address.',
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
