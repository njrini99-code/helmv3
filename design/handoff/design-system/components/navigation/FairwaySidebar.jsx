import React from 'react';
import { Icon } from '../icons/Icon.jsx';
import { PlayerIdentity } from '../identity/PlayerIdentity.jsx';

export function FairwaySidebar({ items = [], current, onNavigate, user, product = 'Helm', team, tone = 'green', header, footer, className = '', style }) {
  let lastSection = null;
  return (
    <nav className={'fw-sidebar fw-sidebar--' + tone + ' ' + className} style={style} aria-label="Primary">
      <div className="fw-sidebar__brand">
        {header || (
          <>
            <span className="fw-sidebar__word">{product}</span>
            {team && <span className="fw-sidebar__team">{team}<Icon name="chevrons-up-down" size={13} /></span>}
          </>
        )}
      </div>
      {items.map((it) => {
        const head = it.section && it.section !== lastSection ? <div key={'s-' + it.section} className="fw-sidebar__section">{it.section}</div> : null;
        lastSection = it.section || lastSection;
        return (
          <React.Fragment key={it.id}>
            {head}
            <button className="fw-navitem" aria-current={it.id === current ? 'page' : undefined} onClick={() => onNavigate && onNavigate(it.id)}>
              {it.icon && <Icon name={it.icon} size={16} strokeWidth={1.6} />}
              {it.label}
              {it.count != null && <span className="fw-navitem__count">{it.count}</span>}
            </button>
          </React.Fragment>
        );
      })}
      <div className="fw-sidebar__foot">
        {footer || (user && <PlayerIdentity name={user.name} meta={user.meta} initials={user.initials} size="sm" />)}
      </div>
    </nav>
  );
}
