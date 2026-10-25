'use client';

import type { ReactNode } from 'react';
import { Avatar } from './Avatar';
import '../styles/class-awareness.css';

/**
 * P-10 class awareness: a player with their class status under the name, the row the In class now sheet lists and the
 * player's own "Coaches see" preview draws. One component for both, so what a coach reads is what the player is shown.
 *
 *   line   the status line (ClassStatusLine), or a plain "No class status"
 *   meta   the class label, for the coach's sheet and the player's preview (never a room or an instructor)
 *   time   the right-hand time ("until 11:50 AM") in the sheet's rows
 *
 * With `onSelect` the row is one button; without, a plain row.
 */
export function ClassStatusRow({
  name,
  avatarId,
  line,
  meta,
  time,
  onSelect,
  label,
}: {
  name: string;
  avatarId: string;
  line?: ReactNode;
  meta?: ReactNode;
  time?: string | null;
  onSelect?: () => void;
  /** The row's name for assistive tech when the visible text is not enough ("Theo Park, in class until 11:50 AM, STAT 201"). */
  label?: string;
}) {
  const body = (
    <>
      <Avatar name={name} id={avatarId} size="md" />
      <span className="ch-ca-row__text">
        <span className="ch-ca-row__name">{name}</span>
        {line && <span className="ch-ca-row__line">{line}</span>}
        {meta && <span className="ch-ca-row__meta">{meta}</span>}
      </span>
      {time && <span className="ch-ca-row__time ch-num">{time}</span>}
    </>
  );
  return onSelect ? (
    <button type="button" className="ch-ca-row is-button" aria-label={label} onClick={onSelect}>
      {body}
    </button>
  ) : (
    <div className="ch-ca-row" role={label ? 'group' : undefined} aria-label={label}>
      {body}
    </div>
  );
}
