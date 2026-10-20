import React from 'react';
import { Icon } from '../icons/Icon.jsx';
import { DeltaChip } from '../data/DeltaChip.jsx';
import { Sparkline } from '../data/Sparkline.jsx';

export function MetricCard({ label, icon, period, value, unit, delta, compare, trend, goodWhen = 'up', invert = false, note, className = '', style }) {
  return (
    <div className={'fw-card fw-metric ' + className} style={style}>
      <div className="fw-card__head">
        <span className="fw-card__label">{icon && <span className="fw-card__icon"><Icon name={icon} size={14} /></span>}{label}</span>
        {period && <span className="fw-card__period">{period}</span>}
      </div>
      <div className="fw-metric__value"><span className="fw-metric__figure">{value}</span>{unit && <span className="fw-metric__unit">{unit}</span>}</div>
      {(delta || compare) && <div className="fw-metric__delta">{delta && <DeltaChip {...delta} />}{compare && <span>{compare}</span>}</div>}
      {trend && trend.length > 1
        ? <div className="fw-metric__chart"><Sparkline fluid height={76} data={trend} goodWhen={goodWhen} invert={invert} baseline="mean" inset={[10, 18, 0, 0]} strokeWidth={2} /></div>
        : <div style={{ height: 18 }} />}
      {note && <div className="fw-metric__note">{note}</div>}
    </div>
  );
}
