'use client';

/**
 * ============================================================================
 * Fairway · Avatar (+ AvatarGroup)
 * ----------------------------------------------------------------------------
 * A warm, matte avatar with full state handling: image (loading → loaded),
 * graceful fallback to initials on error/missing src, and an optional presence
 * status dot. Round by default (the spec's pill/circle identity), with a quiet
 * warm ring.
 *
 * - `src` + `name` → image with initials fallback if the image fails/omitted.
 * - `status` → presence dot (online/away/busy/offline) ringed to the surface.
 * - AvatarGroup → overlapping stack with a "+N" overflow chip.
 *
 * Engine: native <img> with onError state (no external dep needed; this keeps
 * the control self-contained and SSR-safe).
 * ========================================================================== */

import { type HTMLAttributes, type ReactNode, forwardRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { fwTransition } from './_internal';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarStatus = 'online' | 'away' | 'busy' | 'offline';

export interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  src?: string | null;
  /** Display name — used for initials fallback and the image alt text. */
  name?: string | null;
  alt?: string;
  size?: AvatarSize;
  /** Presence dot. Omit for no status. */
  status?: AvatarStatus;
  /** Square-with-soft-corners instead of a circle. */
  square?: boolean;
  /** Override the auto-generated initials. */
  fallback?: ReactNode;
}

const sizePx: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-[12px]',
  md: 'h-10 w-10 text-[14px]',
  lg: 'h-12 w-12 text-[16px]',
  xl: 'h-16 w-16 text-[20px]',
};

const statusSize: Record<AvatarSize, string> = {
  xs: 'h-1.5 w-1.5 ring-2',
  sm: 'h-2 w-2 ring-2',
  md: 'h-2.5 w-2.5 ring-2',
  lg: 'h-3 w-3 ring-[3px]',
  xl: 'h-3.5 w-3.5 ring-[3px]',
};

const statusColor: Record<AvatarStatus, string> = {
  online: 'bg-fw-success',
  away: 'bg-fw-warning',
  busy: 'bg-fw-danger',
  offline: 'bg-text-tertiary',
};

const statusLabel: Record<AvatarStatus, string> = {
  online: 'Online',
  away: 'Away',
  busy: 'Busy',
  offline: 'Offline',
};

export function initialsFromName(name?: string | null): string {
  if (!name) return '';
  // Strip anything that isn't a letter/space/apostrophe/hyphen before
  // tokenizing — a display name like "Coach (Demo)" otherwise splits to
  // ["Coach", "(Demo)"], and the last token's first character is "(",
  // producing "C(" instead of two real letters (#950).
  const cleaned = name.replace(/[^\p{L}\s'-]+/gu, ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { className, src, name, alt, size = 'md', status, square = false, fallback, ...props },
  ref,
) {
  const [errored, setErrored] = useState(false);
  // Reset the error flag if the src changes (e.g. avatar updated).
  useEffect(() => setErrored(false), [src]);

  const showImage = !!src && !errored;
  const initials = initialsFromName(name);

  return (
    <span
      ref={ref}
      data-slot="fw-avatar"
      className={cn('relative inline-flex flex-shrink-0', sizePx[size])}
      {...props}
    >
      <span
        className={cn(
          'flex h-full w-full select-none items-center justify-center overflow-hidden',
          'bg-surface-sunken text-text-secondary font-fw-sans font-semibold uppercase',
          'ring-1 ring-inset ring-border-subtle',
          square ? 'rounded-fw-md' : 'rounded-full',
          fwTransition,
          className,
        )}
      >
        {showImage ? (
          <img
            src={src ?? undefined}
            alt={alt ?? name ?? ''}
            className="h-full w-full object-cover"
            onError={() => setErrored(true)}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ) : initials || fallback ? (
          <span aria-hidden={!!name}>{fallback ?? initials}</span>
        ) : (
          // Last-resort neutral glyph when no name and no image.
          <svg viewBox="0 0 24 24" className="h-3/5 w-3/5 text-text-tertiary" fill="currentColor" aria-hidden="true">
            <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 2.69-8 6v1h16v-1c0-3.31-3.58-6-8-6z" />
          </svg>
        )}
        {/* Screen-reader name when the image carries no alt context */}
        {!showImage && name && <span className="sr-only">{name}</span>}
      </span>

      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 block rounded-full ring-canvas',
            statusSize[size],
            statusColor[status],
          )}
          role="img"
          aria-label={statusLabel[status]}
        />
      )}
    </span>
  );
});

/* ────────────────────────────────────────────────────────────────────────── */

export interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  size?: AvatarSize;
  /** Show at most this many avatars; the rest collapse into a "+N" chip. */
  max?: number;
  children: ReactNode;
}

const ringPad: Record<AvatarSize, string> = {
  xs: '-space-x-1.5',
  sm: '-space-x-2',
  md: '-space-x-2.5',
  lg: '-space-x-3',
  xl: '-space-x-3.5',
};

/**
 * Overlapping avatar stack. Children should be <Avatar> elements; pass `max` to
 * collapse overflow into a count chip. AvatarGroup adds the cream ring + stack
 * offset; it does not resize children, so set their `size` to match this group.
 */
export const AvatarGroup = forwardRef<HTMLDivElement, AvatarGroupProps>(function AvatarGroup(
  { className, size = 'md', max, children, ...props },
  ref,
) {
  const items = Array.isArray(children) ? children : [children];
  const visible = typeof max === 'number' ? items.slice(0, max) : items;
  const overflow = typeof max === 'number' ? Math.max(0, items.length - max) : 0;

  return (
    <div
      ref={ref}
      data-slot="fw-avatar-group"
      className={cn('flex items-center', ringPad[size], className)}
      {...props}
    >
      {visible.map((child, i) => (
        <span key={i} className="rounded-full ring-2 ring-canvas">
          {child}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            'relative inline-flex flex-shrink-0 items-center justify-center rounded-full ring-2 ring-canvas',
            'bg-surface-sunken text-text-secondary font-fw-mono font-semibold tabular-nums',
            sizePx[size],
          )}
          aria-label={`${overflow} more`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
});
