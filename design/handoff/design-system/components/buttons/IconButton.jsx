import React from 'react';
import { Icon } from '../icons/Icon.jsx';

export function IconButton({ icon, label, variant = 'ghost', size = 'md', className = '', type = 'button', ...rest }) {
  const is = size === 'lg' ? 20 : size === 'sm' ? 15 : 17;
  const cls = ['fw-btn', 'fw-iconbtn', 'fw-btn--' + variant, size !== 'md' && 'fw-btn--' + size, className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} aria-label={label} title={label} {...rest}>
      {typeof icon === 'string' ? <Icon name={icon} size={is} /> : icon}
    </button>
  );
}
