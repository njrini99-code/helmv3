import React from 'react';
import { Icon } from '../icons/Icon.jsx';

export function Input({ leftIcon, suffix, size = 'md', invalid = false, disabled = false, className = '', style, ...rest }) {
  return (
    <div className={'fw-input' + (size === 'lg' ? ' fw-input--lg' : '') + ' ' + className} data-invalid={invalid || undefined} data-disabled={disabled || undefined} style={style}>
      {leftIcon && <Icon name={leftIcon} size={15} />}
      <input disabled={disabled} aria-invalid={invalid || undefined} {...rest} />
      {suffix && <span className="fw-input__suffix">{suffix}</span>}
    </div>
  );
}
