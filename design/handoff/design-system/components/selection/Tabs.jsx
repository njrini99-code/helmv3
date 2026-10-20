import React from 'react';

export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div role="tablist" className={'fw-tabs ' + className}>
      {tabs.map((t) => (
        <button key={t.value} role="tab" type="button" aria-selected={t.value === value} className="fw-tab" onClick={() => onChange && onChange(t.value)}>
          {t.label}
          {t.count != null && <span className="fw-tab__count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
