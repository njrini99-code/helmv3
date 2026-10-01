import React from 'react';
import { Icon } from '../icons/Icon.jsx';

export function Radio({ label, description, checked, defaultChecked, onChange, disabled, name, value, className = '' }) {
  return (
    <label className={'fw-check fw-check--radio ' + className} style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
      <input type="radio" name={name} value={value} checked={checked} defaultChecked={defaultChecked} disabled={disabled} onChange={(e) => onChange && onChange(e.target.checked)} />
      <span className="fw-check__box"></span>
      {label && <span>{label}{description && <span className="fw-check__desc">{description}</span>}</span>}
    </label>
  );
}
