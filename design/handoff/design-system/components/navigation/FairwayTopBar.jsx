import React from 'react';
import { Icon } from '../icons/Icon.jsx';

export function FairwayTopBar({ crumbs = [], actions, onSearch, searchPlaceholder = 'Search players, rounds, courses', className = '' }) {
  return (
    <div className={'fw-topbar ' + className}>
      <div className="fw-topbar__crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Icon name="chevron-right" size={13} />}
            {i === crumbs.length - 1 ? <b>{c}</b> : <span>{c}</span>}
          </React.Fragment>
        ))}
      </div>
      <button className="fw-topbar__search" onClick={onSearch} style={{ border: 0 }}>
        <Icon name="search" size={14} />
        <span style={{ flex: 1, textAlign: 'left' }}>{searchPlaceholder}</span>
        <span className="fw-kbd">⌘K</span>
      </button>
      {actions && <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{actions}</div>}
    </div>
  );
}
