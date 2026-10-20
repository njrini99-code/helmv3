import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import { isClubhouseFrontDoor } from '@/clubhouse/gate';
import { ClubhouseResetPasswordRoute } from '@/clubhouse/routes/auth';

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
  // golf_clubhouse_front_door chooses the page that is drawn: flag off renders today's page (`children`) untouched; flag
  // on renders Clubhouse's, over the same token check, updateUser and request-a-new-link action.
  if (isClubhouseFrontDoor()) return <ClubhouseResetPasswordRoute />;
  return <div className={poppins.variable}>{children}</div>;
}
