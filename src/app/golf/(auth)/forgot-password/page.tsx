import { ClubhouseSignedInResetRoute } from '@/clubhouse/routes/auth';

// The layout has already sent a signed-out visitor to the sign-in panel's reset form (/golf/login?view=forgot), so
// whoever reaches this page is signed in: Clubhouse's reset form, in the sign-in room, with their address filled in.
export default function ForgotPasswordPage() {
  return <ClubhouseSignedInResetRoute />;
}
