'use client';

import type { LucideIcon } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { haptic } from '../../../lib/haptics';
import { useNow } from '../../../lib/use-now';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { ago } from './labels';
import '../../../styles/rounds-track.css';

/*
 * Round entry's sheets are built from the tracking screen's own pieces, the
 * ones the board draws for its exit sheet (rounds-track.jsx): the round card
 * (rt-exitc, `.ch-rt-exitc`), the option rows (rt-opt, `.ch-rt-xopt`), the
 * note with an action (`.ch-rt-note`) and the discard question
 * (`.ch-rt-confirm`). They load with rounds-track.css, imported here because
 * these sheets also open on the setup step, where the shot screen isn't
 * mounted.
 */

/**
 * CH-11709: the error haptic (D-70) when a failure line appears. It ticks once per new
 * message, so a parent clears the message when a new attempt starts and a
 * second failure ticks again. A parent that wires an action through useAction
 * already gets the tick there and shows its toast instead of passing `error`.
 */
export function useErrorHaptic(error: string | null | undefined): void {
  useEffect(() => {
    if (error) haptic('error');
  }, [error]);
}

/** "5 min ago" for a time, after hydration (or against `now`, for a fixed preview or test). Null until it can be told. */
export function useAgo(at: number | string | null | undefined, now?: Date | number): string | null {
  const live = useNow();
  const t = now instanceof Date ? now.getTime() : (now ?? live?.getTime());
  return t == null ? null : ago(at, t);
}

/**
 * The exit sheet's round card: how far the round got as a count in a tile, the
 * course, one line of facts and a bar. `of` is the round's holes; without it
 * the tile says "holes" and there is no bar.
 */
export function RoundFacts({ count, of, title, line }: { count: number; of: number | null; title: string; line: string | null }) {
  return (
    <div className="ch-rt-exitc">
      <span className="ch-rt-exitc__n">
        <b>{count}</b>
        <em>{of ? `of ${of}` : 'holes'}</em>
      </span>
      <div>
        <b>{title}</b>
        {line && <span>{line}</span>}
        {of ? (
          <i className="ch-rt-exitc__bar" aria-hidden="true">
            <i style={{ width: `${(Math.min(count, of) / of) * 100}%` }} />
          </i>
        ) : null}
      </div>
    </div>
  );
}

/** The exit sheet's stack of option rows. */
export function Opts({ children }: { children: ReactNode }) {
  return <div className="ch-rt-exit__opts">{children}</div>;
}

/**
 * One option row, as the exit sheet draws it: an icon, a bold label and a
 * line under it. `primary` is the one the sheet wants; `danger` deletes
 * something. A row is silent unless the caller ticks in `onClick`.
 */
export function Opt({
  icon,
  label,
  hint,
  tone,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  tone?: 'primary' | 'danger';
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={'ch-rt-xopt' + (tone ? ` is-${tone}` : '')} disabled={disabled} onClick={onClick}>
      <Icon icon={icon} size={18} />
      <span>
        <b>{label}</b>
        <em>{hint}</em>
      </span>
    </button>
  );
}

/**
 * The second tap of a destructive choice, the exit sheet's discard question
 * (CH-11507): what goes, that it can't be undone, Keep it and the danger
 * button. The warning haptic fires on the danger tap, before the callback
 * (D-70), and the failure line stays here so the player sees it beside the
 * button they pressed.
 */
export function DiscardConfirm({
  code,
  label,
  title,
  body,
  error,
  errorCode,
  busy,
  keepLabel = 'Keep it',
  discardLabel = 'Discard round',
  onKeep,
  onDiscard,
}: {
  /** Catalog number of the question. */
  code: string;
  /** The group's accessible name. */
  label: string;
  title: string;
  body: ReactNode;
  /** A finished sentence ("Couldn't discard the round. …"), or null. */
  error?: string | null;
  /** Catalog number of the failure line. */
  errorCode?: string;
  busy: boolean;
  keepLabel?: string;
  discardLabel?: string;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="ch-rt-confirm ch-rt-confirm--danger" role="group" aria-label={label} data-ch-code={code}>
      <div>
        <b>{title}</b>
        <span>{body}</span>
        {error && (
          <span className="ch-rt-error" role="alert" data-ch-code={errorCode}>
            {error}
          </span>
        )}
      </div>
      <Button variant="ghost" size="sm" disabled={busy} onClick={onKeep}>
        {keepLabel}
      </Button>
      <Button
        variant="danger"
        size="sm"
        disabled={busy}
        feel={null}
        onClick={() => {
          // CH-11708: the warning comes before the discard runs.
          haptic('warning');
          onDiscard();
        }}
      >
        {busy ? 'Discarding…' : discardLabel}
      </Button>
    </div>
  );
}
