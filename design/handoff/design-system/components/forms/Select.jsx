import React from 'react';
import { Icon } from '../icons/Icon.jsx';

export function Select({ options, value, defaultValue, onChange, placeholder, invalid = false, disabled = false, id, className = '' }) {
  return (
    <div className={'fw-input fw-select ' + className} data-invalid={invalid || undefined} data-disabled={disabled || undefined}>
      <select id={id} value={value} defaultValue={defaultValue} disabled={disabled} onChange={(e) => onChange && onChange(e.target.value)}>
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o;
          return <option key={opt.value} value={opt.value}>{opt.label}</option>;
        })}
      </select>
      <Icon name="chevrons-up-down" size={14} style={{ marginLeft: -18, pointerEvents: 'none' }} />
    </div>
  );
}
