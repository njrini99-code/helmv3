'use client';

import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * NativeSelect — canonical thin wrapper around the platform <select>.
 *
 * The ui <Select> is a custom listbox (options array, search, clear) and is
 * the right choice for rich pickers — but several surfaces legitimately want
 * the NATIVE select: mobile OS pickers, dense tables, tiny inline sorts.
 * Before this wrapper existed those sites used raw <select> elements, which
 * helm/no-raw-input flags (they skip the canonical focus ring and token
 * styling). This wrapper gives them a sanctioned home: native semantics,
 * token-backed defaults, and full className override so existing call-site
 * styling is preserved verbatim.
 */
export type NativeSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'rounded-lg border border-warm-200 bg-cream-50 px-2 py-1.5 text-base sm:text-sm text-warm-900',
        'focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-300/45',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
NativeSelect.displayName = 'NativeSelect';
