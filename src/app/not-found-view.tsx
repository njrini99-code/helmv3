'use client';

/**
 * The platform's one 404 (GAP-M-02): a small icon, one sentence, one primary
 * action and the other places as quiet links. It replaces a giant grey "404"
 * over three equal white buttons, and the second, Fairway-built golf 404.
 *
 * `usePathname()` is why this is a client component: a server `not-found.tsx`
 * receives no request URL, so it cannot know which product the visitor came
 * from. The server file (not-found.tsx) renders it and owns the tab title.
 *
 * Outside every product shell, so it uses the root's Fairway tokens through
 * Tailwind (design-tokens.css is loaded by the root layout), never Clubhouse CSS.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass } from 'lucide-react';
import { destinationsFor } from './not-found-destinations';

export function NotFoundView() {
  const destinations = destinationsFor(usePathname());
  const primary = destinations.find((d) => d.primary)!;
  const others = destinations.filter((d) => !d.primary);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-16">
      <div className="flex max-w-sm flex-col items-center text-center">
        <span aria-hidden="true" className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-accent-wash text-accent-ink">
          <Compass className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <h1 className="font-fw-display text-2xl font-semibold text-text-primary">We couldn’t find that page</h1>
        <p className="mt-2 font-fw-sans text-base text-text-secondary">It may have moved, or the link is wrong.</p>
        <Link
          href={primary.href}
          prefetch={false}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-accent-fill px-6 font-fw-sans text-base font-semibold text-text-on-accent-fill hover:bg-accent-fill-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
        >
          {primary.action}
        </Link>
        <nav aria-label="Other places" className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 font-fw-sans text-sm">
          {others.map((d) => (
            <Link key={d.href} href={d.href} prefetch={false} className="py-3 text-accent-ink hover:underline">
              {d.label}
            </Link>
          ))}
        </nav>
        <p className="mt-8 font-fw-sans text-sm text-text-secondary">
          Need help?{' '}
          <a href="mailto:admin@helmsportslabs.com" className="py-3 text-accent-ink hover:underline">
            Contact support
          </a>
        </p>
      </div>
    </main>
  );
}
