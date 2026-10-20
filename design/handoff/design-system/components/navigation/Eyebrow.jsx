import React from 'react';

export function Eyebrow({ children, dot = false, className = '' }) {
  return <span className={'fw-eyebrow' + (dot ? ' fw-eyebrow-row' : '') + ' ' + className}>{children}</span>;
}
