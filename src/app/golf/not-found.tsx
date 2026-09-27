import Link from 'next/link';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { Button } from '@/components/fairway/controls/button';

/**
 * Golf 404 outside the dashboard shell (STATE-X1): `notFound()` from golf
 * admin, join or onboarding segments. Without it those fall through to the
 * cross-product root not-found, which offers a Baseball button. Dashboard
 * routes keep their own in-shell page (dashboard/not-found.tsx).
 */
export default function GolfNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-16">
      <EmptyState
        icon={<Compass strokeWidth={1.75} />}
        title="We couldn't find that"
        description="This page may have been moved, or the link is no longer valid."
        action={
          <Button asChild variant="primary">
            <Link href="/golf/dashboard">Go to GolfHelm</Link>
          </Button>
        }
      />
    </main>
  );
}
