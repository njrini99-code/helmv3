import React from 'react';

export function Badge({ tone = 'neutral', dot = false, children, className = '' }) {
  return (
    <span className={'fw-badge fw-badge--' + tone + ' ' + className}>
      {dot && <span className="fw-badge__dot" />}
      {children}
    </span>
  );
}
