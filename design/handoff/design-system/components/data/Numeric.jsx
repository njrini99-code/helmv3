import React from 'react';
import { DeltaChip } from './DeltaChip.jsx';

export function Numeric({ label, value, unit, delta, note, size = 'm', className = '', style }) {
  return (
    <div className={'fw-numeric fw-numeric--' + size + ' ' + className} style={style}>
      {label && <span className="fw-numeric__label">{label}</span>}
      <div className="fw-numeric__row">
        <span className="fw-numeric__value">{value}</span>
        {unit && <span className="fw-numeric__unit">{unit}</span>}
        {delta && <DeltaChip {...delta} />}
      </div>
      {note && <span className="fw-numeric__note">{note}</span>}
    </div>
  );
}
