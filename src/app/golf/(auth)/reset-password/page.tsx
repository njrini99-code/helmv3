import { ClubhouseResetPasswordRoute } from '@/clubhouse/routes/auth';

// The page the reset email's button opens: Clubhouse's, over the same token check, updateUser and request-a-new-link
// action. It reads nothing from the request; the link's token is read in the browser.
export default function ResetPasswordPage() {
  return <ClubhouseResetPasswordRoute />;
}
