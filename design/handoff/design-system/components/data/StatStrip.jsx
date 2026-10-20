import React from 'react';
import { DeltaChip } from './DeltaChip.jsx';

export function StatStrip({ items = [], className = '', style }) {
  return (
    <div className={'fw-statstrip ' + className} style={{ '--n': items.length, ...style }}>
      {items.map((it, i) => (
        <div key={i} className={'fw-statstrip__cell' + (it.lead ? ' fw-statstrip__cell--lead' : '')}>
          <div className="fw-statstrip__top"><span className="fw-statstrip__label">{it.label}</span>{it.delta && <DeltaChip {...it.delta} />}</div>
          <div className="fw-statstrip__value">{it.value}{it.unit && <span className="fw-statstrip__unit">{it.unit}</span>}</div>
          {it.bar != null && <div className="fw-statstrip__bar" aria-hidden="true"><span style={{ width: Math.max(0, Math.min(100, it.bar)) + '%' }} /></div>}
          {it.note && <span className="fw-statstrip__note">{it.note}</span>}
        </div>
      ))}
    </div>
  );
}
