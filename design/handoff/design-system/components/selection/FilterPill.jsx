import React from 'react';
import { Icon } from '../icons/Icon.jsx';

export function FilterPill({ selected = false, onToggle, onRemove, icon, children, className = '' }) {
  return (
    <button type="button" aria-pressed={selected} className={'fw-pill ' + className} onClick={() => onToggle && onToggle(!selected)}>
      {icon && <Icon name={icon} size={14} />}
      {children}
      {onRemove && selected && (
        <span className="fw-pill__x" role="button" aria-label="Remove filter" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
          <Icon name="x" size={13} />
        </span>
      )}
    </button>
  );
}
