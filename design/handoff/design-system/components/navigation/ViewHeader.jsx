import React from 'react';
import { Eyebrow } from './Eyebrow.jsx';

export function ViewHeader({ eyebrow, title, lede, actions, compact = false, children, className = '' }) {
  return (
    <header className={'fw-viewheader' + (compact ? ' fw-viewheader--compact' : '') + ' ' + className}>
      <div style={{ minWidth: 0, flex: '1 1 420px' }}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="fw-viewheader__title">{title}</h1>
        {lede && <p className="fw-viewheader__lede">{lede}</p>}
        {children}
      </div>
      {actions && <div className="fw-viewheader__actions">{actions}</div>}
    </header>
  );
}
