import React from 'react';
import { Icon } from '../icons/Icon.jsx';

export function PopoverPanel({ label, items = [], className = '', style }) {
  return (
    <div className={'fw-glass fw-glass--strong fw-popover ' + className} role="menu" style={style}>
      {label && <div className="fw-popover__label">{label}</div>}
      {items.map((it, i) => it === 'separator'
        ? <div key={i} className="fw-popover__sep" role="separator" />
        : (
          <button key={i} className="fw-popover__item" role="menuitem" onClick={it.onSelect} style={it.danger ? { color: 'var(--danger-600)' } : undefined}>
            {it.icon && <Icon name={it.icon} size={15} />}
            {it.label}
            {it.kbd && <span className="fw-popover__kbd">{it.kbd}</span>}
          </button>
        ))}
    </div>
  );
}
