'use client';

/**
 * The platform's one dead-end page — `/golf/**`, `/baseball/**` and every
 * marketing route funnel here.
 *
 * It used to hardcode "Baseball Dashboard" as the single filled primary
 * button, so a golf coach who mistyped a URL inside `/golf/dashboard/...` was
 * pointed at a product they do not use, with their own dashboard demoted to an
 * outline beside it. Observed in production 2026-08-17 on
 * `/golf/dashboard/players/<id>/insight`.
 *
 * `usePathname()` is why this is a client component: a server `not-found.tsx`
 * receives no request URL, so it cannot know which sport the visitor came
 * from. There is no server data on this page, so there is nothing to lose.
 *
 * Colours moved off the retired `cream-*`/`warm-*` scale onto the Fairway
 * tokens (`.claude/rules/design-system.md` bans them in dashboard surfaces,
 * and this is the page a dashboard user lands on when a route misses).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { destinationsFor } from './not-found-destinations';

export default function NotFound() {
  const pathname = usePathname();
  const destinations = destinationsFor(pathname);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <div className="max-w-md text-center">
        <div className="mb-8">
          <h1 className="font-fw-display text-8xl font-bold text-text-tertiary">404</h1>
          <h2 className="mt-4 font-fw-display text-2xl font-semibold text-text-primary">
            Page not found
          </h2>
          <p className="mt-2 font-fw-sans text-text-secondary">
            Sorry, we couldn&apos;t find the page you&apos;re looking for.
          </p>
        </div>

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          {destinations.map((d) => (
            <Button key={d.href} asChild variant={d.primary ? 'primary' : 'secondary'}>
              <Link href={d.href}>{d.label}</Link>
            </Button>
          ))}
        </div>

        <p className="mt-8 font-fw-sans text-sm text-text-tertiary">
          Need help?{' '}
          <Link
            href="mailto:admin@helmsportslabs.com"
            className="text-accent-700 hover:underline"
          >
            Contact support
          </Link>
        </p>
      </div>
    </div>
  );
}
