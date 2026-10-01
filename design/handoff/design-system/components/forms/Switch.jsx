import React from 'react';

export function Switch({ label, checked, defaultChecked, onChange, disabled, className = '' }) {
  return (
    <label className={'fw-switch ' + className} style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
      <input type="checkbox" role="switch" checked={checked} defaultChecked={defaultChecked} disabled={disabled} onChange={(e) => onChange && onChange(e.target.checked)} />
      <span className="fw-switch__track"><span className="fw-switch__thumb" /></span>
      {label && <span>{label}</span>}
    </label>
  );
}
