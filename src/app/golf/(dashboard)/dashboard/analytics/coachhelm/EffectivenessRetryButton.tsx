'use client';

/**
 * EffectivenessRetryButton — the client recovery control for the SSR
 * loader-failure InlineNotice on the CoachHelm Effectiveness page.
 *
 * The page is a server component, so its handled-error path (a failed
 * Promise.all loader) cannot wire an onClick itself. This thin client button
 * re-runs the server render via router.refresh(), giving the error state a real
 * "Try again" recovery instead of telling the user to manually reload the tab
 * (premium-scrub hard-gate B3: every error state must offer retry).
 *
 * Fairway-native: the design-system Button + tokens; no legacy ui/* control.
 */

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/fairway';

export function EffectivenessRetryButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      size="sm"
      busy={pending}
      leftIcon={<RotateCw className="h-4 w-4" aria-hidden />}
      onClick={() => startTransition(() => router.refresh())}
    >
      Try again
    </Button>
  );
}
