import { isClubhouseFrontDoor } from '@/clubhouse/gate';
import { GateLoading } from '@/clubhouse/screens/auth/GateLoading';
import { GenericPageSkeleton } from '@/components/ui/skeleton';

/**
 * Route Suspense fallback for /golf/coach.
 *
 * page.tsx is 'use client' and initializes `authLoading` to `true`
 * (page.tsx:72), resolving it only inside the auth-check effect
 * (page.tsx:232). So both the SSR HTML and the first client paint are its
 * own `if (authLoading) return <PageLoading />` branch (page.tsx:312) —
 * never the onboarding wizard shell (logo, step indicator, title, form
 * card) that renders once auth resolves. `PageLoading` renders
 * `GenericPageSkeleton` and nothing else (ui/loading.tsx:16-18;
 * ui/skeleton.tsx:1269), the legacy skeleton that is correct to use in
 * (onboarding)/**. This fallback renders that same component, so the route
 * boundary hands off to the page's own loading branch with no repaint.
 */
export default function Loading() {
  // golf_clubhouse_front_door: the same loading boundary, drawn in the sign-in room (as the Clubhouse page draws it while it checks).
  if (isClubhouseFrontDoor()) return <GateLoading label="Setting up your program" title="Set up your program" line="Checking your account…" />;
  return <GenericPageSkeleton />;
}
