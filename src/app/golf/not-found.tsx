/**
 * Golf 404 outside the dashboard shell (STATE-X1): `notFound()` from golf
 * admin, join or onboarding segments. These render outside the Clubhouse root,
 * where Clubhouse styles do not apply, so they show the platform's one 404
 * (src/app/not-found.tsx), which reads the /golf path and promotes GolfHelm.
 * Its second, Fairway-built design is gone (GAP-M-02). Dashboard routes keep
 * their own in-shell page (dashboard/not-found.tsx, ClubhouseNotFound).
 */
export { default, metadata } from '../not-found';
