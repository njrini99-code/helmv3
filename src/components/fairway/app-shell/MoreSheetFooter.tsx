'use client';

/**
 * ============================================================================
 * Fairway · AppShell · MoreSheetFooter (M1, ADDITIVE)
 * ----------------------------------------------------------------------------
 * The More sheet's pinned footer row — Settings + Sign out, styled for the
 * warm-cream `bg-elevated` sheet body. Deliberately NOT the rail's dark
 * `nav-*`-token footer (`ShellFooter` in each product shell) — that JSX is
 * built for the black rail and reads wrong on a light sheet.
 *
 * Presentational only: sign-out has real side effects that differ per
 * product (golf clears the active team + haptic before `signOut()`; baseball
 * calls its own `useAuth().signOut()`), so each product shell supplies
 * `onSignOut` + `signingOut` and mounts this via AppShell's `moreSheetFooter`
 * slot — memoized at the call site, exactly like `sidebarFooter`.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { IconSettings, IconLogout } from '@/components/icons';
import { Button } from '@/components/ui/button';
import type { ShellLinkComponent } from './types';

export interface MoreSheetFooterProps {
  settingsHref: string;
  settingsActive?: boolean;
  onSignOut: () => void;
  signingOut?: boolean;
  linkComponent?: ShellLinkComponent;
}

const DefaultLink: ShellLinkComponent = ({ href, children, ...rest }) => (
  <a href={href} {...rest}>
    {children}
  </a>
);

// `min-h-[44px]` on BOTH rows — the Settings <Link> and Sign-out <Button> (the
// latter would otherwise get a different floor from <Button>'s own default
// sizing) — so the two footer rows share one touch-target height (iOS HIG).
const rowBase = cn(
  'flex min-h-[44px] items-center gap-2 rounded-fw-md px-3 py-2 font-fw-sans text-body-sm font-medium',
  'transition-colors [transition-duration:var(--fw-dur-fast)] motion-reduce:transition-none',
);

export function MoreSheetFooter({
  settingsHref,
  settingsActive = false,
  onSignOut,
  signingOut = false,
  linkComponent,
}: MoreSheetFooterProps) {
  const Link = linkComponent ?? DefaultLink;

  return (
    <>
      <Link
        href={settingsHref}
        aria-current={settingsActive ? 'page' : undefined}
        className={cn(
          rowBase,
          // Follows MoreNavSheet.tsx:99, which already uses accent-700 for the
          // active row. This footer row was the only one in the same sheet not
          // following the sheet's own pattern.
          settingsActive ? 'bg-surface-sunken text-accent-700' : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
        )}
      >
        {/* The icon had no active branch at all, so an active Settings row
            showed a green label beside a grey icon. */}
        <IconSettings
          size={18}
          aria-hidden
          className={cn('flex-shrink-0', settingsActive && 'text-accent-700')}
        />
        Settings
      </Link>
      <Button
        type="button"
        variant="ghost"
        haptic="none"
        onClick={onSignOut}
        disabled={signingOut}
        className={cn(
          rowBase,
          'justify-start bg-transparent hover:bg-fw-danger/10',
          'text-text-secondary hover:text-fw-danger-ink disabled:opacity-50',
        )}
      >
        <IconLogout size={18} aria-hidden className="flex-shrink-0" />
        {signingOut ? 'Signing out…' : 'Sign out'}
      </Button>
    </>
  );
}
