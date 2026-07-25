'use client';

/**
 * ============================================================================
 * Fairway · SettingsPage — the shell every settings sub-page sits in
 * ----------------------------------------------------------------------------
 * With settings split from one wall into an index plus focused sub-pages, each
 * sub-page needs the same three things: a way back to the index, a title, and
 * a consistent column width. Hand-rolling that per page is exactly how the
 * surface drifted apart the first time — `/settings/coaching-intelligence` and
 * `/settings/notifications` already had two different mastheads before this.
 *
 * The back link is a real `<Link>`, not a history `back()`: a sub-page is
 * reachable directly (deep link, bookmark, redirect) and "back" must always
 * mean "up to Settings", never "wherever you happened to come from".
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { IconArrowLeft } from '@/components/icons';

export interface SettingsPageProps {
  /** Page title. Rendered as the surface's one `h1`. */
  title: React.ReactNode;
  /** One line of orientation copy under the title. */
  description?: React.ReactNode;
  /** Right-aligned masthead slot (auto-save badge, a primary action…). */
  action?: React.ReactNode;
  /** Where "back" goes. Defaults to the settings index. */
  backHref?: string;
  /** Label for the back link. */
  backLabel?: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingsPage({
  title,
  description,
  action,
  backHref = '/golf/dashboard/settings',
  backLabel = 'Settings',
  children,
  className,
}: SettingsPageProps) {
  return (
    <div className={cn('mx-auto w-full max-w-[720px] px-4 pb-16 pt-6 sm:px-6', className)}>
      {/* -my-2 keeps the 44px tap target from adding visible space above the
          title — the link's box is tall, its ink is not. */}
      <Link
        href={backHref}
        className="-my-2 inline-flex min-h-11 items-center gap-1.5 py-2 font-fw-sans text-body-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
      >
        <IconArrowLeft size={16} aria-hidden />
        {backLabel}
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-fw-display text-h1 font-medium tracking-[-0.008em] text-text-primary [text-wrap:balance]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-[60ch] font-fw-sans text-body-sm text-text-secondary">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      <div className="mt-7">{children}</div>
    </div>
  );
}
