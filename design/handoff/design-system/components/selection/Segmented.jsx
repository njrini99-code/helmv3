import React from 'react';

export function Segmented({ options, value, onChange, size = 'md', label, className = '' }) {
  return (
    <div role="radiogroup" aria-label={label} className={['fw-seg', size === 'sm' && 'fw-seg--sm', className].filter(Boolean).join(' ')}>
      {options.map((o) => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o;
        return (
          <button key={opt.value} type="button" role="radio" aria-checked={opt.value === value} className="fw-seg__opt" onClick={() => onChange && onChange(opt.value)}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
