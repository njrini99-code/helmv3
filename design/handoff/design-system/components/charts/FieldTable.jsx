import React from 'react';
import { YardagePage } from './YardagePage.jsx';

export function FieldTable({ rows = [], title = 'Against the field', meta = 'You · team · tour', note, className = '', style }) {
  return (
    <YardagePage title={title} meta={meta} note={note} className={className} style={style}>
      <table className="fw-yb-table">
        <thead><tr><th>Stat</th><th>You</th><th>Team</th><th>Tour</th><th>Gap to tour</th></tr></thead>
        <tbody>
          {rows.map((m) => {
            const good = m.better === 'down' ? m.you <= m.team : m.you >= m.team;
            const gap = m.better === 'down' ? m.tour - m.you : m.you - m.tour;
            const u = m.unit || '';
            return (
              <tr key={m.label}>
                <td>{m.label}</td>
                <td className={'fw-yb-table__you ' + (good ? 'is-gain' : 'is-loss')}><span>{m.you}{u}</span></td>
                <td>{m.team}{u}</td>
                <td>{m.tour}{u}</td>
                <td className={'fw-yb-table__gap ' + (gap >= 0 ? 'is-gain' : 'is-loss')}>{(gap >= 0 ? '+' : '−') + Math.abs(gap).toFixed(u ? 0 : 1) + (u ? ' pts' : '')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </YardagePage>
  );
}
