import React from 'react';
import { Icon } from '../icons/Icon.jsx';
import { Avatar } from '../identity/Avatar.jsx';

export function EventCard({ kicker, countdown, title, meta = [], rows = [], actions, className = '', style }) {
  return (
    <article className={'fw-card fw-event ' + className} style={style}>
      <div className="fw-event__top">
        <span className="fw-event__kicker">{kicker}</span>
        {countdown && <span className="fw-event__count">{countdown}</span>}
      </div>
      <h3 className="fw-event__title">{title}</h3>
      {meta.length > 0 && <ul className="fw-event__meta">{meta.map((m, i) => <li key={i}>{m.icon && <Icon name={m.icon} size={14} />}{m.label}</li>)}</ul>}
      {rows.length > 0 && (
        <div className="fw-event__rows">
          {rows.map((r, i) => (
            <div key={i} className="fw-event__row">
              <span className="fw-event__time">{r.time}</span>
              <span className="fw-event__names">{r.label}</span>
              {r.people && <span className="fw-event__avatars">{r.people.map((p) => <Avatar key={p} name={p} size={22} />)}</span>}
            </div>
          ))}
        </div>
      )}
      {actions && <div className="fw-event__actions">{actions}</div>}
    </article>
  );
}
