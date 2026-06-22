'use client';

/**
 * ============================================================================
 * Fairway · PlayerIdentity — the ONE player-identity treatment (Q3)
 * ----------------------------------------------------------------------------
 * Before this primitive every surface that listed a player rolled its own
 * avatar + name + meta block: the roster card, the CoachHelm "who needs your
 * attention" rows + roster table, the messages recipient picker, the qualifier
 * entry list. Same data, four different layouts — "it's all so sloppy".
 *
 * PlayerIdentity is the shared, presentational identity block: an Avatar (with
 * graceful initials fallback + optional presence dot), the player's name, and an
 * optional quiet meta line (class year / hometown / subtitle). Every consuming
 * surface keeps its OWN function via two slots — `nameAddon` (inline next to the
 * name, e.g. a year badge) and `trailing` (after the identity block, e.g. a
 * selection check, an attention reason + action, a stat). So a player reads the
 * SAME everywhere while each page keeps what it does.
 *
 *   <PlayerIdentity
 *     name="Jordan Lee" avatarUrl={p.avatar_url} meta="Class of '27" size="md"
 *     trailing={<SelectedCheck />}
 *   />
 *
 * Pure presentation — no data fetching, no handlers of its own. a11y: the
 * Avatar carries the accessible name; the name text is a real element; meta is
 * quiet tertiary text at ≥ caption size. The whole block is non-interactive by
 * default so a parent <button>/<label> owns the interaction (no nested controls).
 * ========================================================================== */

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Avatar, type AvatarSize, type AvatarStatus } from './avatar';

export type PlayerIdentitySize = 'sm' | 'md';

export interface PlayerIdentityProps {
  /** Player display name. The single source of the name text + initials fallback. */
  name: string;
  /** Avatar image URL (null/undefined → initials fallback from `avatarName`/`name`). */
  avatarUrl?: string | null;
  /** Override the name used for avatar initials/alt (defaults to `name`). */
  avatarName?: string | null;
  /**
   * Quiet meta line under the name — class year, hometown, subtitle. Omit for a
   * single-line identity. ReactNode so callers can compose (e.g. "'27 · +2 HCP").
   */
  meta?: ReactNode;
  /** sm = dense rows (table cells, pickers); md = cards + headline rows. */
  size?: PlayerIdentitySize;
  /** Presence dot on the avatar (online/away/busy/offline). Omit for none. */
  status?: AvatarStatus;
  /** Square-with-soft-corners avatar (the roster card identity) vs the default circle. */
  squareAvatar?: boolean;
  /** Hide the avatar entirely — name-only identity for avatarless contexts. */
  showAvatar?: boolean;
  /**
   * Inline node rendered immediately after the name on the SAME line (wraps).
   * For page-specific name adornments — e.g. the roster card's year badge.
   */
  nameAddon?: ReactNode;
  /**
   * Page-specific affordance rendered AFTER the identity block, pushed to the
   * trailing edge: a selection check, an action button, a stat, a chevron.
   * This is how each surface keeps its function while sharing the identity.
   */
  trailing?: ReactNode;
  /** Extra classes on the outer row. */
  className?: string;
  /** Extra classes on the name text element. */
  nameClassName?: string;
}

/** Avatar size per identity size — sm rows get a compact avatar, md gets the standard. */
const AVATAR_SIZE: Record<PlayerIdentitySize, AvatarSize> = {
  sm: 'sm',
  md: 'md',
};

/** Name typography per size — both use the sans face + medium weight + truncate. */
const NAME_CLS: Record<PlayerIdentitySize, string> = {
  sm: 'text-body-sm',
  md: 'text-body',
};

/** Meta line stays quiet + small at every size (tertiary, caption). */
const META_CLS = 'mt-0.5 truncate font-fw-sans text-caption text-text-tertiary';

export function PlayerIdentity({
  name,
  avatarUrl,
  avatarName,
  meta,
  size = 'md',
  status,
  squareAvatar = false,
  showAvatar = true,
  nameAddon,
  trailing,
  className,
  nameClassName,
}: PlayerIdentityProps) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      {showAvatar ? (
        <Avatar
          src={avatarUrl}
          name={avatarName ?? name}
          size={AVATAR_SIZE[size]}
          status={status}
          square={squareAvatar}
          className="flex-shrink-0"
        />
      ) : null}

      <div className="min-w-0 flex-1">
        {nameAddon ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={cn(
                'truncate font-fw-sans font-medium text-text-primary',
                NAME_CLS[size],
                nameClassName,
              )}
            >
              {name}
            </span>
            {nameAddon}
          </div>
        ) : (
          <span
            className={cn(
              'block truncate font-fw-sans font-medium text-text-primary',
              NAME_CLS[size],
              nameClassName,
            )}
          >
            {name}
          </span>
        )}
        {meta ? <div className={META_CLS}>{meta}</div> : null}
      </div>

      {trailing ? <div className="flex-shrink-0">{trailing}</div> : null}
    </div>
  );
}

export default PlayerIdentity;
