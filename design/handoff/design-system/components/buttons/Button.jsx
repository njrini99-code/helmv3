import React from 'react';
import { Icon } from '../icons/Icon.jsx';

export function Button({ variant = 'secondary', size = 'md', busy = false, fullWidth = false, leftIcon, rightIcon, kbd, disabled, children, className = '', type = 'button', href, ...rest }) {
  const cls = ['fw-btn', 'fw-btn--' + variant, size !== 'md' && 'fw-btn--' + size, fullWidth && 'fw-btn--full', className].filter(Boolean).join(' ');
  const is = size === 'lg' ? 17 : size === 'sm' ? 14 : 16;
  const icon = (i) => (typeof i === 'string' ? <Icon name={i} size={is} /> : i);
  const inner = (
    <>
      {busy ? <span className="fw-btn__spin" aria-hidden="true" /> : leftIcon && icon(leftIcon)}
      <span>{children}</span>
      {rightIcon && icon(rightIcon)}
      {kbd && <kbd className="fw-btn__kbd">{kbd}</kbd>}
    </>
  );
  if (href) return <a className={cls} href={href} aria-disabled={disabled || undefined} {...rest}>{inner}</a>;
  return <button type={type} className={cls} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>{inner}</button>;
}
