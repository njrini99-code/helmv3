'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode, MouseEvent } from 'react';
import { Icon } from './Icon';
import { haptic, type ChHaptic } from '../lib/haptics';

type Variant = 'primary' | 'secondary' | 'ghost' | 'ink';
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
  ({ href: string; onClick?: never; type?: never; disabled?: never } | {
    href?: undefined;
    onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
    type?: 'button' | 'submit';
    disabled?: boolean;
  });

export function Button(props: ButtonProps) {
  const { variant = 'secondary', size = 'md', leftIcon, rightIcon, kbd, className, children } = props;
  const feel = props.feel === undefined ? (variant === 'primary' ? 'press' : null) : props.feel;
  const cls = ['ch-btn', `ch-btn--${variant}`, size !== 'md' && `ch-btn--${size}`, className].filter(Boolean).join(' ');
  const iconSize = size === 'sm' ? 14 : 15;
  const inner = (
    <>
      {leftIcon && <Icon icon={leftIcon} size={iconSize} />}
      <span>{children}</span>
      {rightIcon && <Icon icon={rightIcon} size={iconSize} />}
      {kbd && <kbd className="ch-btn__kbd">{kbd}</kbd>}
    </>
  );
  if (props.href !== undefined) {
    return (
      <Link href={props.href} className={cls} onClick={() => feel && haptic(feel)}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type={props.type ?? 'button'}
      className={cls}
      disabled={props.disabled}
      onClick={(e) => {
        if (feel) haptic(feel);
        props.onClick?.(e);
      }}
    >
      {inner}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  size = 'md',
  onClick,
  feel = null,
  disabled,
  className,
}: {
  icon: LucideIcon;
  label: string;
  size?: Size;
  onClick?: () => void;
  feel?: ChHaptic | null;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={['ch-btn', 'ch-btn--ghost', 'ch-iconbtn', size !== 'md' && `ch-btn--${size}`, className].filter(Boolean).join(' ')}
      onClick={() => {
        if (feel) haptic(feel);
        onClick?.();
      }}
    >
      <Icon icon={icon} size={size === 'sm' ? 15 : 16} />
    </button>
  );
}
