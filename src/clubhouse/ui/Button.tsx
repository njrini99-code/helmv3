'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode, MouseEvent } from 'react';
import { Icon } from './Icon';
import { haptic, type ChHaptic } from '../lib/haptics';
import { Spinner } from './Spinner';
import { Tooltip } from './Tooltip';

type Variant = 'primary' | 'secondary' | 'ghost' | 'ink' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
  kbd?: string;
  /** Haptic on press. Primary buttons tap lightly by default; others are silent. */
  feel?: ChHaptic | null;
  className?: string;
  children: ReactNode;
}

type ButtonProps = CommonProps &
  ({ href: string; onClick?: never; type?: never; disabled?: never; busy?: never } | {
    href?: undefined;
    onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
    type?: 'button' | 'submit';
    /** Not available: unlit and not clickable. Use `busy` for an action that is on its way. */
    disabled?: boolean;
    /** The action this button starts is in flight: aria-busy, no second press, and it stays lit (working, not unavailable). */
    busy?: boolean;
  });

export function Button(props: ButtonProps) {
  const { variant = 'secondary', size = 'md', leftIcon, rightIcon, kbd, className, children } = props;
  // A primary press confirms; a destructive one warns as it is pressed (CONS-1).
  const feel = props.feel === undefined ? (variant === 'primary' ? 'press' : variant === 'danger' ? 'warning' : null) : props.feel;
  const cls = ['ch-btn', `ch-btn--${variant}`, size !== 'md' && `ch-btn--${size}`, className].filter(Boolean).join(' ');
  const iconSize = size === 'sm' ? 14 : 15;
  const inner = (
    <>
      {leftIcon && <Icon icon={leftIcon} size={iconSize} />}
      <span>{children}</span>
      {rightIcon && <Icon icon={rightIcon} size={iconSize} />}
      {/* The hint is visual: VoiceOver read "New event, N" as the name (audit A-10); the shortcut is announced through
          aria-keyshortcuts on the control instead. */}
      {kbd && <kbd className="ch-btn__kbd" aria-hidden="true">{kbd}</kbd>}
      {/* In flight the ring sits over the label (which keeps its width, so the key does not jump) and the label stays in
          the accessibility tree: it is the name VoiceOver reads, with aria-busy saying it is on its way. */}
      {props.href === undefined && props.busy && <Spinner size={size === 'sm' ? 'sm' : 'md'} tone="current" className="ch-btn__spin" />}
    </>
  );
  if (props.href !== undefined) {
    return (
      <Link href={props.href} className={cls} aria-keyshortcuts={kbd} onClick={() => feel && haptic(feel)}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type={props.type ?? 'button'}
      className={cls}
      aria-keyshortcuts={kbd}
      disabled={props.disabled || props.busy}
      aria-busy={props.busy || undefined}
      onClick={(e) => {
        if (props.busy) return;
        if (feel) haptic(feel);
        props.onClick?.(e);
      }}
    >
      {inner}
    </button>
  );
}

/**
 * An icon-only button. Its tooltip is its accessible name (and `shortcut`, when it has one: drawn as key caps, announced
 * through aria-keyshortcuts), shown on hover rest and keyboard focus and never on touch (ui/Tooltip.tsx).
 */
export function IconButton({
  icon,
  label,
  size = 'md',
  onClick,
  feel = null,
  disabled,
  className,
  shortcut,
  menu,
  variant = 'ghost',
}: {
  icon: LucideIcon;
  label: string;
  size?: Size;
  onClick?: () => void;
  feel?: ChHaptic | null;
  disabled?: boolean;
  className?: string;
  /** The key that does the same, one string per key cap ("N", or "⌘" then "\\"). */
  shortcut?: readonly string[];
  /** A menu's trigger props (ui/Menu's `trigger`): the key opens that menu (CONS-2). */
  /** Ghost by default; secondary where the key sits among a toolbar's raised keys (Calendar's More). */
  variant?: 'ghost' | 'secondary';
  menu?: { ref: (el: HTMLButtonElement | null) => void; onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu'; 'aria-controls': string };
}) {
  return (
    <Tooltip label={label} shortcut={shortcut} ariaKeys={shortcut?.length === 1 && shortcut[0]!.length === 1 ? shortcut[0] : undefined}>
      <button
        ref={menu?.ref}
        type="button"
        aria-label={label}
        aria-expanded={menu?.['aria-expanded']}
        aria-haspopup={menu?.['aria-haspopup']}
        aria-controls={menu?.['aria-controls']}
        disabled={disabled}
        className={['ch-btn', `ch-btn--${variant}`, 'ch-iconbtn', size !== 'md' && `ch-btn--${size}`, className].filter(Boolean).join(' ')}
        onClick={() => {
          if (feel) haptic(feel);
          onClick?.();
          menu?.onClick();
        }}
      >
        <Icon icon={icon} size={size === 'sm' ? 15 : 16} />
      </button>
    </Tooltip>
  );
}
