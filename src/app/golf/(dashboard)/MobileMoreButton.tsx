'use client';

/**
 * ============================================================================
 * MobileMoreButton — the golf phone top bar's entry to the More sheet
 * ----------------------------------------------------------------------------
 * OD-14: the tab bar is five destinations and no longer carries a "More"
 * column, so the More sheet (Settings, Courses, account, sign out…) opens
 * from the top-right of the nav bar. It used to be a grid (LayoutGrid) glyph;
 * the owner asked for the signed-in user's profile picture instead (2026-09),
 * the familiar "tap your avatar for your account" affordance. Photo when the
 * user has one, initials otherwise — the same `name`/`avatarUrl` the desktop
 * sidebar identity block shows (GolfUserData via FairwayDashboardShell).
 *
 * Behaviour is unchanged: same `onOpen`, same "More" accessible name (the
 * avatar is decorative), aria-haspopup/expanded, the current-route state when
 * the route lives only in the sheet (drawn as an accent ring round the
 * avatar), and the sheet's aggregate unread badge. Golf-only: it lives in the
 * golf shell, so Baseball's top bar is untouched.
 * ========================================================================== */

import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/fairway/controls';
import { cn } from '@/lib/utils';

export interface MobileMoreButtonProps {
  onOpen: () => void;
  open: boolean;
  active: boolean;
  badge?: number;
  /** Signed-in user's display name — initials fallback. */
  name?: string | null;
  /** Signed-in user's profile photo URL, if any. */
  avatarUrl?: string | null;
}

export function MobileMoreButton({ onOpen, open, active, badge, name, avatarUrl }: MobileMoreButtonProps) {
  const highlighted = active || open;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      haptic="light"
      aria-label={badge ? `More, ${badge} unread` : 'More'}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-current={active ? 'page' : undefined}
      data-active={active || undefined}
      data-slot="mobile-more-button"
      onClick={onOpen}
      className="relative h-11 w-11 rounded-full md:hidden"
    >
      <Avatar
        src={avatarUrl}
        name={name}
        size="sm"
        tone="accent"
        decorative
        aria-hidden="true"
        className={cn(
          'ring-2 ring-offset-2 ring-offset-surface',
          highlighted ? 'ring-accent-fill' : 'ring-border-subtle',
        )}
      />
      {badge ? (
        <span
          aria-hidden
          className="absolute right-0 top-0 min-w-[16px] rounded-full bg-accent-fill px-1 text-center text-eyebrow font-semibold leading-4 tabular-nums text-text-on-accent-fill ring-2 ring-surface"
        >
          {badge > 9 ? '9+' : badge}
        </span>
      ) : null}
    </Button>
  );
}
