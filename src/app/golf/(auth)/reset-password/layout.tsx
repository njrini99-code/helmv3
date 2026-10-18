import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';

export const metadata: Metadata = {
  title: 'Reset Password',
  description: 'Set a new password for your GolfHelm account.',
};

/*
 * Poppins is loaded for this page only. It is the reset email's face, and the
 * page is designed to read as the next step of that email (owner-approved
 * 2026-10-18). The rest of GolfHelm keeps the SF system stack and ships no web
 * font: a next/font call here is scoped to this route's bundle.
 */
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-reset-poppins',
  display: 'swap',
});

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={poppins.variable}>{children}</div>;
}
