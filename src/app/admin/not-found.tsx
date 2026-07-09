import Link from 'next/link';
import { Compass } from 'lucide-react';
import { EmptyState, Button } from '@/components/fairway';

/**
 * Helm Bridge root 404.
 *
 * Catches `notFound()` from dynamic Bridge routes (an `/admin/errors/[fingerprint]`
 * or `/admin/teams/[id]` / `/admin/users/[id]` lookup that comes up empty) and
 * any mistyped `/admin/*` path. Renders INSIDE `AdminShell` — `src/app/admin/layout.tsx`
 * already wraps `children` in the Bridge chrome, so this keeps the rail/top
 * bar instead of falling through to the cross-product root `not-found.tsx`
 * (which offers Golf/Baseball dashboard buttons — the wrong console for a
 * super-admin). Mirrors the same pattern already shipped for the golf
 * Fairway shell (src/app/golf/(dashboard)/dashboard/not-found.tsx).
 */
export default function AdminNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <EmptyState
        icon={<Compass strokeWidth={1.75} />}
        title="We couldn't find that"
        description="This page may have moved, or the record you're looking for no longer exists."
        action={
          <Button asChild variant="primary">
            <Link href="/admin">Back to command center</Link>
          </Button>
        }
      />
    </div>
  );
}
