import React from 'react';
import { Icon } from '../icons/Icon.jsx';

export function Checkbox({ label, description, checked, defaultChecked, onChange, disabled, name, value, className = '' }) {
  return (
    <label className={'fw-check ' + className} style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
      <input type="checkbox" name={name} value={value} checked={checked} defaultChecked={defaultChecked} disabled={disabled} onChange={(e) => onChange && onChange(e.target.checked)} />
      <span className="fw-check__box"><Icon name="check" size={12} strokeWidth={2.4} /></span>
      {label && <span>{label}{description && <span className="fw-check__desc">{description}</span>}</span>}
    </label>
  );
}
