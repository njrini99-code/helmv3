import { ClubhouseSignInRoute } from '@/clubhouse/routes/auth';

// Clubhouse's sign in, over loginAction. It reads nothing from the request, so the segment stays static and a tap on
// Log in paints no loading boundary (src/clubhouse/routes/auth.tsx).
export default function LoginPage() {
  return <ClubhouseSignInRoute />;
}
